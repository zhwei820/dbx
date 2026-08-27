import { safeJsonFormat } from "@/lib/common/safeJsonFormat";
import { isInt64ColumnType } from "@/lib/dataGrid/dataGridColumnType";

export type CellDetailTab = "details" | "hexViewer" | "valueEditor";
export type ValueEditorAction = "formatJson" | "compactJson" | "setNull" | "restoreOriginal";

export const CELL_DETAIL_JSON_FORMAT_MAX_LENGTH = 50_000;

export interface CellDetailPresentationOptions {
  isEditable: boolean;
  hasBinaryHexViewer?: boolean;
}

export interface LinkedCellDetailOptions {
  isOpen: boolean;
  isEditing: boolean;
  selectedCell: { rowIndex: number; visibleColIndex: number } | null;
  actualColumnIndex: (visibleColIndex: number) => number;
}

export interface CellDetailTarget {
  rowIndex: number;
  col: number;
}

export interface Int64TimestampPreview {
  utc: string;
  utc8: string;
}

const MIN_TIMESTAMP_VALUE = 1_000_000_000;
const MAX_TIMESTAMP_VALUE = 10_000_000_000_000;
const SECONDS_TIMESTAMP_LIMIT = 10_000_000_000;

/**
 * Presents plausible int64 Unix timestamps without changing the cell value.
 * Ten-digit values are treated as seconds; longer values are milliseconds.
 */
export function int64TimestampPreview(value: unknown, columnType: string | undefined): Int64TimestampPreview | null {
  if (!isInt64ColumnType(columnType)) return null;

  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\+?\d+$/.test(text)) return null;
  const numericValue = Number(text);
  if (!Number.isSafeInteger(numericValue) || numericValue <= MIN_TIMESTAMP_VALUE || numericValue >= MAX_TIMESTAMP_VALUE) return null;

  const milliseconds = numericValue < SECONDS_TIMESTAMP_LIMIT ? numericValue * 1_000 : numericValue;
  return {
    utc: formatTimestampAtOffset(milliseconds, 0),
    utc8: formatTimestampAtOffset(milliseconds, 8),
  };
}

function formatTimestampAtOffset(milliseconds: number, offsetHours: number): string {
  const iso = new Date(milliseconds + offsetHours * 60 * 60 * 1_000).toISOString();
  return iso.slice(0, 23).replace("T", " ");
}

export function defaultCellDetailTab(): CellDetailTab {
  return "details";
}

export function visibleCellDetailTabs(options: CellDetailPresentationOptions): CellDetailTab[] {
  const tabs: CellDetailTab[] = ["details"];
  if (options.hasBinaryHexViewer) {
    tabs.push("hexViewer");
  }
  if (options.isEditable) {
    tabs.push("valueEditor");
  }
  return tabs;
}

export function cellDetailEditorText(value: unknown, _columnType?: string): string {
  if (value === null) return "";
  return cellDetailRawEditorText(value);
}

function cellDetailRawEditorText(value: unknown): string {
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function valueEditorActions(options: { canSetNull: boolean; canFormatJson?: boolean }): ValueEditorAction[] {
  const actions: ValueEditorAction[] = [];
  // JSON 校验通过后同时提供格式化和压缩，避免两个入口的编辑能力不一致。
  if (options.canFormatJson) actions.push("formatJson", "compactJson");
  if (options.canSetNull) actions.push("setNull");
  actions.push("restoreOriginal");
  return actions;
}

export function linkedCellDetailTarget(options: LinkedCellDetailOptions): CellDetailTarget | null {
  if (!options.isOpen || options.isEditing || !options.selectedCell) return null;
  return {
    rowIndex: options.selectedCell.rowIndex,
    col: options.actualColumnIndex(options.selectedCell.visibleColIndex),
  };
}

export function isJsonColumnType(columnType: string | undefined): boolean {
  const base = (columnType ?? "")
    .trim()
    .toLowerCase()
    .split(/[(:\s]/)[0];
  return base === "json" || base === "jsonb";
}

export function isGeometryColumnType(columnType: string | undefined): boolean {
  const base = (columnType ?? "")
    .trim()
    .toLowerCase()
    .split(/[(:\s]/)[0];
  return base === "geometry" || base === "geography";
}

export function canFormatCellDetailJson(value: unknown, columnType?: string): boolean {
  if (value === null || value === undefined) return false;
  const text = cellDetailRawEditorText(value);
  if (text.length > CELL_DETAIL_JSON_FORMAT_MAX_LENGTH) return false;
  if (isJsonColumnType(columnType)) return !!formatJsonText(text);
  return typeof value === "string" && looksLikeJsonContainerText(text) && !!formatJsonText(text);
}

export function formatJsonText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > CELL_DETAIL_JSON_FORMAT_MAX_LENGTH) return undefined;
  try {
    return safeJsonFormat(trimmed, 2);
  } catch {
    return undefined;
  }
}

export function compactJsonText(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > CELL_DETAIL_JSON_FORMAT_MAX_LENGTH) return undefined;
  try {
    return safeJsonFormat(trimmed);
  } catch {
    return undefined;
  }
}

export function looksLikeJsonContainerText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
