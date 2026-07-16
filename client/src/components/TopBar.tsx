interface TopBarProps {
  nowMs: number;
  consecutiveFailures: number;
  lastFixMs: number | null;
}

function formatUtcClock(nowMs: number): string {
  const d = new Date(nowMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatAgo(nowMs: number, sinceMs: number): string {
  const sec = Math.max(0, Math.round((nowMs - sinceMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

/** The permanent instrument-shell header: identity, the mission clock, and — only when the feed is actually degraded — a signal-loss notice. */
export function TopBar({ nowMs, consecutiveFailures, lastFixMs }: TopBarProps) {
  const signalLost = consecutiveFailures > 0;
  return (
    <div className="topbar">
      <div className="wordmark">UMBRA</div>
      {signalLost && (
        <div className="topbar-signal" title="The ISS position feed is not responding. Retrying automatically.">
          SIGNAL LOST · {lastFixMs !== null ? `last fix ${formatAgo(nowMs, lastFixMs)}` : 'retrying…'}
        </div>
      )}
      <div className="topbar-clock">
        UTC <b className="num">{formatUtcClock(nowMs)}</b>
      </div>
    </div>
  );
}
