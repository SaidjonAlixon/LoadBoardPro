import type { DriverTodayBlock, DispatcherDriverGroup } from "@/lib/drivers-today";
import { isPlaceholderCity } from "@/lib/validate-dispatcher-load";

type StatusBoardLoad = DriverTodayBlock["loads"][number];

export function loadsForStatusboardSection(
  block: DriverTodayBlock,
  sectionDispatcherId: string | null,
  groupByDispatcher: boolean,
): Array<StatusBoardLoad | null> {
  if (!block.loads.length) {
    if (groupByDispatcher && sectionDispatcherId === null) return [null];
    return [];
  }

  let scoped = block.loads;
  if (groupByDispatcher) {
    if (sectionDispatcherId === null) {
      scoped = block.loads.filter((l) => !l.dispatcherId);
    } else {
      scoped = block.loads;
    }
    if (!scoped.length) {
      if (sectionDispatcherId === null) return [null];
      return [];
    }
  }

  return [...scoped].sort((a, b) => {
    const aDate = a.puDate ?? "";
    const bDate = b.puDate ?? "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return (a.loadNumber ?? "").localeCompare(b.loadNumber ?? "");
  });
}

/** Unique drivers that have at least one row on the status board. */
export function collectStatusboardVisibleDrivers(
  sections: DispatcherDriverGroup[],
  groupByDispatcher: boolean,
): DriverTodayBlock[] {
  const seen = new Map<string, DriverTodayBlock>();
  for (const section of sections) {
    for (const block of section.drivers) {
      const loads = loadsForStatusboardSection(
        block,
        section.dispatcherId,
        groupByDispatcher,
      );
      if (!loads.length) continue;
      if (!seen.has(block.driver.id)) seen.set(block.driver.id, block);
    }
  }
  return [...seen.values()];
}

export function countStatusboardVisibleRows(
  sections: DispatcherDriverGroup[],
  groupByDispatcher: boolean,
  removedLoadIds?: Set<string>,
): { drivers: number; rows: number } {
  const driverIds = new Set<string>();
  let rows = 0;
  for (const section of sections) {
    for (const { block, load } of buildStatusBoardSectionRows(
      section.drivers,
      section.dispatcherId,
      groupByDispatcher,
      loadsForStatusboardSection,
    )) {
      if (load != null && load.id && removedLoadIds?.has(load.id)) continue;
      rows += 1;
      driverIds.add(block.driver.id);
    }
  }
  return { drivers: driverIds.size, rows };
}

/** Status-board row still on factory defaults — show NEW styling until edited. */
export function isStatusBoardNewLoad(load: {
  statusBoardOnly?: boolean | null;
  loadNumber?: string | null;
  originCity?: string | null;
  destCity?: string | null;
  mileage?: number | null;
  rate?: number | null;
} | null | undefined): boolean {
  if (!load?.statusBoardOnly) return false;
  if (!/^NEW-/i.test(load.loadNumber ?? "")) return false;
  if (!isPlaceholderCity(load.originCity) || !isPlaceholderCity(load.destCity)) return false;
  if (load.mileage != null && load.mileage !== 1) return false;
  if (load.rate != null && load.rate !== 1) return false;
  return true;
}

export type StatusBoardSectionRow = {
  block: DriverTodayBlock;
  load: StatusBoardLoad | null;
};

export function buildStatusBoardSectionRows(
  drivers: DriverTodayBlock[],
  sectionDispatcherId: string | null,
  groupByDispatcher: boolean,
  loadsForSection: (
    block: DriverTodayBlock,
    sectionDispatcherId: string | null,
    groupByDispatcher: boolean,
  ) => Array<StatusBoardLoad | null>,
): StatusBoardSectionRow[] {
  const rows: StatusBoardSectionRow[] = [];
  for (const block of drivers) {
    for (const load of loadsForSection(block, sectionDispatcherId, groupByDispatcher)) {
      rows.push({ block, load });
    }
  }

  return rows.sort((a, b) => {
    const aNew = isStatusBoardNewLoad(a.load);
    const bNew = isStatusBoardNewLoad(b.load);
    if (aNew !== bNew) return aNew ? 1 : -1;

    const nameCmp = a.block.driver.fullName.localeCompare(b.block.driver.fullName);
    if (nameCmp !== 0) return nameCmp;

    if (!a.load && !b.load) return 0;
    if (!a.load) return -1;
    if (!b.load) return 1;

    const aDate = a.load.puDate ?? "";
    const bDate = b.load.puDate ?? "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    const aOrder = (a.load as { sortOrder?: number }).sortOrder ?? 0;
    const bOrder = (b.load as { sortOrder?: number }).sortOrder ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aCreated = (a.load as { createdAt?: string | null }).createdAt ?? "";
    const bCreated = (b.load as { createdAt?: string | null }).createdAt ?? "";
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

    return (a.load.loadNumber ?? "").localeCompare(b.load.loadNumber ?? "");
  });
}
