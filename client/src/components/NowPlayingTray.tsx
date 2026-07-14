import type { CSSProperties, Ref } from 'react';
import type * as Tone from 'tone';
import type { OrbitalTelemetry, SolarState } from '../types';
import { Visualizer } from './Visualizer';

interface NowPlayingTrayProps {
  telemetry: OrbitalTelemetry;
  analyser: Tone.Analyser | null;
  started: boolean;
  onStart: () => void;
  onStop: () => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  isRecording: boolean;
  recordingUrl: string | null;
  recordingError: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  drawerToggleRef?: Ref<HTMLButtonElement>;
}

const STATE_LABEL: Record<SolarState, string> = {
  day: 'DAYLIGHT',
  night: 'NIGHT',
  twilight: 'TWILIGHT',
};

export function NowPlayingTray({
  telemetry, analyser, started, onStart, onStop,
  volume, onVolumeChange,
  isRecording, recordingUrl, recordingError, onStartRecording, onStopRecording,
  drawerOpen, onToggleDrawer, drawerToggleRef,
}: NowPlayingTrayProps) {
  const meta = [
    STATE_LABEL[telemetry.state],
    `CREW ${telemetry.crewCount > 0 ? telemetry.crewCount : '—'} ABOARD`,
    `OVER ${telemetry.country ? telemetry.country.toUpperCase() : 'OPEN OCEAN'}`,
  ].join(' · ');

  return (
    <div className="tray">
      <div className="tray-time">UMBRA</div>
      <div className="tray-meta">{meta}</div>

      <Visualizer analyser={analyser} active={started} />

      <div className="tray-row">
        <button
          className="tray-play"
          onClick={started ? onStop : onStart}
          aria-label={started ? 'Stop' : 'Start'}
        >
          {started ? '■' : '▶'}
        </button>

        <input
          type="range"
          className="hud-range tray-volume"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ '--val': volume } as CSSProperties}
          aria-label="Volume"
        />

        <button
          className={`tray-dot${isRecording ? ' tray-dot--live' : ''}`}
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={!started}
          aria-label={isRecording ? 'Stop recording' : 'Record'}
          title={isRecording ? 'Stop recording' : 'Record'}
        >
          ●
        </button>

        {recordingUrl && (
          <a
            className="tray-download"
            href={recordingUrl}
            download={`umbra-session-${Date.now()}.webm`}
            aria-label="Download recording"
            title="Download recording"
          >
            ⬇
          </a>
        )}

        <button
          ref={drawerToggleRef}
          className={`tray-drawer-toggle${drawerOpen ? ' tray-drawer-toggle--open' : ''}`}
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Close telemetry panel' : 'Open telemetry panel'}
          aria-expanded={drawerOpen}
          title="Telemetry"
        >
          {drawerOpen ? '✕' : '⚙'}
        </button>
      </div>

      {recordingError && <div className="tray-error">{recordingError}</div>}
    </div>
  );
}
