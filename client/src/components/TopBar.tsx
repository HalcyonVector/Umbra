import { formatRelativeTime } from '../lib/formatTime';

interface TopBarProps {
  nowMs: number;
  consecutiveFailures: number;
  lastFixMs: number | null;
  source: string | null;
  onShowHelp: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatUtcClock(nowMs: number): string {
  const d = new Date(nowMs);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function formatLocalClock(nowMs: number): string {
  const d = new Date(nowMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const SOURCE_LABEL: Record<string, string> = {
  'wheretheiss.at': 'wheretheiss.at',
  'open-notify': 'Open Notify',
};

function LogoMark() {
  return (
    <svg className="brand-mark" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <path d="M16 7a9 9 0 0 1 0 18" fill="currentColor" opacity="0.25" />
      <ellipse cx="16" cy="16" rx="14" ry="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" transform="rotate(-28 16 16)" />
      <circle cx="27.4" cy="10" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Floating header: brand, live feed status, local and UTC clocks, and a help button that replays the intro. */
export function TopBar({ nowMs, consecutiveFailures, lastFixMs, source, onShowHelp }: TopBarProps) {
  const signalLost = consecutiveFailures > 1;
  const waiting = lastFixMs === null && !signalLost;

  let statusClass = 'status-pill status-pill--live';
  let statusText = `Live${source ? ` via ${SOURCE_LABEL[source] ?? source}` : ''}`;
  if (signalLost) {
    statusClass = 'status-pill status-pill--lost';
    statusText = lastFixMs !== null ? `Signal lost, last fix ${formatRelativeTime(lastFixMs, nowMs)}` : 'Feed unreachable, retrying';
  } else if (waiting) {
    statusClass = 'status-pill status-pill--waiting';
    statusText = 'Acquiring signal';
  }

  return (
    <header className="topbar glass">
      <div className="brand">
        <LogoMark />
        <div className="brand-text">
          <span className="brand-name">Umbra</span>
          <span className="brand-sub">Live ISS tracker and pass predictor</span>
        </div>
      </div>

      <div className={statusClass} role="status" title="Position feed status">
        <span className="status-dot" aria-hidden="true" />
        {statusText}
      </div>

      <div className="topbar-right">
        <div className="clock">
          <span className="clock-label">Local</span>
          <span className="num">{formatLocalClock(nowMs)}</span>
        </div>
        <div className="clock">
          <span className="clock-label">UTC</span>
          <span className="num">{formatUtcClock(nowMs)}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onShowHelp} aria-label="How Umbra works" title="How Umbra works">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4" />
            <circle cx="8" cy="11.6" r="0.4" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
