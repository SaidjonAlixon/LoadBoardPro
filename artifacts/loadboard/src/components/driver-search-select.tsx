import { useState } from "react";
import type { Driver } from "@workspace/api-client-react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export const MODERN_ADD_BTN = cn(
  "inline-flex items-center justify-center shrink-0 rounded-md p-0 border-0",
  "!h-4 !w-4 !min-h-0 min-w-0",
  "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40",
  "hover:bg-blue-700 hover:text-white hover:shadow-md hover:ring-blue-400/60",
  "active:scale-95 transition-all duration-150",
  "dark:bg-blue-500 dark:ring-blue-300/30 dark:hover:bg-blue-400 dark:hover:text-white",
  "disabled:opacity-40 disabled:pointer-events-none",
  "[&_svg]:!size-2.5",
);

const MODERN_ADD_ICON = "h-2.5 w-2.5 stroke-[3]";

type DriverSearchSelectProps = {
  value: string;
  drivers: Driver[];
  onValueChange: (driverId: string) => void;
  onAddClick?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  addDisabled?: boolean;
};

export function DriverSearchSelect({
  value,
  drivers,
  onValueChange,
  onAddClick,
  disabled = false,
  placeholder,
  className,
  addDisabled = false,
}: DriverSearchSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = drivers.find((d) => d.id === value);

  return (
    <div className={cn("flex items-center gap-1 min-w-0", className)}>
      {onAddClick ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={MODERN_ADD_BTN}
          title={t("drivers.addDriver")}
          disabled={disabled || addDisabled}
          onClick={onAddClick}
        >
          <Plus className={MODERN_ADD_ICON} />
        </Button>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-7 flex-1 min-w-[120px] justify-between gap-1 px-2 text-xs font-semibold",
              "border-border bg-background text-foreground",
            )}
          >
            <span className="truncate text-left">
              {selected?.fullName ?? placeholder ?? t("statusboard.selectDriver")}
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(280px,var(--radix-popover-trigger-width))] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={t("statusboard.searchDriver")} />
            <CommandList>
              <CommandEmpty>{t("statusboard.noDriversFound")}</CommandEmpty>
              <CommandGroup>
                {drivers.map((driver) => (
                  <CommandItem
                    key={driver.id}
                    value={[driver.fullName, driver.truckNumber, driver.phone]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => {
                      onValueChange(driver.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        value === driver.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{driver.fullName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
