import type { ColumnRegular } from "@revolist/revogrid";

export const SPREADSHEET_VIEWER_MAX_ROWS = 200_000;
export const SPREADSHEET_MAX_INSERT_ROWS = 10_000;
export const SPREADSHEET_MAX_INSERT_COLUMNS = 1_000;
const DEFAULT_COLUMN_SIZE = 140;

export type SpreadsheetRecord = Record<string, unknown>;

// RevoGrid keys cells by prop; header text can repeat or be empty, so props are positional.
export function spreadsheetColumns(headers: readonly string[], width: number, sizes: readonly (number | undefined)[] = []): ColumnRegular[] {
  return Array.from({ length: width }, (_, index) => ({
    prop: `c${index}`,
    name: headers[index] || columnLetter(index),
    // Header clicks select the column (spreadsheet-style); sorting lives in the header context menu.
    size: sizes[index] ?? DEFAULT_COLUMN_SIZE,
  }));
}

export function buildSpreadsheetGrid(headers: string[], rows: unknown[][]) {
  let width = headers.length;
  for (const row of rows) if (row.length > width) width = row.length;
  const columns = spreadsheetColumns(headers, width);
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

function emptyRecord(width: number): SpreadsheetRecord {
  const record: SpreadsheetRecord = {};
  for (let index = 0; index < width; index++) record[`c${index}`] = "";
  return record;
}

// Row helpers take physical source indices and return a new array; untouched records keep their identity.
export function insertSpreadsheetRows(source: readonly SpreadsheetRecord[], at: number, count: number, width: number): SpreadsheetRecord[] {
  const index = Math.min(Math.max(at, 0), source.length);
  const inserted = Array.from({ length: count }, () => emptyRecord(width));
  return [...source.slice(0, index), ...inserted, ...source.slice(index)];
}

// Copies keep the original order and land as one block after the last duplicated row.
export function duplicateSpreadsheetRows(source: readonly SpreadsheetRecord[], indices: readonly number[]): { source: SpreadsheetRecord[]; at: number; count: number } {
  const sorted = [...new Set(indices)].filter((index) => index >= 0 && index < source.length).sort((a, b) => a - b);
  if (sorted.length === 0) return { source: [...source], at: source.length, count: 0 };
  const at = sorted[sorted.length - 1] + 1;
  const copies = sorted.map((index) => ({ ...source[index] }));
  return { source: [...source.slice(0, at), ...copies, ...source.slice(at)], at, count: copies.length };
}

export function deleteSpreadsheetRows(source: readonly SpreadsheetRecord[], indices: readonly number[]): SpreadsheetRecord[] {
  const removed = new Set(indices);
  return source.filter((_, index) => !removed.has(index));
}

// A column captured with its contents, so a removed column can be put back.
export interface SpreadsheetColumnData {
  header: string;
  size?: number;
  values: readonly unknown[];
}

// Removes `remove` columns at `at`, then inserts one column per `insert` entry: a source column index to copy, null for an empty column, or captured column data.
export interface SpreadsheetColumnSplice {
  at: number;
  remove: number;
  insert: readonly (number | null | SpreadsheetColumnData)[];
}

export function spliceSpreadsheetColumnList<T>(items: readonly T[], splice: SpreadsheetColumnSplice, empty: T, restore: (column: SpreadsheetColumnData) => T = () => empty): T[] {
  const inserted = splice.insert.map((entry) => (entry === null ? empty : typeof entry === "number" ? (items[entry] ?? empty) : restore(entry)));
  const next = [...items];
  next.splice(splice.at, splice.remove, ...inserted);
  return next;
}

export interface SpreadsheetTable {
  headers: string[];
  source: SpreadsheetRecord[];
  width: number;
}

export function spliceSpreadsheetColumns(table: SpreadsheetTable, splice: SpreadsheetColumnSplice): SpreadsheetTable {
  const headers = spliceSpreadsheetColumnList(
    Array.from({ length: table.width }, (_, index) => table.headers[index] ?? ""),
    splice,
    "",
    (column) => column.header,
  );
  const width = headers.length;
  const source = table.source.map((record, row) => {
    const cells = spliceSpreadsheetColumnList(
      Array.from({ length: table.width }, (_, index) => record[`c${index}`] ?? ""),
      splice,
      "" as unknown,
      (column) => column.values[row] ?? "",
    );
    const next: SpreadsheetRecord = {};
    for (let index = 0; index < width; index++) next[`c${index}`] = cells[index];
    return next;
  });
  return { headers, source, width };
}

export function insertColumnsSplice(at: number, count: number): SpreadsheetColumnSplice {
  return { at, remove: 0, insert: Array.from({ length: count }, () => null) };
}

export function duplicateColumnsSplice(start: number, end: number): SpreadsheetColumnSplice {
  return { at: end + 1, remove: 0, insert: Array.from({ length: end - start + 1 }, (_, offset) => start + offset) };
}

export function deleteColumnsSplice(start: number, end: number): SpreadsheetColumnSplice {
  return { at: start, remove: end - start + 1, insert: [] };
}

export function captureSpreadsheetColumns(table: SpreadsheetTable, sizes: readonly (number | undefined)[], at: number, count: number): SpreadsheetColumnData[] {
  return Array.from({ length: Math.max(0, Math.min(count, table.width - at)) }, (_, offset) => {
    const prop = `c${at + offset}`;
    return { header: table.headers[at + offset] ?? "", size: sizes[at + offset], values: table.source.map((record) => record[prop] ?? "") };
  });
}
