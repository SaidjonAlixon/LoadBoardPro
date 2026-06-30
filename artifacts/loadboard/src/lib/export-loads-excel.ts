import ExcelJS from "exceljs";
import type { Load } from "@workspace/api-client-react";
import { todayIsoLocal } from "@/lib/date-range";

/** Matches app `--sheet-hdr` (hsl 210 57% 24%) and `--sheet-hdr-border` (hsl 210 57% 38%). */
const SHEET_HDR_BG = "FF1A3C5E";
const SHEET_HDR_BORDER = "FF3D6289";
const SHEET_HDR_BORDER_LIGHT = "FF5A85B5";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: SHEET_HDR_BG },
};

const HEADER_BORDER: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: SHEET_HDR_BORDER_LIGHT },
};

const BODY_FONT_SIZE = 13;
const HEADER_FONT_SIZE = 13;
const META_FONT_SIZE = 13;
const TITLE_FONT_SIZE = 15;

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: HEADER_FONT_SIZE,
};

const META_LABEL_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: META_FONT_SIZE,
  color: { argb: SHEET_HDR_BG },
};

const BODY_FONT: Partial<ExcelJS.Font> = {
  size: BODY_FONT_SIZE,
  color: { argb: "FF1E293B" },
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF5" },
};

const MONEY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0";

const LOADS_MONEY_COLS = new Set([12, 14, 17, 18, 19, 20]);
const LOADS_NUMBER_COLS = new Set([10, 11]);

function cityState(city: string, state: string): string {
  if (city === "-") return "";
  return state ? `${city}, ${state}` : city;
}

function driverTypeShort(type?: string): string {
  if (type === "CD") return "C/D";
  if (type === "OO") return "O/O";
  if (type === "Lease") return "Lease";
  return type ?? "";
}

function autoFitColumns(sheet: ExcelJS.Worksheet, headerLabels: string[], min = 14, max = 58) {
  const colCount = Math.max(headerLabels.length, sheet.columnCount);
  for (let col = 1; col <= colCount; col += 1) {
    const headerLen = (headerLabels[col - 1] ?? "").length;
    let width = Math.max(min, Math.min(headerLen * 1.15 + 5, max));
    sheet.getColumn(col).eachCell?.({ includeEmpty: true }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      width = Math.max(width, Math.min(text.length + 4, max));
    });
    sheet.getColumn(col).width = width;
  }
}

function styleHeaderRow(row: ExcelJS.Row, columnCount: number, headerLabels: string[]) {
  row.height = 34;
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    const label = headerLabels[col - 1];
    if (label) cell.value = label.toUpperCase();
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      top: { style: "medium", color: { argb: SHEET_HDR_BORDER } },
      left: col === 1 ? HEADER_BORDER : { style: "thin", color: { argb: SHEET_HDR_BORDER_LIGHT } },
      bottom: { style: "medium", color: { argb: SHEET_HDR_BORDER } },
      right: HEADER_BORDER,
    };
  }
}

function styleBody(cell: ExcelJS.Cell, zebra: boolean) {
  cell.font = BODY_FONT;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: zebra ? "FFF8FAFC" : "FFFFFFFF" },
  };
  cell.border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
  cell.alignment = { vertical: "middle", wrapText: false };
}

export type LoadsBoardExportLabels = {
  filePrefix: string;
  sheetName: string;
  title: string;
  week: string;
  status: string;
  driver: string;
  dispatcher: string;
  search: string;
  rowCount: string;
  all: string;
  none: string;
  headers: string[];
  totals: string;
  unassigned: string;
};

export type LoadsBoardExportMeta = {
  weekRange: string;
  statusValue: string;
  driverValue: string;
  dispatcherValue: string;
  searchValue: string;
};

export async function exportLoadsBoardExcel(
  loads: Load[],
  meta: LoadsBoardExportMeta,
  labels: LoadsBoardExportLabels,
  translateStatus: (s: string) => string,
  formatDate: (d: string | Date) => string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Load Board Pro";
  wb.created = new Date();

  const metaRowCount = 7;
  const headerRowIndex = metaRowCount + 2;

  const sheet = wb.addWorksheet(labels.sheetName, {
    views: [{ state: "frozen", ySplit: headerRowIndex, activeCell: `A${headerRowIndex + 1}` }],
  });

  const metaRows: [string, string][] = [
    [labels.title, labels.sheetName],
    [labels.week, meta.weekRange],
    [labels.status, meta.statusValue],
    [labels.driver, meta.driverValue],
    [labels.dispatcher, meta.dispatcherValue],
    [labels.search, meta.searchValue || labels.none],
    [labels.rowCount, String(loads.length)],
  ];

  metaRows.forEach(([label, value], i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(1).value = label;
    row.getCell(1).font = META_LABEL_FONT;
    row.getCell(2).value = value;
    row.getCell(2).font = { size: META_FONT_SIZE, color: { argb: "FF334155" } };
    if (i === 0) {
      row.getCell(2).font = { bold: true, size: TITLE_FONT_SIZE, color: { argb: SHEET_HDR_BG } };
    }
    row.height = 20;
  });

  sheet.addRow([]);
  sheet.addRow(labels.headers);
  styleHeaderRow(sheet.getRow(headerRowIndex), labels.headers.length, labels.headers);

  loads.forEach((load, i) => {
    const row = sheet.addRow([
      i + 1,
      driverTypeShort(load.driver?.driverType),
      load.driver?.fullName ?? labels.unassigned,
      load.broker?.name ?? "",
      load.loadNumber,
      formatDate(load.puDate),
      cityState(load.originCity, load.originState),
      load.delDate ? formatDate(load.delDate) : "",
      cityState(load.destCity, load.destState),
      load.mileage ?? 0,
      load.rpm ?? null,
      load.rate ?? 0,
      load.dispatcher?.name ?? load.dispatcher?.email ?? "",
      load.reimbursement ?? 0,
      load.dispatchNotes ?? "",
      translateStatus(load.status),
      load.invoicedAmount ?? null,
      load.irDiff ?? null,
      load.brokerPaid ?? null,
      load.biDiff ?? null,
    ]);

    row.height = 22;
    row.eachCell((cell, col) => {
      styleBody(cell, i % 2 === 1);
      if (LOADS_MONEY_COLS.has(col)) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      } else if (LOADS_NUMBER_COLS.has(col)) {
        cell.numFmt = NUMBER_FMT;
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      } else if (col === 1) {
        cell.alignment = { ...cell.alignment, horizontal: "center" };
      }
    });
  });

  if (loads.length > 0) {
    const totals = loads.reduce(
      (acc, l) => ({
        mileage: acc.mileage + (l.mileage || 0),
        rate: acc.rate + (l.rate || 0),
        reimb: acc.reimb + (l.reimbursement || 0),
        invoiced: acc.invoiced + (l.invoicedAmount || 0),
        paid: acc.paid + (l.brokerPaid || 0),
        biDiff: acc.biDiff + (l.biDiff ?? 0),
      }),
      { mileage: 0, rate: 0, reimb: 0, invoiced: 0, paid: 0, biDiff: 0 },
    );

    const totalRow = sheet.addRow([
      "",
      labels.totals,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.mileage,
      "",
      totals.rate,
      "",
      totals.reimb,
      "",
      "",
      totals.invoiced,
      "",
      totals.paid,
      totals.biDiff,
    ]);

    totalRow.height = 24;
    totalRow.eachCell((cell, col) => {
      cell.font = { ...BODY_FONT, bold: true };
      cell.fill = TOTAL_FILL;
      cell.border = {
        top: { style: "medium", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (LOADS_MONEY_COLS.has(col)) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else if (LOADS_NUMBER_COLS.has(col)) {
        cell.numFmt = NUMBER_FMT;
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
      if (col === 2) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });
  }

  autoFitColumns(sheet, labels.headers.map((h) => h.toUpperCase()));
  styleHeaderRow(sheet.getRow(headerRowIndex), labels.headers.length, labels.headers);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${labels.filePrefix}_${todayIsoLocal()}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getLoadsBoardExportLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
): LoadsBoardExportLabels {
  return {
    filePrefix: "loads",
    sheetName: t("loads.exportSheetName"),
    title: t("loads.title"),
    week: t("loads.exportWeek"),
    status: t("loads.status"),
    driver: t("loads.driver"),
    dispatcher: t("loads.dispatcher"),
    search: t("loads.exportSearch"),
    rowCount: t("loads.exportRowCount"),
    all: t("loads.exportAll"),
    none: t("common.emDash"),
    totals: t("loads.sheet.totals"),
    unassigned: t("loads.sheet.unassigned"),
    headers: [
      t("loads.sheet.rowNumber"),
      t("loads.sheet.type"),
      t("loads.sheet.driverName"),
      t("loads.sheet.brokerName"),
      t("loads.sheet.loadNumber"),
      t("loads.sheet.puDate"),
      t("loads.sheet.origin"),
      t("loads.sheet.delDate"),
      t("loads.sheet.destination"),
      t("loads.sheet.mileage"),
      t("loads.sheet.rpm"),
      t("loads.sheet.rate"),
      t("loads.sheet.dispatcher"),
      t("loads.sheet.reimbursement"),
      t("loads.sheet.dispatchNotes"),
      t("loads.sheet.status"),
      t("loads.sheet.invoicedAmount"),
      t("loads.sheet.irDiff"),
      t("loads.sheet.brokerPaid"),
      t("loads.sheet.biDiff"),
    ],
  };
}
