import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function ThemeToggle({
  compact = false,
  onDarkPanel = false,
}: {
  compact?: boolean;
  /** Light controls on navy sidebar / landing header */
  onDarkPanel?: boolean;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return compact ? (
      <span className="inline-block h-7 w-7" aria-hidden />
    ) : (
      <span className="inline-block h-8 w-[72px]" aria-hidden />
    );
  }

  const isDark = resolvedTheme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");
  const label = isDark ? t("theme.light") : t("theme.dark");

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
          onDarkPanel
            ? "text-blue-100 hover:bg-white/10 hover:text-white"
            : "text-blue-200 hover:bg-white/10 hover:text-white"
        }`}
        title={label}
        aria-label={label}
        data-testid="theme-toggle-compact"
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  if (onDarkPanel) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
        title={label}
        aria-label={label}
        data-testid="theme-toggle"
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
        <span>{isDark ? t("theme.lightShort") : t("theme.darkShort")}</span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      className="h-8 gap-1.5 border-border bg-card text-foreground hover:bg-muted"
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      <span className="text-xs font-medium">{isDark ? t("theme.lightShort") : t("theme.darkShort")}</span>
    </Button>
  );
}
