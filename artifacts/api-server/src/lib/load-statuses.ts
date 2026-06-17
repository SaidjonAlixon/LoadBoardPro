export const DISPATCHER_LOCK_STATUS = "Checked" as const;

export function isLoadDispatcherLocked(status: string): boolean {
  return status === DISPATCHER_LOCK_STATUS;
}
