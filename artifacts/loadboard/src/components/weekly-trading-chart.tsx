import { useMemo } from "react";
import { addDays, APP_TIMEZONE, normalizeWeekStart } from "@/lib/date-range";
import { useI18n } from "@/lib/i18n";

export type WeeklyTradingChartProps = {
  values: number[];
  weekStart: string;
  compact?: boolean;
  formatValue?: (n: number) => string;
  ariaLabel: string;
};

const GREEN = "#22c55e";
const RED = "#ef4444";
const WICK = "#94a3b8";

function buildCandles(values: number[]) {
  return values.map((close, i) => {
    const open = i === 0 ? 0 : values[i - 1]!;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    return { open, close, high, low, up: close >= open };
  });
}

export function WeeklyTradingChart({
  values,
  weekStart,
  compact = false,
  formatValue,
  ariaLabel,
}: WeeklyTradingChartProps) {
  const { t } = useI18n();
  const mon = normalizeWeekStart(weekStart);

  const dayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      weekday: compact ? "narrow" : "short",
    });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(`${addDays(mon, i)}T12:00:00`)),
    );
  }, [mon, compact]);

  const candles = useMemo(() => buildCandles(values), [values]);
  const maxVal = Math.max(1, ...candles.map((c) => c.high));
  const fmt = formatValue ?? ((n: number) => String(n));

  const width = compact ? 70 : 280;
  const height = compact ? 22 : 120;
  const padX = compact ? 0 : 8;
  const padTop = compact ? 0 : 8;
  const padBottom = compact ? 0 : 22;
  const chartH = height - padTop - padBottom;
  const slotW = (width - padX * 2) / 7;
  const bodyW = compact ? 7 : Math.max(10, slotW * 0.55);

  const yFor = (v: number) => padTop + chartH - (v / maxVal) * chartH;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full max-w-full"
      role="img"
      aria-label={ariaLabel}
    >
      {!compact &&
        [0.25, 0.5, 0.75].map((pct) => {
          const y = padTop + chartH * (1 - pct);
          return (
            <line
              key={pct}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

      {candles.map((c, i) => {
        const cx = padX + slotW * i + slotW / 2;
        const yHigh = yFor(c.high);
        const yLow = yFor(c.low);
        const yOpen = yFor(c.open);
        const yClose = yFor(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(compact ? 2 : 3, Math.abs(yClose - yOpen) || (compact ? 2 : 4));
        const color = c.up ? GREEN : RED;
        const label = dayLabels[i] ?? "";

        return (
          <g key={i}>
            <title>
              {t("dashboard.tradingChartDay", {
                day: label,
                value: fmt(c.close),
                change: c.up ? "↑" : "↓",
              })}
            </title>
            <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={WICK} strokeWidth={compact ? 1 : 1.5} />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              rx={compact ? 1.5 : 2}
              fill={color}
            />
            {!compact && (
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={9}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
