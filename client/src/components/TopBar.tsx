interface TopBarProps {
  nowMs: number;
}

function formatUtcClock(nowMs: number): string {
  const d = new Date(nowMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** The permanent instrument-shell header: identity and the mission clock. */
export function TopBar({ nowMs }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="wordmark">UMBRA</div>
      <div className="topbar-clock">
        UTC <b className="num">{formatUtcClock(nowMs)}</b>
      </div>
    </div>
  );
}
