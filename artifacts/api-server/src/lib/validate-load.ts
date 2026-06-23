type LoadInput = {
  loadNumber?: string | null;
  dispatcherId?: string | null;
  puDate?: string | null;
  delDate?: string | null;
  originCity?: string | null;
  originState?: string | null;
  destCity?: string | null;
  destState?: string | null;
  mileage?: string | number | null;
  rate?: string | number | null;
  reimbursement?: string | number | null;
  status?: string | null;
};

function isPlaceholderCity(city?: string | null): boolean {
  const v = city?.trim();
  return !v || v === "-";
}

function isDraftLoadNumber(loadNumber?: string | null): boolean {
  const v = loadNumber?.trim();
  return !v || v.startsWith("NEW-");
}

export function validateDispatcherLoadInput(load: LoadInput): string[] {
  const errors: string[] = [];

  if (isDraftLoadNumber(load.loadNumber)) errors.push("load number");
  if (!load.puDate?.trim()) errors.push("pickup date");
  if (!load.delDate?.trim()) errors.push("delivery date");
  if (isPlaceholderCity(load.originCity)) errors.push("origin");
  if (isPlaceholderCity(load.destCity)) errors.push("destination");
  if (!load.mileage || Number(load.mileage) <= 0) errors.push("mileage");
  if (load.rate === undefined || load.rate === null || Number(load.rate) <= 0) errors.push("rate");
  if (!load.status?.trim()) errors.push("status");

  return errors;
}

export function validateAdminLoadInput(load: LoadInput): string[] {
  const errors = validateDispatcherLoadInput(load);
  if (!load.dispatcherId) errors.push("dispatcher");
  return errors;
}

export function mergeLoadForValidation(
  existing: LoadInput,
  updates: LoadInput,
): LoadInput {
  return { ...existing, ...updates };
}

export function isDraftLoadNumberValue(loadNumber?: string | null): boolean {
  return isDraftLoadNumber(loadNumber);
}
