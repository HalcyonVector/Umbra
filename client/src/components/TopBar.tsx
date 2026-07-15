interface TopBarProps {
  nowMs: number;
  onExportMap: () => void;
  exporting: boolean;
  exportError: string | null;
}

function formatUtcClock(nowMs: number): string {
  const d = new Date(nowMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8" />
      <path d="M4.5 6.5 8 10l3.5-3.5" />
      <path d="M2.5 12.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" />
    </svg>
  );
}

/** The permanent instrument-shell header: identity, live-feed status, mission clock, and the one global action (export). */
export function TopBar({ nowMs, onExportMap, exporting, exportError }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="wordmark">UMBRA</div>
      <div className="live-status">
        <span className="live-dot" aria-hidden="true"></span>
        LIVE &middot; OPEN NOTIFY
      </div>
      <div className="topbar-clock">
        UTC <b className="num">{formatUtcClock(nowMs)}</b>
      </div>
      <button className="topbar-export" onClick={onExportMap} disabled={exporting} aria-label="Export the map as a PNG image" title="Export map">
        <ExportIcon />
      </button>
      {exportError && <span className="topbar-error">{exportError}</span>}
    </div>
  );
}
