import { useEffect, useMemo, type UseQueryOptions } from "react";
import { useSyncExternalStore } from "react";

/** Background poll interval for live board sync (ms). */
export const LIVE_SYNC_MS = 3_000;

const pauseReasons = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return pauseReasons.size > 0;
}

/** Pause live sync while the user is editing or saves are in flight. */
export function setLiveSyncPauseReason(reason: string, paused: boolean) {
  const had = pauseReasons.has(reason);
  if (paused) {
    if (had) return;
    pauseReasons.add(reason);
  } else {
    if (!had) return;
    pauseReasons.delete(reason);
  }
  emit();
}

export function isLiveSyncPaused() {
  return pauseReasons.size > 0;
}

export function useLiveSyncPaused() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLiveSyncQueryOptions(): Pick<
  UseQueryOptions,
  "refetchInterval" | "refetchIntervalInBackground"
> {
  const paused = useLiveSyncPaused();
  return useMemo(
    () => ({
      refetchInterval: paused ? false : LIVE_SYNC_MS,
      refetchIntervalInBackground: true,
    }),
    [paused],
  );
}

/** Keep pause reasons in sync with a boolean guard. */
export function useLiveSyncPauseReason(reason: string, paused: boolean) {
  useEffect(() => {
    setLiveSyncPauseReason(reason, paused);
    return () => setLiveSyncPauseReason(reason, false);
  }, [reason, paused]);
}
