import { APP_TIMEZONE, etWallTimeToUtc, getEtParts, instantToIsoDate, parseDateOnly } from "@workspace/calendar";

/** Format ISO instant for `<input type="datetime-local" />` in Eastern Time. */
export function toDatetimeLocalValue(iso?: string | null, fallbackDate?: string | null): string {
  const source = iso ?? (fallbackDate ? `${fallbackDate}T08:00:00` : "");
  if (!source) return "";
  const d = new Date(source.includes("T") ? source : `${source}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const p = getEtParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function datetimeLocalToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(value).toISOString();
  const [, ys, ms, ds, hs, mins] = match;
  return etWallTimeToUtc(
    Number(ys),
    Number(ms),
    Number(ds),
    Number(hs),
    Number(mins),
  ).toISOString();
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
      : new Intl.DateTimeFormat("en-US", {
          timeZone: APP_TIMEZONE,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(iso));
  }
  if (fallbackDate && formatDate) return formatDate(fallbackDate);
  if (fallbackDate) return fallbackDate;
  return "";
}

export { instantToIsoDate };
