import { describe, it, expect } from 'vitest';
import { mapTelemetryToParams, mapCrossingToTriggerParams, resolveSolarState, type TelemetryInput } from './parameterMapping';

const BASE: TelemetryInput = {
  isDaylight: true,
  terminatorProximity: 0,
  crewCount: 4,
  groundSpeedKmh: 27000,
  overLand: false,
  orbitalPhase: 0,
};

describe('resolveSolarState', () => {
  it('is day when daylight and far from the terminator', () => {
    expect(resolveSolarState(true, 0)).toBe('day');
  });

  it('is night when dark and far from the terminator', () => {
    expect(resolveSolarState(false, 0)).toBe('night');
  });

  it('is twilight when close to the terminator regardless of the isDaylight flag', () => {
    expect(resolveSolarState(true, 0.9)).toBe('twilight');
    expect(resolveSolarState(false, 0.9)).toBe('twilight');
  });
});

describe('mapTelemetryToParams', () => {
  it('reads brighter by day than by night at the same terminator proximity', () => {
    const day = mapTelemetryToParams({ ...BASE, isDaylight: true, terminatorProximity: 0.1 });
    const night = mapTelemetryToParams({ ...BASE, isDaylight: false, terminatorProximity: 0.1 });
    expect(day.brightness).toBeGreaterThan(night.brightness);
    expect(day.filterCutoffHz).toBeGreaterThan(night.filterCutoffHz);
    expect(day.state).toBe('day');
    expect(night.state).toBe('night');
  });

  it('layerCount tracks crew count directly (the sonic census)', () => {
    const solo = mapTelemetryToParams({ ...BASE, crewCount: 1 });
    const full = mapTelemetryToParams({ ...BASE, crewCount: 6 });
    expect(full.layerCount).toBeGreaterThan(solo.layerCount);
  });

  it('reads warmer/denser over land than over ocean, all else equal', () => {
    const overLand = mapTelemetryToParams({ ...BASE, overLand: true });
    const overOcean = mapTelemetryToParams({ ...BASE, overLand: false });
    expect(overLand.droneDensity).toBeGreaterThan(overOcean.droneDensity);
    expect(overLand.warmth).toBeGreaterThanOrEqual(overOcean.warmth);
  });

  it('rootSemitone follows the orbital phase, not the day/night state', () => {
    const a = mapTelemetryToParams({ ...BASE, orbitalPhase: 0.25 });
    const b = mapTelemetryToParams({ ...BASE, orbitalPhase: 0.75 });
    expect(a.rootSemitone).not.toBeCloseTo(b.rootSemitone, 1);
  });

  it('tolerates a null ground speed (no plausible sample yet) without throwing', () => {
    expect(() => mapTelemetryToParams({ ...BASE, groundSpeedKmh: null })).not.toThrow();
    const params = mapTelemetryToParams({ ...BASE, groundSpeedKmh: null });
    expect(params.driftRate).toBeGreaterThanOrEqual(0);
  });

  it('every 0..1 field stays within range across a spread of inputs', () => {
    for (let proximity = 0; proximity <= 1; proximity += 0.25) {
      for (const crewCount of [0, 3, 11]) {
        const params = mapTelemetryToParams({ ...BASE, terminatorProximity: proximity, crewCount });
        expect(params.droneDensity).toBeGreaterThanOrEqual(0);
        expect(params.droneDensity).toBeLessThanOrEqual(1);
        expect(params.brightness).toBeGreaterThanOrEqual(0);
        expect(params.brightness).toBeLessThanOrEqual(1);
        expect(params.layerCount).toBeGreaterThanOrEqual(1);
        expect(params.layerCount).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('mapCrossingToTriggerParams', () => {
  it('sunrise is voiced an octave above sunset', () => {
    const sunrise = mapCrossingToTriggerParams('sunrise');
    const sunset = mapCrossingToTriggerParams('sunset');
    expect(sunrise.toneHz).toBeCloseTo(sunset.toneHz * 2, 0);
    expect(sunrise.direction).toBe('sunrise');
    expect(sunset.direction).toBe('sunset');
  });
});
