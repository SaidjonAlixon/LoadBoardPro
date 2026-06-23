/** Format ISO or date string for `<input type="datetime-local" />` in local time. */
export function toDatetimeLocalValue(iso?: string | null, fallbackDate?: string | null): string {
  const source = iso ?? (fallbackDate ? `${fallbackDate}T08:00` : "");
  if (!source) return "";
  const d = new Date(source.includes("T") ? source : `${source}T08:00`);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

export function datetimeLocalDatePart(value: string): string {
  return value.split("T")[0] ?? value;
}

export function formatScheduledDateTime(
  iso?: string | null,
  fallbackDate?: string | null,
  formatDateTime?: (d: string | Date) => string,
  formatDate?: (d: string | Date) => string,
): string {
  if (iso) {
    return formatDateTime
      ? formatDateTime(iso)
      : new Date(iso).toLocaleString();
  }
  if (fallbackDate && formatDate) return formatDate(fallbackDate);
  if (fallbackDate) return fallbackDate;
  return "";
}
