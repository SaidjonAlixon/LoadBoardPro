import type { QueryClient } from "@tanstack/react-query";

/** Keep Drivers page and dashboard statusboard in sync after any driver change. */
export async function invalidateDriverQueries(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["/api/drivers"] }),
    qc.invalidateQueries({ queryKey: ["/api/analytics/drivers-today"] }),
  ]);
}
