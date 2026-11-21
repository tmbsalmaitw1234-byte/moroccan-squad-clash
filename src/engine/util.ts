export function uid(prefix = 'id'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** Deterministic PRNG (mulberry32) so demo data is stable between reloads. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const TZ = '+01:00'; // Morocco (Africa/Casablanca) standard offset

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Casablanca',
    day: 'numeric',
    month: 'short',
    ...opts,
  });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Casablanca',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateTime(iso: string) {
  return `${fmtDate(iso, { weekday: 'short' })} · ${fmtTime(iso)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function sum(ns: number[]) {
  return ns.reduce((a, b) => a + b, 0);
}

export function fmtNum(n: number) {
  return n.toLocaleString('en-US');
}
