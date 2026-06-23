/** Strip non-digits; optional single decimal point. */
export function sanitizeNumericInput(value: string, integerOnly = false): string {
  if (integerOnly) return value.replace(/\D/g, "");
  const cleaned = value.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot);
  const fracPart = cleaned.slice(dot + 1).replace(/\./g, "");
  return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart + (cleaned.endsWith(".") ? "." : "");
}

export function isAllowedNumericKey(key: string, integerOnly: boolean): boolean {
  if (/^\d$/.test(key)) return true;
  if (!integerOnly && key === ".") return true;
  return false;
}

export function blockInvalidNumericKey(
  e: React.KeyboardEvent,
  integerOnly: boolean,
): void {
  if (e.key.length !== 1) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isAllowedNumericKey(e.key, integerOnly)) return;
  e.preventDefault();
}

export function handleNumericPaste(
  e: React.ClipboardEvent,
  integerOnly: boolean,
  onValue: (next: string) => void,
): void {
  e.preventDefault();
  const text = e.clipboardData.getData("text");
  onValue(sanitizeNumericInput(text, integerOnly));
}
