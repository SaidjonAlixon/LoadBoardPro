import app from "./app";
import { logger } from "./lib/logger";
import { backfillNicknames } from "./lib/backfill-nicknames";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  try {
    await backfillNicknames();
  } catch (backfillErr) {
    logger.warn({ err: backfillErr }, "Nickname backfill skipped or failed");
  }

  logger.info({ port }, "Server listening");
});
