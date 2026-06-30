import type { QueryClient } from "@tanstack/react-query";

/** Keep Drivers page, Loads board, and dashboard statusboard in sync after any driver/load change. */
export async function invalidateDriverQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["/api/drivers"], refetchType: "active" }),
    qc.invalidateQueries({ queryKey: ["/api/analytics/drivers-today"], refetchType: "active" }),
    qc.invalidateQueries({ queryKey: ["/api/loads"], refetchType: "active" }),
  ]);
}
