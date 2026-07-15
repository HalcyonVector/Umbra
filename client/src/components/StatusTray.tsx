import type { Ref } from 'react';
import type { OrbitalTelemetry, SolarState } from '../types';

interface StatusTrayProps {
  telemetry: OrbitalTelemetry;
  solarState: SolarState;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onExportMap: () => void;
  exporting: boolean;
  exportError: string | null;
  drawerToggleRef?: Ref<HTMLButtonElement>;
}

const STATE_LABEL: Record<SolarState, string> = {
  day: 'DAYLIGHT',
  night: 'NIGHT',
  twilight: 'TWILIGHT',
};

export function StatusTray({ telemetry, solarState, drawerOpen, onToggleDrawer, onExportMap, exporting, exportError, drawerToggleRef }: StatusTrayProps) {
  const meta = [
    STATE_LABEL[solarState],
    `CREW ${telemetry.crewCount > 0 ? telemetry.crewCount : '—'} ABOARD`,
    `OVER ${telemetry.country ? telemetry.country.toUpperCase() : 'OPEN OCEAN'}`,
  ].join(' · ');

  return (
    <div className="tray">
      <div className="tray-time">UMBRA</div>
      <div className="tray-meta">{meta}</div>

      <div className="tray-row">
        <button className="export-btn" onClick={onExportMap} disabled={exporting} aria-label="Export the map as a PNG image">
          {exporting ? 'Exporting…' : '⬇ Export map'}
        </button>

        <button
          ref={drawerToggleRef}
          className={`tray-drawer-toggle${drawerOpen ? ' tray-drawer-toggle--open' : ''}`}
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? 'Close Mission Control' : 'Open Mission Control'}
          aria-expanded={drawerOpen}
          title="Mission Control"
        >
          {drawerOpen ? '✕' : '⚙'}
        </button>
      </div>

      {exportError && <div className="tray-error">{exportError}</div>}
    </div>
  );
}
