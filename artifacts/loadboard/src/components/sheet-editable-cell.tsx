import { useEffect, useRef, useState, type ReactNode } from "react";
import { SheetDatePicker } from "@/components/sheet-date-picker";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  blockInvalidNumericKey,
  handleNumericPaste,
  sanitizeNumericInput,
} from "@/lib/numeric-input";
import { cn } from "@/lib/utils";

const INPUT_CLS =
  "w-full h-full min-h-[22px] px-1 py-0 text-[11px] border-2 border-accent outline-none bg-sheet-cell text-sheet-cell-fg rounded-none";

const DATE_INPUT_CLS =
  "w-full h-full min-h-[24px] px-1.5 py-0 text-[11px] border border-[#0078d4] outline-none bg-white text-left text-neutral-900 rounded-none shadow-none";

/** Keeps cell text inside borders; pair with table-fixed on the table. */
export const SHEET_CELL_CLIP = "max-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

export function SheetCellText({ children }: { children: ReactNode }) {
  return (
    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
      {children}
    </span>
  );
}

function isClipboardMod(e: React.KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

/** First cell when pasting from Excel (tab/newline separated). */
function firstClipboardCell(text: string): string {
  return text.replace(/\r\n/g, "\n").split("\t")[0]?.split("\n")[0]?.trim() ?? "";
}

export function SheetCopyableCell({
  value,
  className = "",
  title,
  children,
}: {
  value: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <td
      tabIndex={0}
      className={className}
      title={title}
      onKeyDown={(e) => {
        if (isClipboardMod(e) && e.key.toLowerCase() === "c") {
          e.preventDefault();
          void navigator.clipboard.writeText(value);
        }
      }}
    >
      {children}
    </td>
  );
}

interface SheetEditableCellProps {
  editable: boolean;
  value: string;
  display?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  inputType?: "text" | "number" | "date";
  /** When inputType is number: digits only (true) or digits + one decimal (false). */
  integerOnly?: boolean;
  selectOptions?: { value: string; label: string }[];
  onSave: (value: string) => Promise<void>;
  title?: string;
  tooltip?: string;
  autoEdit?: boolean;
  validationState?: "valid" | "invalid" | "neutral";
  /** Called after Enter commits the cell (saved or unchanged). */
  onEnterAdvance?: () => void;
  datePlaceholder?: string;
  /** Month shown when opening picker without a selected date. */
  dateDefaultMonth?: Date;
  /** Placeholder label for required selects; value stays unset until user picks an option. */
  selectPlaceholder?: string;
  selectRequired?: boolean;
  /** Fired when user tries to leave a required select without choosing. */
  onUnsetSelectAttempt?: () => void;
}

const SELECT_UNSET = "__sheet_unset__";

function parseIsoDate(iso: string): Date | undefined {
  if (!iso?.trim()) return undefined;
  const d = new Date(`${iso.split("T")[0]}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SheetEditableCell({
  editable,
  value,
  display,
  className = "",
  align = "center",
  inputType = "text",
  integerOnly = false,
  selectOptions,
  onSave,
  title,
  tooltip,
  autoEdit = false,
  validationState = "neutral",
  onEnterAdvance,
  datePlaceholder = "—",
  dateDefaultMonth,
  selectPlaceholder,
  selectRequired = false,
  onUnsetSelectAttempt,
}: SheetEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const normalizedValue =
    selectPlaceholder && selectRequired && !value.trim() ? SELECT_UNSET : value;
  const [draft, setDraft] = useState(normalizedValue);
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateText, setDateText] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const didAutoEdit = useRef(false);
  const calendarOpenRef = useRef(false);

  useEffect(() => {
    calendarOpenRef.current = calendarOpen;
  }, [calendarOpen]);

  const isUnsetSelect = (v: string) =>
    selectRequired && selectPlaceholder && (v === SELECT_UNSET || !v.trim());

  const renderedSelectOptions = selectPlaceholder
    ? [{ value: SELECT_UNSET, label: selectPlaceholder }, ...selectOptions ?? []]
    : selectOptions;

  useEffect(() => {
    if (!editing) setDraft(normalizedValue);
  }, [normalizedValue, editing]);

  useEffect(() => {
    if (editing && inputType === "date") {
      const iso = value.split("T")[0];
      setDateText(iso && iso.trim() ? isoToSheetDate(iso) : "");
      setCalendarOpen(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!editing) {
      setCalendarOpen(false);
    }
  }, [editing, inputType, value]);

  useEffect(() => {
    if (editing && inputType !== "date") inputRef.current?.focus();
  }, [editing, inputType]);

  useEffect(() => {
    if (!autoEdit) {
      didAutoEdit.current = false;
      return;
    }
    if (autoEdit && editable && !didAutoEdit.current) {
      didAutoEdit.current = true;
      setDraft(normalizedValue);
      setEditing(true);
    }
  }, [autoEdit, editable, normalizedValue]);

  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const startEdit = (e: React.MouseEvent) => {
    if (!editable || saving) return;
    e.stopPropagation();
    setDraft(normalizedValue);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(normalizedValue);
    setCalendarOpen(false);
    setEditing(false);
  };

  const commitDate = async (d: Date, advance = false) => {
    const iso = formatIsoDate(d);
    setDateText(isoToSheetDate(iso));
    setCalendarOpen(false);
    if (iso === value.split("T")[0]) {
      setEditing(false);
      if (advance) onEnterAdvance?.();
      return;
    }
    setSaving(true);
    try {
      await onSave(iso);
      setEditing(false);
      if (advance) onEnterAdvance?.();
    } catch {
      setEditing(true);
    } finally {
      setSaving(false);
    }
  };

  const commitDateFromText = async (advance = false) => {
    const raw = dateText.trim();
    if (!raw) {
      if (!value) {
        setEditing(false);
        setCalendarOpen(false);
      }
      return;
    }
    const iso = sheetDateToIso(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const d = parseIsoDate(iso);
    if (!d) return;
    await commitDate(d, advance);
  };

  const commit = async (advance = false) => {
    if (!editing) return;
    if (selectOptions && isUnsetSelect(draft)) {
      if (advance) onUnsetSelectAttempt?.();
      return;
    }
    if (draft === normalizedValue) {
      setEditing(false);
      if (advance && !(selectOptions && isUnsetSelect(draft))) onEnterAdvance?.();
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      if (advance) onEnterAdvance?.();
    } catch {
      setEditing(true);
    } finally {
      setSaving(false);
    }
  };

  const commitSelect = async (next: string) => {
    if (isUnsetSelect(next)) return;
    setDraft(next);
    if (next === normalizedValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
      onEnterAdvance?.();
    } catch {
      setEditing(true);
    } finally {
      setSaving(false);
    }
  };

  const copyText = normalizedValue === SELECT_UNSET ? "" : normalizedValue;

  const pasteClipboardValue = async (raw: string) => {
    let next = firstClipboardCell(raw);
    if (!next) return;

    if (inputType === "number") {
      next = sanitizeNumericInput(next, integerOnly);
      if (!next) return;
    } else if (inputType === "date") {
      next = sheetDateToIso(next);
    } else if (selectOptions) {
      const match = selectOptions.find(
        (o) =>
          o.value === next
          || o.label.toLowerCase() === next.toLowerCase(),
      );
      if (!match || isUnsetSelect(match.value)) return;
      await commitSelect(match.value);
      return;
    }

    if (next === normalizedValue) return;
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setDraft(next);
      setEditing(true);
    } finally {
      setSaving(false);
    }
  };

  const cutCellValue = async () => {
    if (selectOptions) return;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      return;
    }
    setSaving(true);
    try {
      await onSave("");
      setEditing(false);
    } catch {
      /* validation may reject empty */
    } finally {
      setSaving(false);
    }
  };

  const handleInputClipboard = (e: React.KeyboardEvent) => {
    if (!isClipboardMod(e)) return false;
    const key = e.key.toLowerCase();
    const input = inputRef.current;
    if (!(input instanceof HTMLInputElement)) return false;

    const hasSelection = input.selectionStart !== input.selectionEnd;
    if (key === "c" && !hasSelection) {
      e.preventDefault();
      void navigator.clipboard.writeText(draft);
      return true;
    }
    if (key === "x" && !hasSelection) {
      e.preventDefault();
      void navigator.clipboard.writeText(draft);
      setDraft("");
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (handleInputClipboard(e)) return;
    if (inputType === "number") {
      blockInvalidNumericKey(e, integerOnly);
      if (e.defaultPrevented) return;
    }
    if (isClipboardMod(e)) {
      const key = e.key.toLowerCase();
      if (key === "v") {
        e.preventDefault();
        void navigator.clipboard.readText().then(pasteClipboardValue).catch(() => undefined);
        return;
      }
      if (key === "c" || key === "x") return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void commit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const handleSelectKeyDown = (e: React.KeyboardEvent) => {
    if (isClipboardMod(e)) {
      const key = e.key.toLowerCase();
      if (key === "c") {
        e.preventDefault();
        const opt = selectOptions?.find((o) => o.value === draft);
        void navigator.clipboard.writeText(opt?.label ?? copyText);
        return;
      }
      if (key === "v") {
        e.preventDefault();
        void navigator.clipboard.readText().then(pasteClipboardValue).catch(() => undefined);
        return;
      }
      return;
    }
    handleKeyDown(e);
  };

  const handleDisplayKeyDown = (e: React.KeyboardEvent) => {
    if (!isClipboardMod(e)) return;
    const key = e.key.toLowerCase();
    if (key === "c") {
      e.preventDefault();
      void navigator.clipboard.writeText(copyText);
    } else if (key === "v" && editable) {
      e.preventDefault();
      void navigator.clipboard.readText().then(pasteClipboardValue).catch(() => undefined);
    } else if (key === "x" && editable) {
      e.preventDefault();
      void cutCellValue();
    }
  };

  const isNumericInput = inputType === "number";

  const validationCls =
    validationState === "valid"
      ? "bg-green-100 ring-1 ring-inset ring-green-500"
      : validationState === "invalid"
        ? "bg-red-100 ring-1 ring-inset ring-red-500"
        : "";

  const hoverTitle = tooltip ?? title ?? (selectOptions ? undefined : value || undefined);
  const cellEditCls = `px-0 py-0 border-r border-b border-sheet-border bg-sheet-edit text-center align-middle ${className}`;

  if (editing && inputType === "date") {
    const selectedDate = dateText.trim()
      ? parseIsoDate(sheetDateToIso(dateText.trim()))
      : undefined;
    const defaultMonth = selectedDate ?? dateDefaultMonth ?? new Date();

    return (
      <td className={cellEditCls}>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverAnchor asChild>
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              inputMode="numeric"
              placeholder={datePlaceholder}
              value={dateText}
              onChange={(e) => setDateText(e.target.value)}
              onFocus={() => setCalendarOpen(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!calendarOpenRef.current) void commitDateFromText(false);
                }, 120);
              }}
              onKeyDown={(e) => {
                if (isClipboardMod(e)) {
                  const key = e.key.toLowerCase();
                  if (key === "c") {
                    e.preventDefault();
                    void navigator.clipboard.writeText(dateText || copyText);
                    return;
                  }
                  if (key === "v") {
                    e.preventDefault();
                    void navigator.clipboard.readText().then(pasteClipboardValue).catch(() => undefined);
                    return;
                  }
                  if (key === "x") {
                    e.preventDefault();
                    void cutCellValue();
                    return;
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitDateFromText(true);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
              className={DATE_INPUT_CLS}
            />
          </PopoverAnchor>
          <PopoverContent
            className="z-[100] w-[248px] overflow-hidden rounded-sm border border-neutral-300 bg-white p-0 shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
            align="start"
            side="top"
            sideOffset={2}
            collisionPadding={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetDatePicker
              selected={selectedDate}
              defaultMonth={defaultMonth}
              onSelect={(d) => {
                if (!d) return;
                void commitDate(d, true);
              }}
              onClear={() => {
                setDateText("");
                setCalendarOpen(false);
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
              onToday={() => void commitDate(new Date())}
            />
          </PopoverContent>
        </Popover>
      </td>
    );
  }

  if (editing) {
    return (
      <td className={cellEditCls}>
        {selectOptions ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className={`${INPUT_CLS} ${alignCls} ${isUnsetSelect(draft) ? "text-muted-foreground italic" : ""}`}
            value={draft}
            onChange={(e) => void commitSelect(e.target.value)}
            onBlur={() => {
              if (selectRequired && isUnsetSelect(draft)) cancel();
            }}
            onKeyDown={handleSelectKeyDown}
            autoFocus
          >
            {(renderedSelectOptions ?? []).map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === SELECT_UNSET}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={isNumericInput ? "text" : inputType}
            inputMode={isNumericInput ? (integerOnly ? "numeric" : "decimal") : undefined}
            pattern={isNumericInput ? (integerOnly ? "[0-9]*" : undefined) : undefined}
            className={`${INPUT_CLS} ${alignCls}`}
            value={draft}
            onChange={(e) => {
              const next = isNumericInput
                ? sanitizeNumericInput(e.target.value, integerOnly)
                : e.target.value;
              setDraft(next);
            }}
            onInput={
              isNumericInput
                ? (e) => {
                    const el = e.currentTarget;
                    const next = sanitizeNumericInput(el.value, integerOnly);
                    if (el.value !== next) el.value = next;
                    setDraft(next);
                  }
                : undefined
            }
            onPaste={
              isNumericInput
                ? (e) => handleNumericPaste(e, integerOnly, setDraft)
                : undefined
            }
            onBlur={() => window.setTimeout(() => void commit(false), 0)}
            onKeyDown={handleKeyDown}
          />
        )}
      </td>
    );
  }

  return (
    <td
      tabIndex={editable || copyText ? 0 : -1}
      className={`px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg align-middle ${SHEET_CELL_CLIP} ${alignCls} ${
        editable ? "cursor-cell hover:bg-sheet-edit" : ""
      } ${saving ? "opacity-60" : ""} ${validationCls} ${className}`}
      onClick={startEdit}
      onKeyDown={handleDisplayKeyDown}
      title={hoverTitle}
    >
      <SheetCellText>{display ?? (value || datePlaceholder)}</SheetCellText>
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
