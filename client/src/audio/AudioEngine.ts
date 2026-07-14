import * as Tone from 'tone';
import { intervalPaletteForPhase } from './orbitalTheory';
import type { CrossingTriggerParams, OrbitalParams } from '../types';

export type MixLayer = 'drone' | 'crossing' | 'beacon';

const DRONE_ROOT_HZ = 49; // a deep, weightless sub-drone root
const MAX_DRONE_LAYERS = 6; // matches orbital/crewCensus.ts's layer cap — one voice per person in space
const DRONE_BASE_GAIN = 0.5;
const BEACON_NOTE_HZ = 880; // A5 — a small, delicate telemetry blip

const DEFAULT_PARAMS: OrbitalParams = {
  droneDensity: 0.3,
  layerCount: 1,
  brightness: 0.6,
  filterCutoffHz: 1800,
  filterResonance: 1,
  driftRate: 0.08,
  rootSemitone: 0,
  warmth: 0.5,
  vignette: 0.4,
  state: 'day',
  orbitalPhase: 0,
};

/**
 * The synthesis engine: a bank of oscillator drone layers — one active
 * voice per person currently in space — plus two discrete events: a slow
 * multi-second swell exactly at a sunrise/sunset terminator crossing, and a
 * soft, brief "beacon" ping each time a fresh telemetry sample actually
 * arrives from Open Notify. Everything here is oscillators, filters, and
 * envelopes via the Web Audio API; there is no sample playback anywhere.
 */
export class AudioEngine {
  private params: OrbitalParams = DEFAULT_PARAMS;
  private started = false;
  private built = false;
  private mixLevels: Record<MixLayer, number> = { drone: 1, crossing: 1, beacon: 0.6 };

  private master!: Tone.Gain;
  private analyser!: Tone.Analyser;
  private reverb!: Tone.Reverb;

  // Drone
  private droneMaster!: Tone.Gain;
  private droneFilter!: Tone.Filter;
  private driftLfo!: Tone.Tremolo;
  private oscA: Tone.Oscillator[] = []; // warm fundamental per layer
  private oscB: Tone.Oscillator[] = []; // soft overtone partial per layer
  private layerGains: Tone.Gain[] = [];
  private overtoneGains: Tone.Gain[] = [];

  // Terminator crossing swell
  private crossingSynth!: Tone.Synth;
  private crossingFilter!: Tone.Filter;

  // Telemetry heartbeat
  private beaconSynth!: Tone.Synth;
  private beaconFilter!: Tone.Filter;

  private recordingDestination?: MediaStreamAudioDestinationNode;

  /** Builds the audio graph. Safe to call before Tone.start() — nodes just sit silent. */
  private build() {
    if (this.built) return;
    this.built = true;

    this.master = new Tone.Gain(0.85).toDestination();
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.master.connect(this.analyser);

    // A long, spacious reverb — this is meant to feel suspended, not close.
    this.reverb = new Tone.Reverb({ decay: 9, wet: 0.35, preDelay: 0.04 });
    this.reverb.connect(this.master);

    // --- Drone layer ---
    this.droneFilter = new Tone.Filter({ frequency: DEFAULT_PARAMS.filterCutoffHz, type: 'lowpass', rolloff: -24, Q: DEFAULT_PARAMS.filterResonance });
    this.droneFilter.connect(this.reverb);

    this.driftLfo = new Tone.Tremolo({ frequency: DEFAULT_PARAMS.driftRate, depth: 0.3 }).connect(this.droneFilter);
    this.driftLfo.start();

    this.droneMaster = new Tone.Gain(0).connect(this.driftLfo);

    for (let i = 0; i < MAX_DRONE_LAYERS; i++) {
      const layerGain = new Tone.Gain(0).connect(this.droneMaster);
      const overtoneGain = new Tone.Gain(0).connect(layerGain);

      const warm = new Tone.Oscillator({ frequency: DRONE_ROOT_HZ, type: 'sine' });
      warm.connect(layerGain);
      warm.start();

      // A softer partial-rich waveform than Fault-Line's metallic square4 —
      // this is meant to shimmer gently, not clang.
      const soft = new Tone.Oscillator({ frequency: DRONE_ROOT_HZ * 2, type: 'triangle6' });
      soft.connect(overtoneGain);
      soft.start();

      this.oscA.push(warm);
      this.oscB.push(soft);
      this.layerGains.push(layerGain);
      this.overtoneGains.push(overtoneGain);
    }

    // --- Terminator crossing: a slow multi-second swell, not a click ---
    this.crossingFilter = new Tone.Filter({ frequency: 1800, type: 'lowpass', rolloff: -12 });
    this.crossingFilter.connect(this.reverb);
    this.crossingSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 2.2, decay: 1.5, sustain: 0.25, release: 6 },
    });
    this.crossingSynth.connect(this.crossingFilter);

    // --- Telemetry heartbeat: a soft, brief beacon ping ---
    this.beaconFilter = new Tone.Filter({ frequency: 2200, type: 'highpass', rolloff: -12 });
    this.beaconFilter.connect(this.reverb);
    this.beaconSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.004, decay: 0.3, sustain: 0, release: 0.4 },
    });
    this.beaconSynth.connect(this.beaconFilter);

    this.applyDroneParams(this.params);
  }

  async start() {
    this.build();
    if (this.started) return;
    await Tone.start();
    this.started = true;
  }

  stop() {
    this.started = false;
  }

  isStarted() {
    return this.started;
  }

  getAnalyser(): Tone.Analyser | null {
    return this.built ? this.analyser : null;
  }

  setMasterVolume(linear01: number) {
    if (!this.built) return;
    this.master.gain.rampTo(Math.max(0, Math.min(1, linear01)), 0.2);
  }

  /** Per-layer mix control (drone / crossing / beacon), independent of the live telemetry-driven mapping. */
  setMixLevel(layer: MixLayer, level: number) {
    this.mixLevels[layer] = Math.max(0, Math.min(1.5, level));
    if (layer === 'drone' && this.built) {
      this.droneMaster.gain.rampTo(this.params.droneDensity * DRONE_BASE_GAIN * this.mixLevels.drone, 0.3);
    }
  }

  /** Taps the master bus into a MediaStreamAudioDestinationNode so the live output can be recorded with MediaRecorder. */
  getRecordingStream(): MediaStream | null {
    if (!this.built) return null;
    if (!this.recordingDestination) {
      const rawContext = Tone.getContext().rawContext as unknown as AudioContext;
      this.recordingDestination = rawContext.createMediaStreamDestination();
      this.master.connect(this.recordingDestination);
    }
    return this.recordingDestination.stream;
  }

  /** Continuously reshapes the background drone from the resolved telemetry params. Never restarts anything. */
  updateDroneParams(params: OrbitalParams) {
    this.params = params;
    if (!this.built) return;
    this.applyDroneParams(params);
  }

  private applyDroneParams(params: OrbitalParams) {
    this.droneFilter.frequency.rampTo(params.filterCutoffHz, 4);
    this.droneFilter.Q.rampTo(params.filterResonance, 4);
    this.driftLfo.frequency.rampTo(Math.max(0.01, params.driftRate), 3);
    this.droneMaster.gain.rampTo(params.droneDensity * DRONE_BASE_GAIN * this.mixLevels.drone, 4);
    // Over ocean (lower warmth) reads more diffuse/reverberant — "lost in space" rather than grounded.
    this.reverb.wet.rampTo(0.3 + (1 - params.warmth) * 0.3, 4);

    const intervals = intervalPaletteForPhase(params.orbitalPhase);
    const detuneSpread = 5 + (1 - params.warmth) * 22;

    for (let i = 0; i < MAX_DRONE_LAYERS; i++) {
      const active = i < params.layerCount;
      const target = active ? 1 / params.layerCount : 0;
      this.layerGains[i].gain.rampTo(target, 5);
      this.overtoneGains[i].gain.rampTo(active ? params.brightness * 0.5 : 0, 4);

      const semitoneIndex = i % intervals.length;
      const octaveBump = Math.floor(i / intervals.length) * 12;
      const semitone = intervals[semitoneIndex] + octaveBump + params.rootSemitone;
      const freq = DRONE_ROOT_HZ * Math.pow(2, semitone / 12);

      this.oscA[i].frequency.rampTo(freq, 6);
      this.oscA[i].detune.rampTo((i - Math.floor(MAX_DRONE_LAYERS / 2)) * detuneSpread, 6);
      this.oscB[i].frequency.rampTo(freq * 2.004, 6); // slightly detuned octave partial for shimmer/beating
    }
  }

  /**
   * Fires the slow terminator-crossing swell: sunrise reads bright and
   * open (a higher-cutoff filter), sunset reads low and settling. Unlike
   * Fault-Line's instantaneous P/S onset, this is deliberately a multi-second
   * event — the crew doesn't experience a sunrise as a click either.
   */
  triggerCrossing(trigger: CrossingTriggerParams) {
    if (!this.built || !this.started) return;
    const now = Tone.now();
    const cutoff = trigger.direction === 'sunrise' ? 3200 : 900;
    this.crossingFilter.frequency.rampTo(cutoff, 3, now);
    this.crossingSynth.volume.value = Tone.gainToDb(Math.max(0.03, trigger.amplitude * this.mixLevels.crossing));
    this.crossingSynth.triggerAttackRelease(trigger.toneHz, 7, now);
  }

  /** Fires a soft, brief ping exactly when a fresh telemetry sample arrives from the server — an audible data heartbeat. */
  triggerBeacon() {
    if (!this.built || !this.started) return;
    const now = Tone.now();
    this.beaconSynth.volume.value = Tone.gainToDb(Math.max(0.008, 0.1 * this.mixLevels.beacon));
    this.beaconSynth.triggerAttackRelease(BEACON_NOTE_HZ, '16n', now);
  }

  dispose() {
    this.stop();
    if (!this.built) return;
    if (this.recordingDestination) {
      this.master.disconnect(this.recordingDestination);
      this.recordingDestination = undefined;
    }
    [
      this.master, this.analyser, this.reverb,
      this.droneMaster, this.droneFilter, this.driftLfo,
      ...this.oscA, ...this.oscB, ...this.layerGains, ...this.overtoneGains,
      this.crossingSynth, this.crossingFilter, this.beaconSynth, this.beaconFilter,
    ].forEach((node) => node?.dispose());
    this.built = false;
  }
}
