import type { Broker } from "@workspace/api-client-react";
import { createBroker, listBrokers } from "@workspace/api-client-react";

/** Find broker by name (case-insensitive) or create a new one. */
export async function resolveBrokerIdByName(
  name: string,
  knownBrokers?: Broker[],
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const brokers = knownBrokers ?? (await listBrokers());
  const existing = brokers.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;

  const created = await createBroker({ name: trimmed });
  return created.id;
}
