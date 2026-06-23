import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { filterUsStates, formatUsState, type UsStateOption } from "@/lib/us-states";
import { cn } from "@/lib/utils";

type StateLocationInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
};

export function StateLocationInput({ value, onChange, placeholder, id }: StateLocationInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => filterUsStates(value), [value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pickSuggestion = (state: UsStateOption) => {
    const trimmed = value.trim();
    const commaIdx = trimmed.lastIndexOf(",");
    if (commaIdx >= 0) {
      const cityPart = trimmed.slice(0, commaIdx).trim();
      onChange(cityPart ? `${cityPart}, ${state.abbr}` : formatUsState(state));
    } else {
      onChange(formatUsState(state));
    }
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && suggestions[activeIndex]) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md py-1"
          role="listbox"
        >
          {suggestions.map((state, index) => (
            <li key={state.abbr}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-muted/70",
                  index === activeIndex && "bg-muted",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(state)}
              >
                {formatUsState(state)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
