import ExcelJS from "exceljs";
import type {
  KpiMetrics,
  DispatcherRank,
  StatusCount,
  Load,
  ListLoadsParams,
} from "@workspace/api-client-react";
import { listLoads } from "@workspace/api-client-react";
import {
  sortDriversTodayBlocks,
  type DriversTodayResponse,
} from "@/lib/drivers-today";

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

function autoFitColumns(sheet: ExcelJS.Worksheet, min = 14, max = 48) {
  sheet.columns.forEach((column) => {
    if (!column?.eachCell) return;
    let width = min;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      width = Math.max(width, Math.min(text.length + 3, max));
    });
    column.width = width;
  });
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 24;
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

function styleBody(cell: ExcelJS.Cell, zebra: boolean) {
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

export type DashboardExportLabels = {
  filePrefix: string;
  sheets: {
    summary: string;
    performance: string;
    status: string;
    loads: string;
    drivers: string;
  };
  summary: {
    title: string;
    period: string;
    dispatcher: string;
    allDispatchers: string;
    metric: string;
    value: string;
    totalGross: string;
    totalMiles: string;
    avgRpm: string;
    grossPerDriver: string;
    driversTotal: string;
    driversOnLoad: string;
    driversEmpty: string;
  };
  performance: {
    rank: string;
    dispatcher: string;
    loads: string;
    gross: string;
    avgRpm: string;
    score: string;
  };
  status: {
    status: string;
    count: string;
  };
  loads: {
    period: string;
    dispatcher: string;
    headers: string[];
    totals: string;
    unassigned: string;
  };
  drivers: {
    title: string;
    date: string;
    scope: string;
    sectionOverview: string;
    sectionLoads: string;
    overviewHeaders: string[];
    loadHeaders: string[];
    statusCovered: string;
    statusReady: string;
    active: string;
    inactive: string;
    noLoadToday: string;
  };
};

export type DashboardExportData = {
  periodLabel: string;
  dispatcherLabel: string;
  kpi: KpiMetrics;
  ranking: DispatcherRank[];
  statusBreakdown: StatusCount[];
  loads: Load[];
  driversToday?: DriversTodayResponse;
  driversScopeLabel?: string;
  formatCurrency: (n: number | null | undefined) => string;
  formatDate: (d: string | Date) => string;
  formatNumber: (n: number | null | undefined) => string;
  translateStatus: (s: string) => string;
};

export async function fetchAllFilteredLoads(params: ListLoadsParams): Promise<Load[]> {
  const limit = 200;
  let page = 1;
  const all: Load[] = [];
  let total = Infinity;

  while (all.length < total) {
    const res = await listLoads({ ...params, limit, page });
    total = res.total ?? 0;
    const batch = res.data ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    page += 1;
  }

  return all;
}

export function getDashboardLoadsExportLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
): Pick<DashboardExportLabels["loads"], "headers" | "totals" | "unassigned"> {
  return {
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

function addDriversTodaySheet(
  wb: ExcelJS.Workbook,
  data: DashboardExportData,
  labels: DashboardExportLabels,
) {
  if (!data.driversToday) return;

  const sheet = wb.addWorksheet(labels.sheets.drivers, { views: [{ state: "frozen", ySplit: 6 }] });
  const blocks = sortDriversTodayBlocks(data.driversToday.allDrivers);
  const scopeLabel = data.driversScopeLabel ?? "";

  sheet.mergeCells("A1:M1");
  sheet.getCell("A1").value = labels.drivers.title;
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  sheet.getCell("A2").value = `${labels.drivers.date}: ${data.formatDate(data.driversToday.date)}`;
  sheet.getCell("A2").font = { size: 11, color: { argb: "FF475569" } };
  if (scopeLabel) {
    sheet.getCell("A3").value = `${labels.drivers.scope}: ${scopeLabel}`;
    sheet.getCell("A3").font = { size: 11, color: { argb: "FF475569" } };
  }

  sheet.addRow([]);
  const overviewTitleRow = sheet.addRow([labels.drivers.sectionOverview]);
  overviewTitleRow.font = { bold: true, size: 12, color: { argb: "FF1E3A5F" } };

  sheet.addRow(labels.drivers.overviewHeaders);
  styleHeaderRow(sheet.getRow(sheet.rowCount));

  blocks.forEach((block, i) => {
    const isCovered = block.loads.length > 0;
    const row = sheet.addRow([
      i + 1,
      block.driver.fullName,
      driverTypeShort(block.driver.driverType),
      block.driver.truckNumber ?? "",
      block.driver.phone ?? "",
      block.driver.email ?? "",
      isCovered ? labels.drivers.statusCovered : labels.drivers.statusReady,
      block.driver.currentLocation ?? "",
      block.loads.length,
      block.totalGross,
      block.totalMiles,
      block.totalReimbursement ?? 0,
      block.driver.isActive ? labels.drivers.active : labels.drivers.inactive,
    ]);
    row.eachCell((cell, col) => {
      styleBody(cell, i % 2 === 1);
      if (col === 9 || col === 11) {
        cell.numFmt = NUMBER_FMT;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (col === 10 || col === 12) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (col === 1) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    });
  });

  sheet.addRow([]);
  const loadsTitleRow = sheet.addRow([labels.drivers.sectionLoads]);
  loadsTitleRow.font = { bold: true, size: 12, color: { argb: "FF1E3A5F" } };

  sheet.addRow(labels.drivers.loadHeaders);
  styleHeaderRow(sheet.getRow(sheet.rowCount));

  let loadRowIndex = 0;
  blocks.forEach((block) => {
    if (block.loads.length === 0) {
      const row = sheet.addRow([
        block.driver.fullName,
        labels.drivers.noLoadToday,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      row.eachCell((cell) => styleBody(cell, loadRowIndex % 2 === 1));
      loadRowIndex += 1;
      return;
    }

    block.loads.forEach((load) => {
      const row = sheet.addRow([
        block.driver.fullName,
        load.loadNumber,
        data.translateStatus(load.status),
        load.puDate,
        cityState(load.originCity, load.originState),
        load.delDate ?? "",
        cityState(load.destCity, load.destState),
        load.mileage ?? 0,
        load.rpm ?? null,
        load.rate ?? 0,
        load.reimbursement ?? 0,
        load.dispatcher?.name ?? load.dispatcher?.email ?? "",
        load.broker?.name ?? "",
        load.dispatchNotes ?? "",
      ]);
      row.eachCell((cell, col) => {
        styleBody(cell, loadRowIndex % 2 === 1);
        if (col === 8) {
          cell.numFmt = NUMBER_FMT;
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if ([9, 10, 11].includes(col)) {
          cell.numFmt = MONEY_FMT;
          cell.alignment = { horizontal: "right", vertical: "middle" };
        }
      });
      loadRowIndex += 1;
    });
  });

  autoFitColumns(sheet, 14, 52);
}

export async function exportDashboardExcel(
  data: DashboardExportData,
  labels: DashboardExportLabels,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Load Board Pro";
  wb.created = new Date();

  const summary = wb.addWorksheet(labels.sheets.summary, { views: [{ state: "frozen", ySplit: 3 }] });
  summary.mergeCells("A1:B1");
  summary.getCell("A1").value = labels.summary.title;
  summary.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
  summary.getCell("A2").value = `${labels.summary.period}: ${data.periodLabel}`;
  summary.getCell("A3").value = `${labels.summary.dispatcher}: ${data.dispatcherLabel}`;

  summary.addRow([labels.summary.metric, labels.summary.value]);
  styleHeaderRow(summary.getRow(5));

  const kpiRows: [string, string | number][] = [
    [labels.summary.totalGross, data.kpi.totalGross ?? 0],
    [labels.summary.totalMiles, data.kpi.totalMiles ?? 0],
    [labels.summary.avgRpm, data.kpi.avgRpm ?? 0],
    [labels.summary.grossPerDriver, data.kpi.grossPerDriver ?? 0],
    [labels.summary.driversTotal, data.kpi.totalDrivers ?? 0],
    [labels.summary.driversOnLoad, data.kpi.driversOnLoad ?? 0],
    [labels.summary.driversEmpty, data.kpi.driversEmpty ?? 0],
  ];

  kpiRows.forEach(([metric, value], i) => {
    const row = summary.addRow([metric, value]);
    row.eachCell((cell, col) => {
      styleBody(cell, i % 2 === 1);
      if (col === 2 && typeof value === "number" && i === 1) {
        cell.numFmt = NUMBER_FMT;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if (col === 2 && typeof value === "number" && i !== 1) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
    });
  });
  autoFitColumns(summary);

  const perf = wb.addWorksheet(labels.sheets.performance, { views: [{ state: "frozen", ySplit: 1 }] });
  perf.addRow([
    labels.performance.rank,
    labels.performance.dispatcher,
    labels.performance.loads,
    labels.performance.gross,
    labels.performance.avgRpm,
    labels.performance.score,
  ]);
  styleHeaderRow(perf.getRow(1));
  data.ranking.forEach((r, i) => {
    const row = perf.addRow([i + 1, r.dispatcherName, r.loads, r.gross, r.avgRpm, r.kpiScore]);
    row.eachCell((cell, col) => {
      styleBody(cell, i % 2 === 1);
      if ([4, 5].includes(col)) cell.numFmt = MONEY_FMT;
      if (col === 4 || col === 5 || col === 6) cell.alignment = { horizontal: "right", vertical: "middle" };
      if (col === 1) cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  });
  autoFitColumns(perf);

  const statusSheet = wb.addWorksheet(labels.sheets.status, { views: [{ state: "frozen", ySplit: 1 }] });
  statusSheet.addRow([labels.status.status, labels.status.count]);
  styleHeaderRow(statusSheet.getRow(1));
  data.statusBreakdown.forEach((s, i) => {
    const row = statusSheet.addRow([data.translateStatus(s.status), s.count]);
    row.eachCell((cell, col) => {
      styleBody(cell, i % 2 === 1);
      if (col === 2) cell.alignment = { horizontal: "right", vertical: "middle" };
    });
  });
  autoFitColumns(statusSheet);

  const loadsSheet = wb.addWorksheet(labels.sheets.loads, { views: [{ state: "frozen", ySplit: 3 }] });
  loadsSheet.getCell("A1").value = `${labels.loads.period}: ${data.periodLabel}`;
  loadsSheet.getCell("A1").font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
  loadsSheet.getCell("A2").value = `${labels.loads.dispatcher}: ${data.dispatcherLabel}`;
  loadsSheet.getCell("A2").font = { size: 11, color: { argb: "FF475569" } };

  loadsSheet.addRow(labels.loads.headers);
  styleHeaderRow(loadsSheet.getRow(3));

  data.loads.forEach((load, i) => {
    const row = loadsSheet.addRow([
      i + 1,
      driverTypeShort(load.driver?.driverType),
      load.driver?.fullName ?? labels.loads.unassigned,
      load.broker?.name ?? "",
      load.loadNumber,
      load.puDate,
      cityState(load.originCity, load.originState),
      load.delDate ?? "",
      cityState(load.destCity, load.destState),
      load.mileage ?? 0,
      load.rpm ?? null,
      load.rate ?? 0,
      load.dispatcher?.name ?? load.dispatcher?.email ?? "",
      load.reimbursement ?? 0,
      load.dispatchNotes ?? "",
      data.translateStatus(load.status),
      load.invoicedAmount ?? null,
      load.irDiff ?? null,
      load.brokerPaid ?? null,
      load.biDiff ?? null,
    ]);

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

  if (data.loads.length > 0) {
    const totals = data.loads.reduce(
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

    const totalRow = loadsSheet.addRow([
      "",
      labels.loads.totals,
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

    totalRow.eachCell((cell, col) => {
      cell.fill = TOTAL_FILL;
      cell.font = { bold: true, size: 11 };
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

  autoFitColumns(loadsSheet, 14, 52);

  addDriversTodaySheet(wb, data, labels);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${labels.filePrefix}_${new Date().toISOString().split("T")[0]}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
