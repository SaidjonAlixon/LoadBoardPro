import { logger } from "./logger";
import { processScheduledAndRolloverLocks } from "./week-lock-access";

const INTERVAL_MS = 15_000;

export function startWeekLockJob(): void {
  const run = async () => {
    try {
      await processScheduledAndRolloverLocks();
    } catch (err) {
      logger.warn({ err }, "Week lock job failed");
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, INTERVAL_MS);
}
