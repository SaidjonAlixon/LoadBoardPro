import { useEffect, useRef, useState, type ReactNode } from "react";

const INPUT_CLS =
  "w-full h-full min-h-[22px] px-1 py-0 text-[11px] border-2 border-accent outline-none bg-sheet-cell text-sheet-cell-fg rounded-none";

/** Keeps cell text inside borders; pair with table-fixed on the table. */
export const SHEET_CELL_CLIP = "max-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

export function SheetCellText({ children }: { children: ReactNode }) {
  return (
    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
      {children}
    </span>
  );
}

interface SheetEditableCellProps {
  editable: boolean;
  value: string;
  display?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  inputType?: "text" | "number" | "date";
  selectOptions?: { value: string; label: string }[];
  onSave: (value: string) => Promise<void>;
  title?: string;
  tooltip?: string;
  autoEdit?: boolean;
  validationState?: "valid" | "invalid" | "neutral";
}

export function SheetEditableCell({
  editable,
  value,
  display,
  className = "",
  align = "center",
  inputType = "text",
  selectOptions,
  onSave,
  title,
  tooltip,
  autoEdit = false,
  validationState = "neutral",
}: SheetEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const didAutoEdit = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!autoEdit) {
      didAutoEdit.current = false;
      return;
    }
    if (autoEdit && editable && !didAutoEdit.current) {
      didAutoEdit.current = true;
      setDraft(value);
      setEditing(true);
    }
  }, [autoEdit, editable, value]);

  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const startEdit = (e: React.MouseEvent) => {
    if (!editable || saving) return;
    e.stopPropagation();
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    if (!editing) return;
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setEditing(true);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const validationCls =
    validationState === "valid"
      ? "bg-green-100 ring-1 ring-inset ring-green-500"
      : validationState === "invalid"
        ? "bg-red-100 ring-1 ring-inset ring-red-500"
        : "";

  const hoverTitle = tooltip ?? title ?? (selectOptions ? undefined : value || undefined);

  if (editing) {
    return (
      <td className={`px-0 py-0 border-r border-b border-sheet-border bg-sheet-edit text-center align-middle ${className}`}>
        {selectOptions ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className={`${INPUT_CLS} ${alignCls}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => window.setTimeout(() => void commit(), 0)}
            onKeyDown={handleKeyDown}
          >
            {selectOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            className={`${INPUT_CLS} ${alignCls}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => window.setTimeout(() => void commit(), 0)}
            onKeyDown={handleKeyDown}
          />
        )}
      </td>
    );
  }

  return (
    <td
      className={`px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg align-middle ${SHEET_CELL_CLIP} ${alignCls} ${
        editable ? "cursor-cell hover:bg-sheet-edit" : ""
      } ${saving ? "opacity-60" : ""} ${validationCls} ${className}`}
      onMouseDown={(e) => {
        if (editable && !saving) e.preventDefault();
      }}
      onClick={startEdit}
      title={hoverTitle}
    >
      <SheetCellText>{display ?? (value || "—")}</SheetCellText>
    </td>
  );
}

export function parseCityState(raw: string): { city: string; state: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { city: "", state: "" };
  const comma = trimmed.indexOf(",");
  if (comma === -1) return { city: trimmed, state: "" };
  const parts = trimmed.split(",").map((p) => p.trim());
  return { city: parts[0] ?? "", state: (parts[1] ?? "").toUpperCase().slice(0, 2) };
}

export function formatLocationForEdit(city: string, state?: string | null): string {
  const c = city?.trim();
  if (!c || c === "-") return "";
  const s = state?.trim();
  if (!s || s === "-") return c;
  return `${c}, ${s}`;
}

export function toCityState(city: string, state: string): string {
  return formatLocationForEdit(city, state);
}

/** DD.MM.YYYY -> YYYY-MM-DD for API */
export function sheetDateToIso(display: string): string {
  const m = display.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(display)) return display;
  const d = new Date(display);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return display;
}

/** ISO -> DD.MM.YYYY for display/edit */
export function isoToSheetDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
