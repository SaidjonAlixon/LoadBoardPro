import type { Load, LoadUpdate } from "@workspace/api-client-react";

/** Broker, reimbursement, dispatch notes, and dispatcher are optional for dispatchers. */
export const DISPATCHER_OPTIONAL_LOAD_FIELDS = new Set([
  "brokerId",
  "reimbursement",
  "dispatchNotes",
  "dispatcherId",
]);

export type DispatcherLoadFieldKey =
  | "loadNumber"
  | "puDate"
  | "delDate"
  | "originCity"
  | "destCity"
  | "mileage"
  | "rate"
  | "reimbursement"
  | "status"
  | "dispatcherId";

export type SheetValidationField =
  | DispatcherLoadFieldKey
  | "origin"
  | "dest"
  | "broker"
  | "dispatchNotes";

export type LoadValidationOptions = {
  requireDispatcher?: boolean;
};

export const DISPATCHER_REQUIRED_FIELD_LABEL_KEYS: Record<DispatcherLoadFieldKey, string> = {
  loadNumber: "loads.loadNumber",
  puDate: "loads.pickupDate",
  delDate: "loads.deliveryDate",
  originCity: "loads.origin",
  destCity: "loads.destination",
  mileage: "loads.mileage",
  rate: "loads.rate",
  reimbursement: "loads.reimbursement",
  status: "loads.status",
  dispatcherId: "loads.dispatcher",
};

export function isPlaceholderCity(city?: string | null): boolean {
  const v = city?.trim();
  return !v || v === "-";
}

export function isDraftLoadNumber(loadNumber?: string | null): boolean {
  const v = loadNumber?.trim();
  return !v || v.startsWith("NEW-");
}

export function isDraftDateUnset(
  load: Pick<Load, "loadNumber">,
  field: "puDate" | "delDate",
  touched?: Set<string>,
): boolean {
  return isDispatcherDraftLoad(load) && !touched?.has(field);
}

export function isDraftDispatcherUnset(
  load: Pick<Load, "loadNumber">,
  touched?: Set<string>,
): boolean {
  return isDispatcherDraftLoad(load) && !touched?.has("dispatcherId");
}

export function isDispatcherDraftLoad(load: Pick<Load, "loadNumber">): boolean {
  return isDraftLoadNumber(load.loadNumber);
}

/** Row still being filled in the spreadsheet — allow partial saves. */
export function isLoadDraftInProgress(
  load: Pick<
    Load,
    | "loadNumber"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
  >,
): boolean {
  if (isDraftLoadNumber(load.loadNumber)) return true;
  if (isPlaceholderCity(load.originCity) || isPlaceholderCity(load.destCity)) return true;
  if (!load.mileage || Number(load.mileage) <= 0) return true;
  if (load.rate === undefined || load.rate === null || Number(load.rate) <= 0) return true;
  if (!load.puDate?.trim() || !load.delDate?.trim()) return true;
  return false;
}

export function getActiveDraftLoadId(
  loads: Pick<
    Load,
    | "id"
    | "loadNumber"
    | "createdAt"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
    | "reimbursement"
    | "status"
    | "dispatcherId"
  >[],
  touchedByLoad?: Map<string, Set<string>>,
  options?: LoadValidationOptions,
): string | null {
  const drafts = loads.filter((l) => !isDispatcherLoadComplete(l, touchedByLoad?.get(l.id), options));
  if (!drafts.length) return null;
  const latest = drafts.reduce((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt >= at ? b : a;
  });
  return latest.id;
}

export function getDispatcherLoadMissingFields(
  load: Pick<
    Load,
    | "loadNumber"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
    | "reimbursement"
    | "status"
    | "dispatcherId"
  >,
  touched?: Set<string>,
  options?: LoadValidationOptions,
): DispatcherLoadFieldKey[] {
  const missing: DispatcherLoadFieldKey[] = [];

  if (isDraftLoadNumber(load.loadNumber)) missing.push("loadNumber");
  if (!load.puDate?.trim()) missing.push("puDate");
  if (!load.delDate?.trim()) missing.push("delDate");
  if (isPlaceholderCity(load.originCity)) missing.push("originCity");
  if (isPlaceholderCity(load.destCity)) missing.push("destCity");
  if (!load.mileage || Number(load.mileage) <= 0) missing.push("mileage");
  if (load.rate === undefined || load.rate === null || Number(load.rate) <= 0) missing.push("rate");
  if (!load.status?.trim()) missing.push("status");

  return missing;
}

export function isDispatcherLoadComplete(
  load: Pick<
    Load,
    | "loadNumber"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
    | "reimbursement"
    | "status"
    | "dispatcherId"
  >,
  touched?: Set<string>,
  options?: LoadValidationOptions,
): boolean {
  return getDispatcherLoadMissingFields(load, touched, options).length === 0;
}

export function getDispatcherFieldValidation(
  load: Pick<
    Load,
    | "loadNumber"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
    | "reimbursement"
    | "status"
    | "dispatcherId"
  >,
  field: SheetValidationField,
  touched?: Set<string>,
  options?: LoadValidationOptions,
): "valid" | "invalid" | "neutral" {
  if (field === "broker" || field === "dispatchNotes" || field === "reimbursement" || field === "dispatcherId") {
    return "neutral";
  }

  const key =
    field === "origin"
      ? "originCity"
      : field === "dest"
        ? "destCity"
        : field;

  const missing = getDispatcherLoadMissingFields(load, touched, options);
  return missing.includes(key as DispatcherLoadFieldKey) ? "invalid" : "neutral";
}

/** Tab order for required draft cells in the spreadsheet (optional fields omitted). */
export const DRAFT_SHEET_FIELD_ORDER: SheetValidationField[] = [
  "loadNumber",
  "puDate",
  "origin",
  "delDate",
  "dest",
  "mileage",
  "rate",
  "status",
];

const ROUTE_DETAIL_FIELDS = new Set<SheetValidationField>(["puDate", "origin", "delDate", "dest"]);

export function mapPatchFieldToSheetField(field: string): SheetValidationField | null {
  switch (field) {
    case "loadNumber":
      return "loadNumber";
    case "puDate":
      return "puDate";
    case "delDate":
      return "delDate";
    case "originCity":
    case "originState":
      return "origin";
    case "destCity":
    case "destState":
      return "dest";
    case "mileage":
      return "mileage";
    case "rate":
      return "rate";
    case "dispatcherId":
      return "dispatcherId";
    case "status":
      return "status";
    default:
      return null;
  }
}

export function getNextRequiredDraftField(
  load: Pick<
    Load,
    | "loadNumber"
    | "puDate"
    | "delDate"
    | "originCity"
    | "destCity"
    | "mileage"
    | "rate"
    | "status"
    | "dispatcherId"
  >,
  options: {
    showRouteDetails: boolean;
    touched?: Set<string>;
    afterField?: SheetValidationField | null;
    requireDispatcher?: boolean;
  },
): SheetValidationField | null {
  const { showRouteDetails, touched, afterField, requireDispatcher } = options;
  const order = DRAFT_SHEET_FIELD_ORDER.filter((f) => {
    if (!showRouteDetails && ROUTE_DETAIL_FIELDS.has(f)) return false;
    if (f === "dispatcherId" && !requireDispatcher) return false;
    return true;
  });

  let startIdx = 0;
  if (afterField) {
    const idx = order.indexOf(afterField);
    if (idx >= 0) startIdx = idx + 1;
  }

  for (let i = startIdx; i < order.length; i++) {
    const field = order[i];
    if (getDispatcherFieldValidation(load, field, touched, { requireDispatcher }) === "invalid") {
      return field;
    }
  }

  return null;
}

export function getPrimaryPatchField(data: LoadUpdate): string | undefined {
  return Object.keys(data)[0];
}

export function markDraftFieldTouched(
  map: Map<string, Set<string>>,
  loadId: string,
  field: string,
): Map<string, Set<string>> {
  const next = new Map(map);
  const set = new Set(next.get(loadId) ?? []);
  if (field === "originCity" || field === "originState") set.add("origin");
  else if (field === "destCity" || field === "destState") set.add("dest");
  else set.add(field);
  next.set(loadId, set);
  return next;
}

export function shouldValidateDispatcherPatch(role: string, data: LoadUpdate): boolean {
  if (role !== "dispatcher" && role !== "admin") return false;
  if ("dispatcherId" in data) return true;
  const field = getPrimaryPatchField(data);
  if (!field) return false;
  return !DISPATCHER_OPTIONAL_LOAD_FIELDS.has(field);
}

export function validateDispatcherPatchValue(
  field: string,
  data: LoadUpdate,
  merged: Load,
  touched?: Set<string>,
  options?: LoadValidationOptions,
): DispatcherLoadFieldKey | null {
  switch (field) {
    case "loadNumber": {
      const num = String(data.loadNumber ?? "").trim();
      if (!num || num.startsWith("NEW-")) return "loadNumber";
      return null;
    }
    case "puDate":
      return merged.puDate?.trim() ? null : "puDate";
    case "delDate":
      return merged.delDate?.trim() ? null : "delDate";
    case "originCity":
    case "originState":
      return isPlaceholderCity(merged.originCity) ? "originCity" : null;
    case "destCity":
    case "destState":
      return isPlaceholderCity(merged.destCity) ? "destCity" : null;
    case "mileage":
      return merged.mileage && Number(merged.mileage) > 0 ? null : "mileage";
    case "rate":
      return merged.rate !== undefined && merged.rate !== null && Number(merged.rate) > 0
        ? null
        : "rate";
    case "status":
      return merged.status?.trim() ? null : "status";
    case "dispatcherId":
      return null;
    default:
      return null;
  }
}
