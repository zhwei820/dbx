import type { ColumnRegular } from "@revolist/revogrid";

export const SPREADSHEET_VIEWER_MAX_ROWS = 200_000;
export const SPREADSHEET_MAX_INSERT_ROWS = 10_000;
export const SPREADSHEET_MAX_INSERT_COLUMNS = 1_000;
const DEFAULT_COLUMN_SIZE = 140;
export const SPREADSHEET_MIN_COLUMN_SIZE = 60;
export const SPREADSHEET_MAX_COLUMN_SIZE = 300;
// Without a rendered grid to measure against, text is estimated by character count at the grid's 14px font;
// wide (CJK) glyphs count double.
const FIT_CHAR_WIDTH = 8;
// Cell padding on both sides, plus the filter button that shares the header with the column name.
const FIT_CELL_PADDING = 30;
const FIT_HEADER_CONTROL_WIDTH = 24;
// Fitting reads only the first rows, so a 200k-row file does not stall on open.
const FIT_SAMPLE_ROWS = 500;
// Longer text is past the size cap however narrow its glyphs, so only its start is measured.
const FIT_MAX_TEXT_LENGTH = 200;

// Rendered width of `text` in px; headers use the header font.
export type SpreadsheetTextMeasure = (text: string, header: boolean) => number;

export type SpreadsheetRecord = Record<string, unknown>;

// RevoGrid keys cells by prop; header text can repeat or be empty, so props are positional.
export function spreadsheetColumns(headers: readonly string[], width: number, sizes: readonly (number | undefined)[] = []): ColumnRegular[] {
  return Array.from({ length: width }, (_, index) => ({
    prop: `c${index}`,
    name: spreadsheetColumnName(headers, index),
    // Header clicks select the column (spreadsheet-style); sorting lives in the header context menu.
    size: sizes[index] ?? DEFAULT_COLUMN_SIZE,
  }));
}

export function buildSpreadsheetGrid(headers: string[], rows: unknown[][], measure?: SpreadsheetTextMeasure) {
  let width = headers.length;
  for (const row of rows) if (row.length > width) width = row.length;
  const columns = spreadsheetColumns(headers, width, fitSpreadsheetColumnSizes(headers, rows, width, measure));
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

// Each column is sized to its widest header or sampled value, like a spreadsheet's auto-fit, within the size bounds.
export function fitSpreadsheetColumnSizes(headers: readonly string[], rows: readonly unknown[][], width: number, measure: SpreadsheetTextMeasure = estimateTextWidth): number[] {
  const sample = rows.length > FIT_SAMPLE_ROWS ? rows.slice(0, FIT_SAMPLE_ROWS) : rows;
  return Array.from({ length: width }, (_, index) => {
    let size = measure(spreadsheetColumnName(headers, index).slice(0, FIT_MAX_TEXT_LENGTH), true) + FIT_CELL_PADDING + FIT_HEADER_CONTROL_WIDTH;
    for (const row of sample) {
      if (size >= SPREADSHEET_MAX_COLUMN_SIZE) break;
      const value = row[index];
      if (value === null || value === undefined || value === "") continue;
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      size = Math.max(size, measure(text.slice(0, FIT_MAX_TEXT_LENGTH), false) + FIT_CELL_PADDING);
    }
    return Math.min(SPREADSHEET_MAX_COLUMN_SIZE, Math.max(SPREADSHEET_MIN_COLUMN_SIZE, Math.ceil(size)));
  });
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch.codePointAt(0)! > 0x7e ? FIT_CHAR_WIDTH * 2 : FIT_CHAR_WIDTH;
    if (width >= SPREADSHEET_MAX_COLUMN_SIZE) break;
  }
  return width;
}

// Measures with the grid's own computed fonts, so fitting follows the theme and whichever font the platform resolves.
export function gridTextMeasure(grid: Element): SpreadsheetTextMeasure | undefined {
  const cell = document.createElement("canvas").getContext("2d");
  const header = document.createElement("canvas").getContext("2d");
  if (!cell || !header) return undefined;
  const style = getComputedStyle(grid);
  const headerSize = style.getPropertyValue("--rg-theme-header-font-size").trim() || style.fontSize;
  const headerWeight = style.getPropertyValue("--rg-theme-header-font-weight").trim() || "600";
  cell.font = `${style.fontSize} ${style.fontFamily}`;
  header.font = `${headerWeight} ${headerSize} ${style.fontFamily}`;
  return (text, isHeader) => (isHeader ? header : cell).measureText(text).width;
}

// A blank header shows the column letter, but stays blank in the headers that get saved.
export function spreadsheetColumnName(headers: readonly string[], index: number): string {
  return headers[index] || columnLetter(index);
}

// Headers can be shorter than the grid when rows are wider than the header row; renaming pads them out.
export function renameSpreadsheetHeader(headers: readonly string[], width: number, index: number, name: string): string[] {
  const next = Array.from({ length: Math.max(width, headers.length) }, (_, column) => headers[column] ?? "");
  if (index >= 0 && index < next.length) next[index] = name;
  return next;
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

export type SpreadsheetSaveFormat = "csv" | "xlsx";

// Edited cells and CSV values are text; plain numbers of up to eight digits become numeric cells in xlsx. Longer ones stay
// text so IDs and phone numbers keep every digit, as do leading zeros ("007") and anything with spaces or a "+".
const XLSX_NUMERIC_TEXT = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const XLSX_NUMERIC_MAX_DIGITS = 8;

export function spreadsheetXlsxRows(rows: readonly (readonly (string | number | boolean)[])[]): (string | number | boolean)[][] {
  return rows.map((row) =>
    row.map((value) => {
      if (typeof value !== "string" || !XLSX_NUMERIC_TEXT.test(value)) return value;
      return value.replace(/[-.]/g, "").length > XLSX_NUMERIC_MAX_DIGITS ? value : Number(value);
    }),
  );
}

export function defaultSpreadsheetSavePath(filePath: string, format: SpreadsheetSaveFormat): string {
  if (spreadsheetSaveFormat(filePath) === format) return filePath;
  const dot = filePath.lastIndexOf(".");
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return `${dot > slash ? filePath.slice(0, dot) : filePath}.${format}`;
}

export function spreadsheetSaveFormat(filePath: string): SpreadsheetSaveFormat | undefined {
  const match = /\.(csv|xlsx)$/i.exec(filePath);
  return match ? (match[1].toLowerCase() as SpreadsheetSaveFormat) : undefined;
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

export const SPREADSHEET_SEARCH_MATCH_LIMIT = 10_000;

export interface SpreadsheetCell {
  x: number;
  y: number;
}

// Case-insensitive substring match; `needle` is already lower-cased.
export function spreadsheetCellMatches(value: unknown, needle: string): boolean {
  return !!needle && value != null && value !== "" && String(value).toLowerCase().includes(needle);
}

// Row-major, so stepping through matches reads the sheet the way Excel's find does.
export function findSpreadsheetMatches(rows: readonly Record<string, unknown>[], props: readonly string[], query: string, limit = SPREADSHEET_SEARCH_MATCH_LIMIT): SpreadsheetCell[] {
  const needle = query.toLowerCase();
  const matches: SpreadsheetCell[] = [];
  if (!needle) return matches;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < props.length; x++) {
      if (!spreadsheetCellMatches(row[props[x]], needle)) continue;
      matches.push({ x, y });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

// Index of the nearest match after (delta 1) or before (delta -1) the cursor, wrapping around the sheet.
// `inclusive` lets the cursor's own cell count, so typing a query keeps a cell that already matches.
export function spreadsheetMatchFrom(matches: readonly SpreadsheetCell[], cursor: SpreadsheetCell | undefined, delta: 1 | -1, inclusive = false): number {
  if (matches.length === 0) return -1;
  if (!cursor) return delta === 1 ? 0 : matches.length - 1;
  const compare = (match: SpreadsheetCell) => match.y - cursor.y || match.x - cursor.x;
  if (delta === 1) {
    const index = matches.findIndex((match) => (inclusive ? compare(match) >= 0 : compare(match) > 0));
    return index >= 0 ? index : 0;
  }
  for (let index = matches.length - 1; index >= 0; index--) {
    if (inclusive ? compare(matches[index]) <= 0 : compare(matches[index]) < 0) return index;
  }
  return matches.length - 1;
}

// Reads tab-separated clipboard text, including the quoted fields that tableClipboardText and Excel write
// for values containing tabs, line breaks or quotes.
export function parseSpreadsheetClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[index + 1] === '"') field += text[++index];
      else quoted = false;
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === "\t") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  // A trailing line break does not start another row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Excel-style paste: a selection the copied block tiles evenly is filled with repeats of it, so one copied value
// fills every selected cell; otherwise the block is pasted once from the selection's top-left corner.
// Cells past the last row or column are dropped.
export function spreadsheetPasteCells(clip: readonly (readonly string[])[], range: GridRange, rowCount: number, columnCount: number): (SpreadsheetCell & { value: string })[] {
  const height = clip.length;
  const width = Math.max(0, ...clip.map((row) => row.length));
  if (height === 0 || width === 0) return [];
  const rangeHeight = range.y1 - range.y + 1;
  const rangeWidth = range.x1 - range.x + 1;
  const tiles = rangeHeight % height === 0 && rangeWidth % width === 0;
  const cells: (SpreadsheetCell & { value: string })[] = [];
  for (let dy = 0; dy < (tiles ? rangeHeight : height) && range.y + dy < rowCount; dy++) {
    for (let dx = 0; dx < (tiles ? rangeWidth : width) && range.x + dx < columnCount; dx++) {
      cells.push({ x: range.x + dx, y: range.y + dy, value: clip[dy % height][dx % width] ?? "" });
    }
  }
  return cells;
}

const valueCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// The column's distinct non-empty values in alphabetical order (numbers by value), for the Equal / Not equal filter.
export function distinctSpreadsheetValues(rows: readonly Record<string, unknown>[], prop: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    const value = row[prop];
    if (value != null && value !== "") values.add(String(value));
  }
  return [...values].sort(valueCollator.compare);
}
