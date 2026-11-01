/** A short "how long ago" label for a telemetry sample's timestamp, e.g. "3s ago", "2m ago", "5h ago". */
export function formatRelativeTime(timeMs: number, nowMs: number = Date.now()): string {
  const deltaMs = Math.max(0, nowMs - timeMs);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A short countdown label for a duration in ms, e.g. "42s", "12m", "1h 05m", used for the predicted next-crossing ETA. */
export function formatDurationShort(deltaMs: number): string {
  const totalSeconds = Math.max(0, Math.round(deltaMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${String(remMinutes).padStart(2, '0')}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** "Today", "Tomorrow", or a short weekday ("Wed") for a future timestamp, relative to local midnight. */
export function formatDayLabel(timeMs: number, nowMs: number = Date.now()): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayDiff = Math.round((startOfDay(timeMs) - startOfDay(nowMs)) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return new Date(timeMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A local clock time like "19:42" (or "7:42 PM", per the browser's locale). */
export function formatClockTime(timeMs: number): string {
  return new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
