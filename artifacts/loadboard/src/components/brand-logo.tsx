import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";

/** Day / light theme */
const LOGO_DAY = "/logo_dark1.png?v=1";
/** Night / dark theme and dark panels (sidebar) */
const LOGO_NIGHT = "/logo_w1.png?v=1";

interface LoadBoardProLogoProps {
  className?: string;
  /** Sidebar / always-dark panel — use the light-on-dark logo */
  onDarkPanel?: boolean;
}

export function LoadBoardProLogo({ className = "", onDarkPanel = false }: LoadBoardProLogoProps) {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();

  const src =
    onDarkPanel || resolvedTheme === "dark" ? LOGO_NIGHT : LOGO_DAY;

  return (
    <img
      src={src}
      alt={t("brand")}
      className={`object-contain object-center ${className}`}
      draggable={false}
    />
  );
}
