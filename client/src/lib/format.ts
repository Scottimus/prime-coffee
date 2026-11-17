export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function elapsed(fromIso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export const duration = (secs: number | null) =>
  secs == null ? '—' : secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;

export const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';

export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
