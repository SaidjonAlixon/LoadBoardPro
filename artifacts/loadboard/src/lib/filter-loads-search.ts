import type { Driver, Load } from "@workspace/api-client-react";

/** Client-side search: load #, cities, driver name, broker, truck #, dispatch notes. */
export function filterLoadsBySearch(
  loads: Load[],
  query: string,
  drivers: Driver[] = [],
): Load[] {
  const q = query.trim().toLowerCase();
  if (!q) return loads;

  const driverById = new Map(drivers.map((d) => [d.id, d]));

  return loads.filter((l) => {
    const driver = l.driver ?? (l.driverId ? driverById.get(l.driverId) : undefined);
    const driverName = driver?.fullName?.toLowerCase() ?? "";
    const truck = driver?.truckNumber?.toLowerCase() ?? "";

    return (
      l.loadNumber?.toLowerCase().includes(q)
      || l.originCity?.toLowerCase().includes(q)
      || l.destCity?.toLowerCase().includes(q)
      || driverName.includes(q)
      || truck.includes(q)
      || l.broker?.name?.toLowerCase().includes(q)
      || l.dispatchNotes?.toLowerCase().includes(q)
      || l.dispatcher?.name?.toLowerCase().includes(q)
      || (l.dispatcher as { nickname?: string } | undefined)?.nickname?.toLowerCase().includes(q)
    );
  });
}
