export const DRIVER_BOARD_STATUSES = [
  "Ready",
  "Covered",
  "Deadhead",
  "AtPickUp",
  "InTransit",
  "AtDelivery",
  "TruckIssue",
  "Sleep",
  "Home",
] as const;

export type DriverBoardStatus = (typeof DRIVER_BOARD_STATUSES)[number];

export const DRIVER_BOARD_STATUS_I18N: Record<DriverBoardStatus, string> = {
  Ready: "statusboard.ready",
  Covered: "statusboard.covered",
  Deadhead: "statusboard.deadhead",
  AtPickUp: "statusboard.atPickup",
  InTransit: "statusboard.inTransit",
  AtDelivery: "statusboard.atDelivery",
  TruckIssue: "statusboard.truckIssue",
  Sleep: "statusboard.sleep",
  Home: "statusboard.home",
};

export const DRIVER_BOARD_STATUS_COLORS: Record<
  DriverBoardStatus,
  { bg: string; text: string; border: string }
> = {
  Ready: { bg: "#FFCDD2", text: "#B71C1C", border: "#E57373" },
  Covered: { bg: "#C6EFCE", text: "#1B5E20", border: "#81C784" },
  Deadhead: { bg: "#E3F2FD", text: "#1565C0", border: "#90CAF9" },
  AtPickUp: { bg: "#FFE0B2", text: "#E65100", border: "#FFB74D" },
  InTransit: { bg: "#B3E5FC", text: "#01579B", border: "#4FC3F7" },
  AtDelivery: { bg: "#E1BEE7", text: "#6A1B9A", border: "#CE93D8" },
  TruckIssue: { bg: "#FFAB91", text: "#BF360C", border: "#FF8A65" },
  Sleep: { bg: "#CFD8DC", text: "#37474F", border: "#90A4AE" },
  Home: { bg: "#F8BBD0", text: "#880E4F", border: "#F48FB1" },
};

export const DRIVER_BOARD_STATUS_STYLES: Record<DriverBoardStatus, string> = {
  Ready: "bg-[#FFCDD2] text-[#B71C1C] border-[#E57373] dark:bg-red-950/50 dark:text-red-200 dark:border-red-800",
  Covered: "bg-[#C6EFCE] text-[#1B5E20] border-[#81C784] dark:bg-green-950/50 dark:text-green-200 dark:border-green-800",
  Deadhead: "bg-[#E3F2FD] text-[#1565C0] border-[#90CAF9] dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  AtPickUp: "bg-[#FFE0B2] text-[#E65100] border-[#FFB74D] dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800",
  InTransit: "bg-[#B3E5FC] text-[#01579B] border-[#4FC3F7] dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800",
  AtDelivery: "bg-[#E1BEE7] text-[#6A1B9A] border-[#CE93D8] dark:bg-purple-950/50 dark:text-purple-200 dark:border-purple-800",
  TruckIssue: "bg-[#FFAB91] text-[#BF360C] border-[#FF8A65] dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-700",
  Sleep: "bg-[#CFD8DC] text-[#37474F] border-[#90A4AE] dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-600",
  Home: "bg-[#F8BBD0] text-[#880E4F] border-[#F48FB1] dark:bg-pink-950/50 dark:text-pink-200 dark:border-pink-800",
};

export function isDriverBoardStatus(value: string): value is DriverBoardStatus {
  return (DRIVER_BOARD_STATUSES as readonly string[]).includes(value);
}

export function resolveDriverBoardStatus(status?: string | null): DriverBoardStatus {
  if (status && isDriverBoardStatus(status)) return status;
  return "Ready";
}
