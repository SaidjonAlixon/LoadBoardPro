import ExcelJS from "exceljs";
import type { Load } from "@workspace/api-client-react";

type ExportLabels = {
  sheetName: string;
  headers: string[];
  totals: string;
  status: (status: string) => string;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF5" },
};

const MONEY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0";

function cityState(city: string, state: string): string {
  if (city === "-") return "";
  return state ? `${city}, ${state}` : city;
}

function autoFitColumns(sheet: ExcelJS.Worksheet, min = 12, max = 44) {
  sheet.columns.forEach((column) => {
    if (!column || column.number == null) return;
    let width = min;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? "" : String(cell.value);
      width = Math.max(width, Math.min(value.length + 2, max));
    });
    column.width = width;
  });
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
}

function styleBodyCell(cell: ExcelJS.Cell, zebra: boolean) {
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

export async function exportAccountingExcel(
  loads: Load[],
  labels: ExportLabels,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Load Board Pro";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(labels.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow(labels.headers);
  styleHeaderRow(sheet.getRow(1));

  const moneyCols = new Set([11, 12, 13, 15, 16, 17, 18]);
  const numberCols = new Set([10, 14]);

  loads.forEach((load, index) => {
    const gross = (load.rate || 0) + (load.reimbursement || 0);
    const row = sheet.addRow([
      index + 1,
      load.loadNumber,
      load.driver?.fullName ?? "",
      load.broker?.name ?? "",
      load.dispatcher?.name ?? load.dispatcher?.email ?? "",
      load.puDate,
      cityState(load.originCity, load.originState),
      load.delDate,
      cityState(load.destCity, load.destState),
      load.mileage ?? 0,
      load.rate ?? 0,
      load.reimbursement ?? 0,
      gross,
      load.rpm ?? null,
      load.invoicedAmount ?? null,
      load.brokerPaid ?? null,
      load.irDiff ?? null,
      load.biDiff ?? null,
      labels.status(load.status),
      load.dispatchNotes ?? "",
      load.notes ?? "",
      load.weekStart,
    ]);

    row.eachCell((cell, col) => {
      styleBodyCell(cell, index % 2 === 1);
      if (moneyCols.has(col)) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      } else if (numberCols.has(col)) {
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
        rate: acc.rate + (l.rate || 0),
        reimb: acc.reimb + (l.reimbursement || 0),
        invoiced: acc.invoiced + (l.invoicedAmount || 0),
        paid: acc.paid + (l.brokerPaid || 0),
        biDiff: acc.biDiff + (l.biDiff ?? 0),
      }),
      { rate: 0, reimb: 0, invoiced: 0, paid: 0, biDiff: 0 },
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
      "",
      totals.rate,
      totals.reimb,
      totals.rate + totals.reimb,
      "",
      totals.invoiced,
      totals.paid,
      "",
      totals.biDiff,
      "",
      "",
      "",
      "",
    ]);

    totalRow.eachCell((cell, col) => {
      cell.fill = TOTAL_FILL;
      cell.font = { bold: true, size: 11 };
      cell.border = {
        top: { style: "medium", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      if (moneyCols.has(col)) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
      if (col === 2) {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });
  }

  autoFitColumns(sheet);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `accounting_${new Date().toISOString().split("T")[0]}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getAccountingExportLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
  translateStatus: (status: string) => string,
): ExportLabels {
  return {
    sheetName: t("accounting.title"),
    totals: t("loads.sheet.totals"),
    status: translateStatus,
    headers: [
      "#",
      t("dashboard.loadNumber"),
      t("dashboard.driver"),
      t("loads.broker"),
      t("loads.dispatcher"),
      t("loads.sheet.puDate"),
      t("loads.sheet.origin"),
      t("loads.sheet.delDate"),
      t("loads.sheet.destination"),
      t("loads.sheet.mileage"),
      t("loads.sheet.rate"),
      t("weekly.reimb"),
      t("loads.gross"),
      t("loads.sheet.rpm"),
      t("accounting.invoicedCol"),
      t("accounting.paidCol"),
      t("loads.sheet.irDiff"),
      t("loads.sheet.biDiff"),
      t("loads.sheet.status"),
      t("loads.sheet.dispatchNotes"),
      t("accounting.internalNotes"),
      t("accounting.week"),
    ],
  };
}
