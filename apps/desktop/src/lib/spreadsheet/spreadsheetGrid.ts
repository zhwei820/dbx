import type { ColumnRegular } from "@revolist/revogrid";

export const SPREADSHEET_VIEWER_MAX_ROWS = 200_000;

// RevoGrid keys cells by prop; header text can repeat or be empty, so props are positional.
export function buildSpreadsheetGrid(headers: string[], rows: unknown[][]) {
  let width = headers.length;
  for (const row of rows) if (row.length > width) width = row.length;
  const columns: ColumnRegular[] = Array.from({ length: width }, (_, index) => ({
    prop: `c${index}`,
    name: headers[index] || columnLetter(index),
    // Header clicks select the column (spreadsheet-style); sorting lives in the header context menu.
    size: 140,
  }));
  const source = rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < width; index++) {
      const value = row[index];
      record[`c${index}`] = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : value;
    }
    return record;
  });
  return { columns, source };
}

export function columnLetter(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

export function spreadsheetSourceToRows(source: readonly Record<string, unknown>[], width: number): (string | number | boolean)[][] {
  return source.map((record) =>
    Array.from({ length: width }, (_, index) => {
      const value = record[`c${index}`];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : value == null ? "" : String(value);
    }),
  );
}

export function defaultCsvSavePath(filePath: string): string {
  if (/\.csv$/i.test(filePath)) return filePath;
  const dot = filePath.lastIndexOf(".");
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return `${dot > slash ? filePath.slice(0, dot) : filePath}.csv`;
}

// Tab-separated rows; fields that would break the row/column structure are quoted the way Excel pastes them.
export function tableClipboardText(rows: readonly (readonly unknown[])[]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = value == null ? "" : String(value);
          return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join("\t"),
    )
    .join("\n");
}

export function columnClipboardText(values: readonly unknown[], header?: string): string {
  const cells = header === undefined ? values : [header, ...values];
  return tableClipboardText(cells.map((value) => [value]));
}

export interface GridRange {
  x: number;
  y: number;
  x1: number;
  y1: number;
}

// Range indices are viewport positions, so rows must be the visible (sorted, filtered) source.
export function rangeClipboardText(rows: readonly Record<string, unknown>[], columns: readonly { prop: unknown; name?: unknown }[], range: GridRange, withHeader: boolean): string {
  const selectedColumns = columns.slice(range.x, range.x1 + 1);
  const body = rows.slice(range.y, range.y1 + 1).map((row) => selectedColumns.map((column) => row[String(column.prop)]));
  return tableClipboardText(withHeader ? [selectedColumns.map((column) => column.name ?? ""), ...body] : body);
}
