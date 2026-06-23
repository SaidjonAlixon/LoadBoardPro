import type { Load } from "@workspace/api-client-react";
import { translateLoadStatus } from "@/lib/i18n/translate";
import { toCityState } from "@/components/sheet-editable-cell";

const HDR_FONT = "bold 10px Inter, sans-serif";
const HDR_FONT_WIDE = "bold 12px Inter, sans-serif";
const CELL_FONT = "11px Inter, sans-serif";
const HDR_PAD = 32;
const HDR_PAD_WIDE = 40;

type TFn = (key: string, vars?: Record<string, string | number>) => string;

let measureCanvas: HTMLCanvasElement | null = null;

function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export const ROUTE_COL_INDICES = [5, 6, 7, 8] as const;
export const EYE_COL_INDEX = 16;

export function filterWidthsForRoute(widths: number[], showRouteDetails: boolean): number[] {
  if (showRouteDetails) return widths;
  return widths.filter((_, i) => i < 5 || i > 8);
}

export function filterVisibleWidths(
  widths: number[],
  opts: { showRouteDetails: boolean; showActionColumn: boolean },
): number[] {
  return widths.filter((_, i) => {
    if (!opts.showRouteDetails && i >= 5 && i <= 8) return false;
    if (!opts.showActionColumn && i === EYE_COL_INDEX) return false;
    return true;
  });
}

/** Scale columns to exactly fill the container (shrink or grow). */
export function scaleWidthsToContainer(
  widths: number[],
  containerWidth: number,
  financialColCount = 0,
): number[] {
  if (containerWidth <= 0) return widths;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum === 0) return widths;
  if (sum === containerWidth) return [...widths];

  if (sum > containerWidth) {
    const factor = containerWidth / sum;
    const result = widths.map((w) => Math.max(24, Math.round(w * factor)));
    const drift = containerWidth - result.reduce((a, b) => a + b, 0);
    if (drift !== 0 && result.length > 0) {
      result[result.length - 1] = Math.max(24, result[result.length - 1] + drift);
    }
    return result;
  }

  const extra = containerWidth - sum;
  const result = [...widths];
  const finCount = Math.min(financialColCount, widths.length);
  const finStart = widths.length - finCount;

  if (finCount > 0) {
    const finSum = widths.slice(finStart).reduce((a, b) => a + b, 0);
    const otherSum = sum - finSum;
    const finExtra = Math.round(extra * 0.45);
    const otherExtra = extra - finExtra;

    for (let i = 0; i < finStart; i++) {
      result[i] = Math.round(widths[i] + (otherExtra * widths[i]) / otherSum);
    }
    for (let i = finStart; i < widths.length; i++) {
      result[i] = Math.round(widths[i] + (finExtra * widths[i]) / finSum);
    }
  } else {
    const factor = containerWidth / sum;
    for (let i = 0; i < widths.length; i++) {
      result[i] = Math.round(widths[i] * factor);
    }
  }

  const drift = containerWidth - result.reduce((a, b) => a + b, 0);
  if (drift !== 0 && result.length > 0) {
    result[result.length - 1] += drift;
  }
  return result;
}

function headerMinWidth(label: string, wide: boolean): number {
  const font = wide ? HDR_FONT_WIDE : HDR_FONT;
  const pad = wide ? HDR_PAD_WIDE : HDR_PAD;
  return Math.ceil(textWidth(label, font)) + pad;
}

export function getDefaultSheetWidths(wide: boolean, showFinancial: boolean): number[] {
  const w = wide;
  const base = [
    40,
    56,
    w ? 160 : 140,
    w ? 120 : 100,
    w ? 100 : 90,
    82,
    w ? 140 : 110,
    82,
    w ? 140 : 110,
    w ? 85 : 75,
    w ? 75 : 70,
    w ? 95 : 90,
    w ? 120 : 110,
    Math.max(w ? 152 : 138, headerMinWidth("REIMBURSEMENT", w)),
    Math.max(w ? 160 : 132, headerMinWidth("DISPATCH NOTES", w)),
    92,
    36,
  ];
  if (showFinancial) {
    base.push(
      Math.max(w ? 158 : 142, headerMinWidth("INVOICED AMOUNT", w)),
      Math.max(w ? 108 : 96, headerMinWidth("I - R+R", w)),
      w ? 110 : 100,
      w ? 100 : 92,
    );
  }
  return base;
}

function cityLabel(city: string, state: string, emDash: string): string {
  return city === "-" ? emDash : toCityState(city, state);
}

function driverTypeShort(type?: string): string {
  if (type === "CD") return "C/D";
  if (type === "OO") return "O/O";
  if (type === "Lease") return "Lease";
  return "—";
}

function fitWidth(texts: string[], min: number, max: number, font = CELL_FONT, pad = 28): number {
  const maxText = Math.max(...texts.filter(Boolean).map((txt) => textWidth(txt, font)), 0);
  return Math.min(max, Math.max(min, Math.ceil(maxText) + pad));
}

export function computeAutoFitWidths(
  loads: Load[],
  wide: boolean,
  showFinancial: boolean,
  t: TFn,
  formatCurrency: (n: number) => string,
  formatNumber: (n: number) => string,
): number[] {
  const em = t("common.emDash");
  const colTexts: string[][] = [
    [t("loads.sheet.rowNumber")],
    [t("loads.sheet.type")],
    [t("loads.sheet.driverName")],
    [t("loads.sheet.brokerName")],
    [t("loads.sheet.loadNumber")],
    [t("loads.sheet.puDate")],
    [t("loads.sheet.origin")],
    [t("loads.sheet.delDate")],
    [t("loads.sheet.destination")],
    [t("loads.sheet.mileage")],
    [t("loads.sheet.rpm")],
    [t("loads.sheet.rate")],
    [t("loads.sheet.dispatcher")],
    [t("loads.sheet.reimbursement")],
    [t("loads.sheet.dispatchNotes")],
    [t("loads.sheet.status")],
    [""],
  ];
  if (showFinancial) {
    colTexts.push(
      [t("loads.sheet.invoicedAmount")],
      [t("loads.sheet.irDiff")],
      [t("loads.sheet.brokerPaid")],
      [t("loads.sheet.biDiff")],
    );
  }

  let rowNum = 0;
  for (const load of loads) {
    rowNum += 1;
    colTexts[0].push(String(rowNum));
    colTexts[1].push(driverTypeShort(load.driver?.driverType));
    colTexts[2].push(load.driver?.fullName ?? t("loads.sheet.unassigned"));
    colTexts[3].push(load.broker?.name ?? em);
    colTexts[4].push(load.loadNumber ?? "");
    colTexts[5].push(load.puDate?.split("T")[0] ?? "");
    colTexts[6].push(cityLabel(load.originCity, load.originState, em));
    colTexts[7].push(load.delDate?.split("T")[0] ?? "");
    colTexts[8].push(cityLabel(load.destCity, load.destState, em));
    colTexts[9].push(formatNumber(load.mileage ?? 0));
    colTexts[10].push(load.rpm != null && load.rpm > 0 ? formatCurrency(load.rpm) : em);
    colTexts[11].push(formatCurrency(load.rate ?? 0));
    colTexts[12].push(load.dispatcher?.name ?? em);
    colTexts[13].push(load.reimbursement ? formatCurrency(load.reimbursement) : em);
    colTexts[14].push(load.dispatchNotes ?? em);
    colTexts[15].push(translateLoadStatus(t, load.status));
    if (showFinancial) {
      colTexts[17].push(load.invoicedAmount != null ? formatCurrency(load.invoicedAmount) : em);
      colTexts[18].push(load.irDiff != null ? formatCurrency(load.irDiff) : em);
      colTexts[19].push(load.brokerPaid != null ? formatCurrency(load.brokerPaid) : em);
      colTexts[20].push(load.biDiff != null ? formatCurrency(load.biDiff) : em);
    }
  }

  colTexts[2].push(t("loads.sheet.totals"));

  const widths = colTexts.map((texts, i) => {
    if (i === 16) return 36;
    const max = i === 14 ? 360 : i === 2 ? 220 : 260;
    const hdrPad = wide ? HDR_PAD_WIDE : HDR_PAD;
    const hdrFont = wide ? HDR_FONT_WIDE : HDR_FONT;
    const min =
      i === 0 ? 36
      : i === 1 ? 48
      : i === 13 ? headerMinWidth(t("loads.sheet.reimbursement"), wide)
      : i === 14 ? headerMinWidth(t("loads.sheet.dispatchNotes"), wide)
      : i === 17 && showFinancial ? headerMinWidth(t("loads.sheet.invoicedAmount"), wide)
      : 56;
    const font = i <= 15 || (showFinancial && i >= 17) ? hdrFont : CELL_FONT;
    const pad = i <= 15 || (showFinancial && i >= 17) ? hdrPad : 28;
    return fitWidth(texts, min, max, font, pad);
  });

  return widths;
}
