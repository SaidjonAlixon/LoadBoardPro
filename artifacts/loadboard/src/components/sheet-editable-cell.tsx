import { useEffect, useRef, useState, type ReactNode } from "react";
import { SheetDatePicker, type SheetDatePickerHandle } from "@/components/sheet-date-picker";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  blockInvalidNumericKey,
  handleNumericPaste,
  sanitizeNumericInput,
} from "@/lib/numeric-input";
import { cn } from "@/lib/utils";
import { getEtParts, instantToIsoDate } from "@workspace/calendar";

const INPUT_CLS =
  "w-full h-full min-h-[22px] px-1 py-0 text-[11px] border-2 border-accent outline-none bg-sheet-cell text-sheet-cell-fg rounded-none";

const SELECT_CLS =
  "w-full h-full min-h-[26px] px-1 py-0.5 text-[11px] border border-sheet-border outline-none bg-sheet-cell text-sheet-cell-fg rounded-sm cursor-pointer font-semibold uppercase tracking-wide";

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
  const datePickerRef = useRef<SheetDatePickerHandle>(null);
  const didAutoEdit = useRef(false);
  const calendarOpenRef = useRef(false);
  const [datePickerKey, setDatePickerKey] = useState(0);

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

  /** Close the editor immediately; persist in the background (optimistic parent update). */
  const fireSave = (next: string, advance = false) => {
    setEditing(false);
    setCalendarOpen(false);
    if (advance) onEnterAdvance?.();
    void onSave(next).catch(() => undefined);
  };

  const commitDate = async (d: Date, advance = false) => {
    const iso = formatIsoDate(d);
    setDateText(isoToSheetDate(iso));
    if (iso === value.split("T")[0]) {
      setEditing(false);
      setCalendarOpen(false);
      if (advance) onEnterAdvance?.();
      return;
    }
    fireSave(iso, advance);
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
    fireSave(draft, advance);
  };

  const commitSelect = async (next: string) => {
    if (isUnsetSelect(next)) return;
    setDraft(next);
    if (next === normalizedValue) {
      setEditing(false);
      return;
    }
    fireSave(next, true);
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
    fireSave(next, false);
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
              onFocus={() => {
                setDatePickerKey((k) => k + 1);
                setCalendarOpen(true);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (!calendarOpenRef.current) void commitDateFromText(false);
                }, 0);
              }}
              onKeyDown={(e) => {
                if (calendarOpen && datePickerRef.current?.handleKeyDown(e)) {
                  return;
                }
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
              key={datePickerKey}
              ref={datePickerRef}
              selected={selectedDate}
              defaultMonth={defaultMonth}
              onNavigate={(d) => setDateText(isoToSheetDate(formatIsoDate(d)))}
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
            onBlur={() => void commit(false)}
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
  if (!isNaN(d.getTime())) return instantToIsoDate(d);
  return display;
}

/** ISO -> DD.MM.YYYY for display/edit (Eastern calendar day) */
export function isoToSheetDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const p = getEtParts(parsed);
  const dd = String(p.day).padStart(2, "0");
  const mm = String(p.month).padStart(2, "0");
  return `${dd}.${mm}.${p.year}`;
}

interface SheetDispatcherCellProps {
  editable: boolean;
  value: string | null | undefined;
  defaultValue?: string | null;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  className?: string;
  validationState?: "valid" | "invalid" | "neutral";
  autoFocus?: boolean;
  autoOpen?: boolean;
  suppressAutoAssign?: boolean;
  onSave: (dispatcherId: string) => Promise<void>;
}

/** Always-visible dispatcher dropdown — no click-to-edit step. */
export function SheetDispatcherCell({
  editable,
  value,
  defaultValue = null,
  label,
  placeholder,
  options,
  className = "",
  validationState = "neutral",
  autoFocus = false,
  autoOpen = false,
  suppressAutoAssign = false,
  onSave,
}: SheetDispatcherCellProps) {
  const autoAssigned = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const effectiveValue = suppressAutoAssign ? (value || "") : (value || defaultValue || "");

  useEffect(() => {
    if (suppressAutoAssign || autoAssigned.current || !editable || !defaultValue || value) return;
    autoAssigned.current = true;
    void onSave(defaultValue).catch(() => undefined);
  }, [editable, defaultValue, value, onSave, suppressAutoAssign]);

  useEffect(() => {
    if ((!autoFocus && !autoOpen) || !editable) return;
    const el = selectRef.current;
    if (!el) return;
    window.setTimeout(() => {
      el.focus();
      try {
        el.showPicker?.();
      } catch {
        el.click();
      }
    }, 0);
  }, [autoFocus, autoOpen, editable]);

  const validationCls =
    validationState === "invalid"
      ? "bg-red-100 ring-1 ring-inset ring-red-500 dark:bg-red-950/40 dark:ring-red-500"
      : "";

  const baseCls = `px-1.5 py-0.5 border-r border-b border-sheet-border text-[11px] bg-sheet-cell text-sheet-cell-fg align-middle text-center ${SHEET_CELL_CLIP} ${className}`;

  const optionLabel =
    options.find((o) => o.value === effectiveValue)?.label ?? label;

  if (!editable || options.length === 0) {
    return (
      <td className={`${baseCls} font-semibold uppercase tracking-wide ${validationCls}`} title={optionLabel}>
        <SheetCellText>{optionLabel || "—"}</SheetCellText>
      </td>
    );
  }

  return (
    <td className={`${baseCls} px-0 py-0 ${validationCls}`}>
      <select
        ref={selectRef}
        className={`${SELECT_CLS} ${!effectiveValue ? "text-muted-foreground italic normal-case tracking-normal font-medium" : ""}`}
        value={effectiveValue}
        title={effectiveValue ? optionLabel : placeholder}
        onChange={(e) => {
          const next = e.target.value;
          if (!next || next === effectiveValue) return;
          void onSave(next).catch(() => undefined);
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </td>
  );
}
