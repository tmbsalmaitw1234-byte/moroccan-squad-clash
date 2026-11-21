import { useSyncExternalStore } from 'react';
import { server } from './engine/instance';
import { ServerError } from './engine/errors';
import { Match, Squad } from './types';

export function useTournament() {
  const snap = useSyncExternalStore(server.subscribe, server.getSnapshot);
  const { state, me } = snap;
  const squad = (id?: string): Squad | undefined => state.squads.find((q) => q.id === id);
  const user = (id?: string) => state.users.find((u) => u.id === id);
  const matchByNumber = (n: number): Match | undefined => state.matches.find((m) => m.number === n);
  return { state, me, squad, user, matchByNumber, server, mode: snap.mode, status: snap.status, error: snap.error, authed: snap.authed };
}

type Toast = { id: number; kind: 'ok' | 'err'; text: string };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
export function pushToast(kind: Toast['kind'], text: string) {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, kind, text }];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, 4200);
}
export function useToasts() {
  return useSyncExternalStore(
    (l) => { toastListeners.add(l); return () => toastListeners.delete(l); },
    () => toasts,
  );
}

/**
 * Runs a server action (sync in demo mode, async with Supabase), shows a toast
 * on success or a readable error, and resolves to the result — or undefined on failure.
 */
export async function act<T>(fn: () => T | Promise<T>, okText?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okText) pushToast('ok', okText);
    return r;
  } catch (e) {
    pushToast('err', e instanceof ServerError ? e.message : `Unexpected error: ${(e as Error).message}`);
    return undefined;
  }
}

/** Like act, but resolves true/false — handy for clearing a form only on success. */
export async function attempt(fn: () => unknown, okText?: string): Promise<boolean> {
  const marker = {};
  const r = await act(async () => { await fn(); return marker; }, okText);
  return r === marker;
}
