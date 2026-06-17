export const DISPATCHER_LOAD_STATUSES = [
  "Booked",
  "InQM",
  "Delivered",
  "Canceled",
  "Completed",
  "NeedRevRC",
  "Issue",
] as const;

export const ACCOUNTING_LOAD_STATUSES = [
  "Checked",
  "Invoiced",
  "Reinvoiced",
  "BrokerPaid",
] as const;

export const DISPATCHER_LOCK_STATUS = "Checked" as const;

export type DispatcherLoadStatus = (typeof DISPATCHER_LOAD_STATUSES)[number];
export type AccountingLoadStatus = (typeof ACCOUNTING_LOAD_STATUSES)[number];
export type LoadStatusValue = DispatcherLoadStatus | AccountingLoadStatus;

export const ALL_LOAD_STATUSES = [
  ...DISPATCHER_LOAD_STATUSES,
  ...ACCOUNTING_LOAD_STATUSES,
] as const;

/** Map legacy DB/API values to the current status set. */
export function normalizeLoadStatus(status: string): string {
  if (status === "PickedUp") return "InQM";
  return status;
}

/** When Checked, only accounting may edit the load until status changes. */
export function isLoadDispatcherLocked(status: string): boolean {
  return normalizeLoadStatus(status) === DISPATCHER_LOCK_STATUS;
}

export function getStatusOptionsForRole(role: string): readonly string[] {
  if (role === "accounting" || role === "admin") return ALL_LOAD_STATUSES;
  return DISPATCHER_LOAD_STATUSES;
}

export const ACTIVE_DRIVER_STATUSES: DispatcherLoadStatus[] = [
  "Booked",
  "InQM",
  "NeedRevRC",
  "Issue",
];

export const DELIVERED_STATUSES: DispatcherLoadStatus[] = ["Delivered", "Completed"];
