import { ChevronDown, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { DayButton, DayPicker, type DayPickerProps } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SheetDatePickerProps = Pick<DayPickerProps, "selected" | "defaultMonth" | "onSelect"> & {
  onClear: () => void;
  onToday: () => void;
};

const WIN_BLUE = "#0078d4";

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
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
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

export function SheetDatePicker({
  selected,
  defaultMonth,
  onSelect,
  onClear,
  onToday,
}: SheetDatePickerProps) {
  const { locale, t } = useI18n();
  const calendarLocale = locale === "uz" ? "uz-UZ" : "en-US";

  return (
    <div
      className="w-[248px] select-none bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] text-neutral-900"
      style={{ ["--win-blue" as string]: WIN_BLUE }}
    >
      <DayPicker
        mode="single"
        selected={selected}
        defaultMonth={defaultMonth}
        onSelect={onSelect}
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
              return <ChevronDownIcon className={cn("size-3.5 stroke-[2]", className)} {...props} />;
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
}
