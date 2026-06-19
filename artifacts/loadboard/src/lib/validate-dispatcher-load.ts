import type { Load, LoadUpdate } from "@workspace/api-client-react";

/** Broker and dispatch notes are optional for dispatchers. */
export const DISPATCHER_OPTIONAL_LOAD_FIELDS = new Set(["brokerId", "dispatchNotes"]);

export type DispatcherLoadFieldKey =
  | "loadNumber"
  | "puDate"
  | "delDate"
  | "originCity"
  | "destCity"
  | "mileage"
  | "rate"
  | "reimbursement"
  | "status";

export type SheetValidationField =
  | DispatcherLoadFieldKey
  | "origin"
  | "dest"
  | "broker"
  | "dispatchNotes";

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
};

export function isPlaceholderCity(city?: string | null): boolean {
  const v = city?.trim();
  return !v || v === "-";
}

export function isDraftLoadNumber(loadNumber?: string | null): boolean {
  const v = loadNumber?.trim();
  return !v || v.startsWith("NEW-");
}

export function isDispatcherDraftLoad(load: Pick<Load, "loadNumber">): boolean {
  return isDraftLoadNumber(load.loadNumber);
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
  >[],
  touchedByLoad?: Map<string, Set<string>>,
): string | null {
  const drafts = loads.filter((l) => !isDispatcherLoadComplete(l, touchedByLoad?.get(l.id)));
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
  >,
  touched?: Set<string>,
): DispatcherLoadFieldKey[] {
  const missing: DispatcherLoadFieldKey[] = [];

  if (isDraftLoadNumber(load.loadNumber)) missing.push("loadNumber");
  if (!load.puDate?.trim()) missing.push("puDate");
  if (!load.delDate?.trim()) missing.push("delDate");
  if (isPlaceholderCity(load.originCity)) missing.push("originCity");
  if (isPlaceholderCity(load.destCity)) missing.push("destCity");
  if (!load.mileage || Number(load.mileage) <= 0) missing.push("mileage");
  if (load.rate === undefined || load.rate === null || Number(load.rate) <= 0) missing.push("rate");
  if (!isReimbursementFilled(load, touched)) missing.push("reimbursement");
  if (!load.status?.trim()) missing.push("status");

  return missing;
}

function isReimbursementFilled(
  load: Pick<Load, "loadNumber" | "reimbursement">,
  touched?: Set<string>,
): boolean {
  if (touched?.has("reimbursement")) return true;
  if (!isDraftLoadNumber(load.loadNumber)) return load.reimbursement !== undefined && load.reimbursement !== null;
  return Number(load.reimbursement) > 0;
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
  >,
  touched?: Set<string>,
): boolean {
  return getDispatcherLoadMissingFields(load, touched).length === 0;
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
  >,
  field: SheetValidationField,
  touched?: Set<string>,
): "valid" | "invalid" | "neutral" {
  if (field === "broker" || field === "dispatchNotes") return "neutral";

  const key =
    field === "origin"
      ? "originCity"
      : field === "dest"
        ? "destCity"
        : field;

  const missing = getDispatcherLoadMissingFields(load, touched);
  return missing.includes(key as DispatcherLoadFieldKey) ? "invalid" : "valid";
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
  const field = getPrimaryPatchField(data);
  if (!field) return false;
  return !DISPATCHER_OPTIONAL_LOAD_FIELDS.has(field);
}

export function validateDispatcherPatchValue(
  field: string,
  data: LoadUpdate,
  merged: Load,
  touched?: Set<string>,
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
    case "reimbursement":
      return isReimbursementFilled(merged, touched) ? null : "reimbursement";
    case "status":
      return merged.status?.trim() ? null : "status";
    default:
      return null;
  }
}
