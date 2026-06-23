import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";

/** Light backgrounds (day mode) */
const LOGO_DAY = "/logo_dark.png?v=1";
/** Dark backgrounds (night mode) */
const LOGO_NIGHT = "/logo.png?v=2";
/** Sidebar and dark panels */
const LOGO_SIDEBAR = "/logo_w1.png?v=1";

interface LoadBoardProLogoProps {
  className?: string;
  /** Sidebar / always-dark panel — always use the night logo */
  onDarkPanel?: boolean;
}

export function LoadBoardProLogo({ className = "", onDarkPanel = false }: LoadBoardProLogoProps) {
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();

  const src = onDarkPanel
    ? LOGO_SIDEBAR
    : resolvedTheme === "dark"
      ? LOGO_NIGHT
      : LOGO_DAY;

  return (
    <img
      src={src}
      alt={t("brand")}
      className={`object-contain object-center ${className}`}
      draggable={false}
    />
  );
}
