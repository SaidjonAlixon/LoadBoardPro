import { Filter, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  STATUSBOARD_DISPATCHER_UNASSIGNED,
  STATUSBOARD_FILTER_ALL,
} from "@/lib/drivers-today";

function FilterSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  options,
  testId,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
  options: { id: string; name: string }[];
  testId: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm",
        "min-w-[min(100%,150px)] sm:min-w-[170px]",
        className,
      )}
      data-testid={testId}
    >
      <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus:ring-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={STATUSBOARD_FILTER_ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type DriverStatusboardFiltersProps = {
  driverFilterId: string | null;
  dispatcherFilterKey: string | null;
  onDriverFilterChange: (driverId: string | null) => void;
  onDispatcherFilterChange: (dispatcherKey: string | null) => void;
  drivers: { id: string; name: string }[];
  dispatchers: { id: string | null; name: string }[];
  allDriversLabel: string;
  allDispatchersLabel: string;
  driverPlaceholder: string;
  dispatcherPlaceholder: string;
  clearLabel: string;
  className?: string;
};

export function DriverStatusboardFilters({
  driverFilterId,
  dispatcherFilterKey,
  onDriverFilterChange,
  onDispatcherFilterChange,
  drivers,
  dispatchers,
  allDriversLabel,
  allDispatchersLabel,
  driverPlaceholder,
  dispatcherPlaceholder,
  clearLabel,
  className,
}: DriverStatusboardFiltersProps) {
  const dispatcherOptions = dispatchers.map((d) => ({
    id: d.id ?? STATUSBOARD_DISPATCHER_UNASSIGNED,
    name: d.name,
  }));
  const hasActiveFilters = Boolean(driverFilterId || dispatcherFilterKey);

  const handleClear = () => {
    onDriverFilterChange(null);
    onDispatcherFilterChange(null);
  };

  return (
    <div className={cn("inline-flex flex-wrap items-center justify-end gap-2", className)}>
      <FilterSelect
        value={driverFilterId ?? STATUSBOARD_FILTER_ALL}
        onChange={(next) =>
          onDriverFilterChange(next === STATUSBOARD_FILTER_ALL ? null : next)
        }
        placeholder={driverPlaceholder}
        allLabel={allDriversLabel}
        options={drivers}
        testId="driver-status-driver-filter"
      />
      {dispatcherOptions.length > 0 && (
        <FilterSelect
          value={dispatcherFilterKey ?? STATUSBOARD_FILTER_ALL}
          onChange={(next) =>
            onDispatcherFilterChange(next === STATUSBOARD_FILTER_ALL ? null : next)
          }
          placeholder={dispatcherPlaceholder}
          allLabel={allDispatchersLabel}
          options={dispatcherOptions}
          testId="driver-status-dispatcher-filter"
        />
      )}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2",
            "text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-sm",
            "hover:text-red-500 hover:border-red-500/40 transition-colors",
          )}
          data-testid="driver-status-clear-filters"
        >
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {clearLabel}
        </button>
      )}
    </div>
  );
}
