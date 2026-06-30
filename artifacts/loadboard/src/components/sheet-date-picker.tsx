import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { DayButton, DayPicker, type DayPickerProps } from "react-day-picker";
import { addDays, parseDateOnly, toIsoDateLocal } from "@workspace/calendar";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SheetDatePickerProps = Pick<DayPickerProps, "selected" | "defaultMonth" | "onSelect"> & {
  onClear: () => void;
  onToday: () => void;
  /** Preview in the cell input while arrow-navigating days. */
  onNavigate?: (date: Date) => void;
};

export type SheetDatePickerHandle = {
  handleKeyDown: (e: KeyboardEvent) => boolean;
};

const WIN_BLUE = "#0078d4";

const ARROW_DELTA: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

function initialFocusedDate(selected?: Date, defaultMonth?: Date): Date {
  if (selected && !Number.isNaN(selected.getTime())) return selected;
  if (defaultMonth && !Number.isNaN(defaultMonth.getTime())) return defaultMonth;
  return parseDateOnly(toIsoDateLocal(new Date()));
}

function addCalendarDays(d: Date, days: number): Date {
  return parseDateOnly(addDays(toIsoDateLocal(d), days));
}

function formatWeekdayShort(date: Date, locale: string): string {
  const raw = date.toLocaleDateString(locale, { weekday: "short" }).replace(/\./g, "");
  const two = raw.slice(0, 2);
  return two.charAt(0).toUpperCase() + two.slice(1);
}

function WinDayButton({
  className,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const isSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-selected-single={isSelected}
      className={cn(
        "size-8 rounded-none p-0 text-[13px] font-normal shadow-none",
        "text-neutral-900 hover:bg-[#e5f3ff]",
        modifiers.outside && "text-neutral-400 hover:bg-transparent hover:text-neutral-400",
        modifiers.disabled && "text-neutral-300",
        "data-[selected-single=true]:bg-[#0078d4] data-[selected-single=true]:text-white",
        "data-[selected-single=true]:ring-2 data-[selected-single=true]:ring-black data-[selected-single=true]:hover:bg-[#0078d4]",
        className,
      )}
      {...props}
    />
  );
}

export const SheetDatePicker = forwardRef<SheetDatePickerHandle, SheetDatePickerProps>(
  function SheetDatePicker(
    { selected, defaultMonth, onSelect, onClear, onToday, onNavigate },
    ref,
  ) {
    const { locale, t } = useI18n();
    const calendarLocale = locale === "uz" ? "uz-UZ" : "en-US";

    const [focusedDate, setFocusedDate] = useState(() =>
      initialFocusedDate(selected, defaultMonth),
    );
    const [month, setMonth] = useState(() => monthStart(initialFocusedDate(selected, defaultMonth)));

    const moveFocus = useCallback(
      (deltaDays: number) => {
        setFocusedDate((prev) => {
          const next = addCalendarDays(prev, deltaDays);
          setMonth(monthStart(next));
          onNavigate?.(next);
          return next;
        });
      },
      [onNavigate],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent): boolean => {
        const delta = ARROW_DELTA[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          moveFocus(delta);
          return true;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onSelect?.(focusedDate);
          return true;
        }
        return false;
      },
      [focusedDate, moveFocus, onSelect],
    );

    useImperativeHandle(ref, () => ({ handleKeyDown }), [handleKeyDown]);

    const handleSelect = (d: Date | undefined) => {
      if (!d) return;
      setFocusedDate(d);
      setMonth(monthStart(d));
      onSelect?.(d);
    };

    return (
      <div
        className="w-[248px] select-none bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] text-neutral-900"
        style={{ ["--win-blue" as string]: WIN_BLUE }}
        onKeyDown={handleKeyDown}
      >
        <DayPicker
          mode="single"
          selected={focusedDate}
          month={month}
          onMonthChange={setMonth}
          onSelect={handleSelect}
          showOutsideDays
          fixedWeeks
          weekStartsOn={1}
          className="p-0"
          formatters={{
            formatWeekdayName: (date) => formatWeekdayShort(date, calendarLocale),
          }}
          classNames={{
            root: "w-full",
            months: "relative w-full",
            month: "relative w-full",
            month_caption: "sr-only",
            caption_label: "hidden",
            nav: "absolute right-2.5 top-2 z-10 flex flex-col",
            button_previous:
              "inline-flex h-[18px] w-[22px] items-center justify-center rounded-none p-0 text-neutral-700 hover:bg-neutral-100",
            button_next:
              "inline-flex h-[18px] w-[22px] items-center justify-center rounded-none p-0 text-neutral-700 hover:bg-neutral-100",
            month_grid: "w-full px-1.5 pb-1",
            weekdays: "flex w-full",
            weekday:
              "flex h-7 w-8 items-center justify-center text-[13px] font-normal text-neutral-800",
            weeks: "w-full",
            week: "mt-0 flex w-full",
            day: "p-0",
            outside: "text-neutral-400",
            disabled: "text-neutral-300",
            hidden: "invisible",
          }}
          components={{
            DayButton: WinDayButton,
            Chevron: ({ className, orientation, ...props }) => {
              if (orientation === "left") {
                return <ChevronUpIcon className={cn("size-3.5 stroke-[2]", className)} {...props} />;
              }
              if (orientation === "right") {
                return (
                  <ChevronDownIcon className={cn("size-3.5 stroke-[2]", className)} {...props} />
                );
              }
              return <ChevronDown className={cn("size-3.5", className)} {...props} />;
            },
            MonthCaption: ({ calendarMonth, ...props }) => (
              <div {...props} className="flex h-9 w-full items-center px-2.5 pt-2 pr-11">
                <span className="flex items-center gap-1 text-[13px] font-normal capitalize text-neutral-900">
                  {calendarMonth.date.toLocaleDateString(calendarLocale, {
                    month: "long",
                    year: "numeric",
                  })}
                  <ChevronDown className="size-3 text-neutral-600" aria-hidden />
                </span>
              </div>
            ),
          }}
        />
        <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2">
          <button
            type="button"
            className="text-[13px] hover:underline"
            style={{ color: WIN_BLUE }}
            onClick={onClear}
          >
            {t("common.clear")}
          </button>
          <button
            type="button"
            className="text-[13px] hover:underline"
            style={{ color: WIN_BLUE }}
            onClick={onToday}
          >
            {t("common.today")}
          </button>
        </div>
      </div>
    );
  },
);
