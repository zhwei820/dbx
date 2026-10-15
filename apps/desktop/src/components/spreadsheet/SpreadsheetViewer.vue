<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { AlertTriangle, ArrowDownAZ, ArrowDownToLine, ArrowDownZA, ArrowLeftToLine, ArrowRightToLine, ArrowUpDown, ArrowUpToLine, Copy, CopyPlus, Filter, FilterX, ListPlus, Loader2, PencilLine, Redo2, RefreshCw, Save, Search, Trash2, Undo2 } from "@lucide/vue";
import type { BeforeRangeSaveDataDetails, BeforeSaveDataDetails, ColumnRegular, PropertiesFunc } from "@revolist/revogrid";
import { VGrid } from "@revolist/vue3-datagrid";
import { useI18n } from "vue-i18n";
import TextContentSearchBar from "@/components/common/TextContentSearchBar.vue";
import { Button } from "@/components/ui/button";
import CustomContextMenu, { type ContextMenuItem } from "@/components/ui/CustomContextMenu.vue";
import { useTheme } from "@/composables/useTheme";
import { useToast } from "@/composables/useToast";
import { useVerticalOverlayScrollbar } from "@/composables/useVerticalOverlayScrollbar";
import * as api from "@/lib/backend/api";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";
import { copyToClipboard, readTextFromClipboard } from "@/lib/common/clipboard";
import { textContentSearchStatus } from "@/lib/common/textContentSearch";
import { formatShortcutDisplay } from "@/lib/editor/shortcutDisplay";
import {
  buildSpreadsheetGrid,
  captureSpreadsheetColumns,
  columnClipboardText,
  columnLetter,
  defaultCsvSavePath,
  deleteColumnsSplice,
  deleteSpreadsheetRows,
  duplicateColumnsSplice,
  duplicateSpreadsheetRows,
  findSpreadsheetMatches,
  type GridRange,
  insertColumnsSplice,
  insertSpreadsheetRows,
  parseSpreadsheetClipboard,
  rangeClipboardText,
  renameSpreadsheetHeader,
  type SpreadsheetColumnSplice,
  type SpreadsheetRecord,
  spliceSpreadsheetColumnList,
  spliceSpreadsheetColumns,
  type SpreadsheetCell,
  spreadsheetCellMatches,
  spreadsheetColumnName,
  spreadsheetColumns,
  spreadsheetMatchFrom,
  spreadsheetPasteCells,
  SPREADSHEET_SEARCH_MATCH_LIMIT,
  SPREADSHEET_VIEWER_MAX_ROWS,
  spreadsheetSourceToRows,
} from "@/lib/spreadsheet/spreadsheetGrid";
import { applySpreadsheetCellChanges, applySpreadsheetRowPatch, diffSpreadsheetRows, invertColumnSplice, type SpreadsheetCellChange, type SpreadsheetChange, SpreadsheetHistory, type SpreadsheetHistoryDirection } from "@/lib/spreadsheet/spreadsheetHistory";
import SpreadsheetInsertDialog, { type SpreadsheetInsertPosition } from "@/components/spreadsheet/SpreadsheetInsertDialog.vue";
import SpreadsheetRenameColumnDialog from "@/components/spreadsheet/SpreadsheetRenameColumnDialog.vue";
import { useSettingsStore } from "@/stores/settingsStore";

const props = defineProps<{ filePath: string }>();

const { t } = useI18n();
const { isDark } = useTheme();
const { toast } = useToast();

const loading = ref(true);
const error = ref("");
const sheets = ref<string[]>([]);
const activeSheet = ref<string>();
const headers = ref<string[]>([]);
const grid = ref(buildSpreadsheetGrid([], []));
const gridRef = ref<{ $el: HTMLRevoGridElement }>();
const truncated = ref(false);
const history = new SpreadsheetHistory<SpreadsheetChange>();
// The history object is not reactive; this mirrors what the toolbar and unsaved marker need.
const historyState = ref({ canUndo: false, canRedo: false, dirty: false });
const dirty = computed(() => historyState.value.dirty);
const saving = ref(false);
const fileType = ref("");
let loadGeneration = 0;

const theme = computed(() => (isDark.value ? "darkCompact" : "compact"));

async function load(sheetName?: string) {
  const generation = ++loadGeneration;
  loading.value = true;
  error.value = "";
  try {
    const preview = await api.previewTableImportFile(props.filePath, {
      previewLimit: SPREADSHEET_VIEWER_MAX_ROWS,
      parseOptions: { sheetName: sheetName ?? null, emptyStringAsNull: false },
    });
    if (generation !== loadGeneration) return;
    sheets.value = preview.sheets ?? [];
    activeSheet.value = sheetName ?? sheets.value[0];
    fileType.value = preview.fileType;
    headers.value = preview.columns;
    headerSelection = undefined;
    activeSort.value = undefined;
    headerSelectionAnchor = -1;
    rowSelectionAnchor = -1;
    const next = buildSpreadsheetGrid(preview.columns, preview.rows);
    grid.value = { columns: withSearchHighlight(next.columns), source: next.source };
    pendingCells = [];
    history.reset();
    syncHistory();
    truncated.value = preview.rows.length >= SPREADSHEET_VIEWER_MAX_ROWS;
  } catch (e: any) {
    if (generation !== loadGeneration) return;
    error.value = e?.message || String(e);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function confirmDiscardEdits() {
  if (!dirty.value) return true;
  const message = t("spreadsheet.discardEdits");
  if (!isTauriRuntime()) return window.confirm(message);
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, { kind: "warning" });
}

async function refresh() {
  if (await confirmDiscardEdits()) void load(activeSheet.value);
}

async function switchSheet(sheet: string) {
  if (sheet !== activeSheet.value && (await confirmDiscardEdits())) void load(sheet);
}

async function saveAsCsv() {
  // A truncated preview would silently drop every row past the limit.
  if (saving.value || loading.value || truncated.value) return;
  saving.value = true;
  try {
    let outputPath = defaultCsvSavePath(props.filePath);
    if (isTauriRuntime()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: outputPath, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (!path) return;
      outputPath = path;
    }
    // Edits made while the file is being written are not part of it.
    const savedState = history.stateId;
    // getSource is the unsorted, unfiltered backing data, including in-grid edits.
    const source = ((await gridRef.value?.$el.getSource()) ?? grid.value.source) as Record<string, unknown>[];
    const width = grid.value.columns.length;
    await api.exportQueryResultCsv(
      outputPath,
      Array.from({ length: width }, (_, index) => headers.value[index] ?? ""),
      spreadsheetSourceToRows(source, width),
      useSettingsStore().editorSettings.csvQuoteMode,
    );
    history.markSaved(savedState);
    syncHistory();
    toast(t("spreadsheet.saved", { path: outputPath }), 3000);
  } catch (e: any) {
    toast(t("spreadsheet.saveFailed", { message: e?.message || String(e) }), 5000);
  } finally {
    saving.value = false;
  }
}

function syncHistory() {
  historyState.value = { canUndo: history.canUndo, canRedo: history.canRedo, dirty: history.dirty };
}

function recordChange(change: SpreadsheetChange) {
  history.push(change);
  syncHistory();
}

// Edits, their recording and undo/redo all read and then replace the grid source, so they run one at a time.
let editQueue: Promise<void> = Promise.resolve();

function runEdit(task: () => Promise<void>) {
  editQueue = editQueue.then(task).catch((e: any) => toast(t("spreadsheet.editFailed", { message: e?.message || String(e) }), 5000));
}

// RevoGrid writes edits straight into the records, so old values are captured before it does and recorded after.
let pendingCells: { model: SpreadsheetRecord; prop: string; before: unknown }[] = [];

function onBeforeEdit(event: CustomEvent<BeforeSaveDataDetails>) {
  const { model, prop } = event.detail;
  pendingCells = [{ model, prop: String(prop), before: model[prop] }];
}

// Paste, autofill and clearing a range all arrive here, keyed by viewport row with the matching records.
function onBeforeRangeEdit(event: CustomEvent<BeforeRangeSaveDataDetails>) {
  const { data, models } = event.detail;
  pendingCells = [];
  for (const [rowIndex, values] of Object.entries(data)) {
    const model = models[Number(rowIndex)];
    if (!model) continue;
    for (const prop of Object.keys(values)) pendingCells.push({ model, prop, before: model[prop] });
  }
}

function onAfterEdit() {
  onGridDataChanged();
  const captured = pendingCells;
  pendingCells = [];
  if (captured.length === 0) return;
  runEdit(async () => {
    const source = await currentSource();
    const positions = captured.length > 1 ? new Map(source.map((record, index) => [record, index])) : undefined;
    const cells = captured.flatMap(({ model, prop, before }): SpreadsheetCellChange[] => {
      const row = positions ? positions.get(model) : source.indexOf(model);
      const after = model[prop];
      return row === undefined || row < 0 || Object.is(before, after) ? [] : [{ row, prop, before, after }];
    });
    if (cells.length > 0) recordChange({ kind: "cells", cells });
  });
}

function stepHistory(direction: SpreadsheetHistoryDirection) {
  runEdit(async () => {
    if (loading.value) return;
    const change = direction === "undo" ? history.undo() : history.redo();
    syncHistory();
    if (!change) return;
    if (change.kind === "cells") {
      await replayCells(change.cells, direction);
    } else if (change.kind === "rows") {
      const next = applySpreadsheetRowPatch(await currentSource(), change.patch, direction);
      await replaceRows(next.source, next.restored);
    } else if (change.kind === "header") {
      await applyHeaderName(change.index, direction === "undo" ? change.before : change.after);
      await selectColumns(change.index, change.index);
    } else {
      await applyColumnSplice(direction === "undo" ? invertColumnSplice(change.splice, change.removed) : change.splice, false);
    }
  });
}

async function replayCells(cells: readonly SpreadsheetCellChange[], direction: SpreadsheetHistoryDirection) {
  const source = await currentSource();
  applySpreadsheetCellChanges(source, cells, direction);
  const element = gridElement();
  if (!element) return;
  await element.refresh("rgRow");
  // Select the restored cells so the change is visible, as long as the filter still shows them.
  const visible = new Map((await element.getVisibleSource()).map((record, index) => [record, index]));
  const rows = cells.map((cell) => visible.get(source[cell.row])).filter((row): row is number => row !== undefined);
  const columns = cells.map((cell) => grid.value.columns.findIndex((column) => column.prop === cell.prop)).filter((column) => column >= 0);
  if (rows.length === 0 || columns.length === 0) return;
  const start = { x: Math.min(...columns), y: Math.min(...rows) };
  await element.setCellsFocus(start, { x: Math.max(...columns), y: Math.max(...rows) }, "rgCol", "rgRow");
  await element.scrollToCoordinate(start);
}

// Columns are never reordered or pinned, so a header's viewport index is also its physical index.
// Rows carry both: the viewport range for selection and the physical source indices for editing.
type MenuTarget = { kind: "column"; index: number; start: number; end: number } | { kind: "row"; start: number; end: number; physical: number[] };

const menuTarget = ref<MenuTarget>();

async function onGridContextMenu(event: MouseEvent, openMenu: (event: MouseEvent) => void) {
  const target = event.target instanceof Element ? event.target : null;
  const headerCell = target?.closest(".rgHeaderCell");
  const rowCell = target?.closest(".rowHeaders .rgCell");
  // The row-number column's header carries data-rgcol too, so exclude it explicitly.
  const column = headerCell && !headerCell.closest(".rowHeaders") ? Number(headerCell.getAttribute("data-rgcol")) : NaN;
  const row = rowCell ? Number(rowCell.getAttribute("data-rgrow")) : NaN;
  const isColumn = Number.isInteger(column) && !!grid.value.columns[column];
  if (!isColumn && !Number.isInteger(row)) return;
  // The selection lookups are async, so keep the native menu away before awaiting them.
  event.preventDefault();
  event.stopPropagation();
  const element = gridElement();
  if (!element) return;
  const range = await element.getSelectedRange();
  if (isColumn) {
    const inRange = !!range && range.x <= column && column <= range.x1;
    const start = inRange ? range.x : column;
    const end = inRange ? range.x1 : column;
    if (!inRange) await selectColumns(column, column);
    menuTarget.value = { kind: "column", index: column, start, end };
  } else {
    const inRange = !!range && range.y <= row && row <= range.y1;
    const start = inRange ? range.y : row;
    const end = inRange ? range.y1 : row;
    if (!inRange) await selectRows(row, row);
    menuTarget.value = { kind: "row", start, end, physical: await physicalRowIndexes(start, end) };
  }
  openMenu(event);
}

function gridElement() {
  return gridRef.value?.$el;
}

async function physicalRowIndexes(start: number, end: number): Promise<number[]> {
  const element = gridElement();
  if (!element) return [];
  // Visible rows are the same objects as the backing source, just sorted and filtered.
  const source = await element.getSource();
  const positions = new Map(source.map((record, index) => [record, index]));
  const visible = await element.getVisibleSource();
  return visible
    .slice(start, end + 1)
    .map((record) => positions.get(record))
    .filter((index): index is number => index !== undefined);
}

async function currentSource(): Promise<SpreadsheetRecord[]> {
  // getSource includes in-grid edits that grid.source does not.
  return ((await gridElement()?.getSource()) ?? grid.value.source) as SpreadsheetRecord[];
}

function resetSelectionAnchors() {
  headerSelection = undefined;
  headerSelectionAnchor = -1;
  rowSelectionAnchor = -1;
}

async function replaceRows(source: SpreadsheetRecord[], focus: SpreadsheetRecord[] = []) {
  grid.value = { columns: grid.value.columns, source };
  resetSelectionAnchors();
  await nextTick();
  const element = gridElement();
  if (!element) return;
  if (focus.length === 0) {
    await element.clearFocus();
    return;
  }
  const visible = await element.getVisibleSource();
  const rows = focus.map((record) => visible.indexOf(record)).filter((index) => index >= 0);
  if (rows.length > 0) await selectRows(Math.min(...rows), Math.max(...rows));
}

async function commitRows(before: SpreadsheetRecord[], after: SpreadsheetRecord[], focus: SpreadsheetRecord[] = []) {
  const patch = diffSpreadsheetRows(before, after);
  if (patch.removed.length === 0 && patch.inserted.length === 0) return;
  recordChange({ kind: "rows", patch });
  await replaceRows(after, focus);
}

async function insertRows(target: Extract<MenuTarget, { kind: "row" }> | undefined, count: number, position: SpreadsheetInsertPosition) {
  const source = await currentSource();
  const width = grid.value.columns.length;
  // Without a row target (empty sheet) rows are appended.
  const at = !target || target.physical.length === 0 ? source.length : position === "before" ? Math.min(...target.physical) : Math.max(...target.physical) + 1;
  const next = insertSpreadsheetRows(source, at, count, width);
  await commitRows(source, next, next.slice(at, at + count));
}

async function duplicateRows(target: Extract<MenuTarget, { kind: "row" }>) {
  const source = await currentSource();
  const result = duplicateSpreadsheetRows(source, target.physical);
  await commitRows(source, result.source, result.source.slice(result.at, result.at + result.count));
}

async function deleteRows(target: Extract<MenuTarget, { kind: "row" }>) {
  const source = await currentSource();
  await commitRows(source, deleteSpreadsheetRows(source, target.physical));
}

// Undo and redo replay splices without recording them again.
async function applyColumnSplice(splice: SpreadsheetColumnSplice, record = true) {
  const element = gridElement();
  const width = grid.value.columns.length;
  const table = { headers: headers.value, source: await currentSource(), width };
  const currentSizes = grid.value.columns.map((column) => column.size);
  if (record) recordChange({ kind: "columns", splice, removed: captureSpreadsheetColumns(table, currentSizes, splice.at, splice.remove) });
  const next = spliceSpreadsheetColumns(table, splice);
  const sizes = spliceSpreadsheetColumnList(currentSizes, splice, undefined, (column) => column.size);
  // Sort and filter state is keyed by the positional prop, so it would jump to whichever column now owns it.
  if (activeSort.value) {
    activeSort.value = undefined;
    await element?.clearSorting();
  }
  await clearAllFilters();
  headers.value = next.headers;
  grid.value = { columns: withSearchHighlight(spreadsheetColumns(next.headers, next.width, sizes)), source: next.source };
  resetSelectionAnchors();
  await nextTick();
  // Whatever the splice inserted (new, duplicated or restored columns) ends up selected.
  if (splice.insert.length > 0 && next.width > 0) await selectColumns(splice.at, Math.min(splice.at + splice.insert.length - 1, next.width - 1));
  else await element?.clearFocus();
}

function insertColumns(target: Extract<MenuTarget, { kind: "column" }>, count: number, position: SpreadsheetInsertPosition) {
  const at = position === "before" ? target.start : target.end + 1;
  runEdit(() => applyColumnSplice(insertColumnsSplice(at, count)));
}

function duplicateColumns(target: Extract<MenuTarget, { kind: "column" }>) {
  runEdit(() => applyColumnSplice(duplicateColumnsSplice(target.start, target.end)));
}

function deleteColumns(target: Extract<MenuTarget, { kind: "column" }>) {
  runEdit(() => applyColumnSplice(deleteColumnsSplice(target.start, target.end)));
}

// Renaming only touches the header, so the grid's column is patched in place: handing VGrid a new column list
// would clear the active sort, and the filter icon lives on the grid's own copy of the column.
async function applyHeaderName(index: number, name: string) {
  const column = grid.value.columns[index];
  if (!column) return;
  headers.value = renameSpreadsheetHeader(headers.value, grid.value.columns.length, index, name);
  column.name = spreadsheetColumnName(headers.value, index);
  const element = gridElement();
  const live = (await element?.getColumns())?.find((candidate) => candidate.prop === column.prop);
  if (live) await element?.updateColumns([{ ...live, name: column.name }]);
}

function renameColumn(index: number, name: string) {
  runEdit(async () => {
    const before = headers.value[index] ?? "";
    if (before === name || !grid.value.columns[index]) return;
    recordChange({ kind: "header", index, before, after: name });
    await applyHeaderName(index, name);
  });
}

const renameDialog = ref<{ open: boolean; index: number }>({ open: false, index: -1 });

function openRenameDialog(index: number) {
  if (grid.value.columns[index]) renameDialog.value = { open: true, index };
}

function onHeaderDblClick(event: CustomEvent<{ index: number; originalEvent?: MouseEvent }>) {
  const target = event.detail.originalEvent?.target;
  // Double-clicking the resize handle or filter button keeps its own meaning.
  if (target instanceof Element && target.closest(".rv-filter, .resizable")) return;
  openRenameDialog(event.detail.index);
}

const insertDialog = ref<{ open: boolean; kind: "rows" | "columns"; count: number; target?: MenuTarget }>({ open: false, kind: "rows", count: 1 });

function openInsertDialog(target: MenuTarget) {
  const count = target.end - target.start + 1;
  insertDialog.value = { open: true, kind: target.kind === "row" ? "rows" : "columns", count, target };
}

function onInsertDialogConfirm(count: number, position: SpreadsheetInsertPosition) {
  const target = insertDialog.value.target;
  if (target?.kind === "column") insertColumns(target, count, position);
  else runEdit(() => insertRows(target, count, position));
}

async function copyColumn(index: number, withHeader: boolean) {
  const element = gridElement();
  const column = grid.value.columns[index];
  if (!element || !column) return;
  try {
    // Visible source follows the current sort and filter, matching what the user sees.
    const rows = (await element.getVisibleSource()) as Record<string, unknown>[];
    await copyToClipboard(
      columnClipboardText(
        rows.map((row) => row[column.prop as string]),
        withHeader ? String(column.name ?? "") : undefined,
      ),
    );
    toast(t("spreadsheet.columnCopied", { count: rows.length }));
  } catch (e: any) {
    toast(t("spreadsheet.copyFailed", { message: e?.message || String(e) }), 5000);
  }
}

// Sorting through the API leaves the header without an arrow, so the menu shows the active order instead.
const activeSort = ref<{ index: number; order: "asc" | "desc" }>();

function sortColumn(index: number, order: "asc" | "desc" | undefined) {
  const column = grid.value.columns[index];
  if (!column) return;
  void gridElement()?.updateColumnSorting({ prop: column.prop }, order, false);
  activeSort.value = order ? { index, order } : undefined;
}

function openColumnFilter(index: number) {
  // Reuse the built-in filter popup by pressing the header's own filter button.
  const button = gridElement()?.querySelector<HTMLElement>(`revogr-viewport-scroll.rgCol .rgHeaderCell[data-rgcol="${index}"] .rv-filter`);
  button?.click();
}

type FilterPluginApi = { onFilterReset(prop?: string | number): void; clearFiltering(): Promise<void> };

async function filterPlugin() {
  const plugins = (await gridElement()?.getPlugins()) ?? [];
  // Matched by shape: class names do not survive minification.
  return plugins.find((plugin): plugin is typeof plugin & FilterPluginApi => {
    const candidate = plugin as Partial<FilterPluginApi>;
    return typeof candidate.onFilterReset === "function" && typeof candidate.clearFiltering === "function";
  });
}

async function clearColumnFilter(index: number) {
  const column = grid.value.columns[index];
  if (column) (await filterPlugin())?.onFilterReset(column.prop);
}

async function clearAllFilters() {
  await (await filterPlugin())?.clearFiltering();
}

// Column range most recently selected through the header; a copy of exactly that range gets a header row.
let headerSelection: { x: number; x1: number; y1: number } | undefined;
let headerSelectionAnchor = -1;

async function onHeaderClick(event: CustomEvent<ColumnRegular>) {
  // The emitted column also carries its viewport index and the triggering mouse event.
  const detail = event.detail as ColumnRegular & { index?: number; originalEvent?: MouseEvent };
  const target = detail.originalEvent?.target;
  if (target instanceof Element && target.closest(".rv-filter, .resizable")) return;
  const index = detail.index;
  if (typeof index !== "number") return;
  const anchor = detail.originalEvent?.shiftKey && headerSelectionAnchor >= 0 ? headerSelectionAnchor : index;
  await selectColumns(anchor, index);
}

async function selectColumns(anchor: number, index: number) {
  const element = gridElement();
  if (!element) return;
  const rowCount = (await element.getVisibleSource()).length;
  if (rowCount === 0) return;
  headerSelectionAnchor = anchor;
  headerSelection = { x: Math.min(anchor, index), x1: Math.max(anchor, index), y1: rowCount - 1 };
  await element.setCellsFocus({ x: headerSelection.x, y: 0 }, { x: headerSelection.x1, y: headerSelection.y1 }, "rgCol", "rgRow");
}

function onClipboardRangeCopy(event: CustomEvent<{ range: { x: number; y: number; x1: number; y1: number }; data: unknown[][] }>) {
  const { range } = event.detail;
  const selected = headerSelection;
  if (!selected || range.y !== 0 || range.x !== selected.x || range.x1 !== selected.x1 || range.y1 !== selected.y1) return;
  const names = grid.value.columns.slice(range.x, range.x1 + 1).map((column) => String(column.name ?? ""));
  event.detail.data = [names, ...event.detail.data];
}

function sortedBy(index: number, order: "asc" | "desc") {
  return activeSort.value?.index === index && activeSort.value.order === order;
}

let rowSelectionAnchor = -1;

async function onGridClick(event: MouseEvent) {
  const cell = event.target instanceof Element ? event.target.closest(".rowHeaders .rgCell") : null;
  if (!cell) return;
  const row = Number(cell.getAttribute("data-rgrow"));
  if (!Number.isInteger(row)) return;
  await selectRows(event.shiftKey && rowSelectionAnchor >= 0 ? rowSelectionAnchor : row, row);
}

async function selectRows(anchor: number, row: number) {
  const element = gridElement();
  const lastColumn = grid.value.columns.length - 1;
  if (!element || lastColumn < 0) return;
  rowSelectionAnchor = anchor;
  await element.setCellsFocus({ x: 0, y: Math.min(anchor, row) }, { x: lastColumn, y: Math.max(anchor, row) }, "rgCol", "rgRow");
}

async function copySelection(withHeaders: boolean) {
  const element = gridElement();
  if (!element) return;
  try {
    const focused = await element.getFocused();
    const range: GridRange | null = (await element.getSelectedRange()) ?? (focused ? { x: focused.cell.x, y: focused.cell.y, x1: focused.cell.x, y1: focused.cell.y } : null);
    if (!range) return;
    // Columns picked from their headers copy with the column names, as onClipboardRangeCopy does.
    const selected = headerSelection;
    const headerRange = !!selected && range.y === 0 && range.x === selected.x && range.x1 === selected.x1 && range.y1 === selected.y1;
    const rows = (await element.getVisibleSource()) as Record<string, unknown>[];
    await copyToClipboard(rangeClipboardText(rows, grid.value.columns, range, withHeaders || headerRange));
    if (withHeaders) toast(t("spreadsheet.copiedWithHeaders"));
  } catch (e: any) {
    toast(t("spreadsheet.copyFailed", { message: e?.message || String(e) }), 5000);
  }
}

async function selectAllCells() {
  const element = gridElement();
  const lastColumn = grid.value.columns.length - 1;
  if (!element || lastColumn < 0) return;
  const rowCount = (await element.getVisibleSource()).length;
  if (rowCount > 0) await element.setCellsFocus({ x: 0, y: 0 }, { x: lastColumn, y: rowCount - 1 }, "rgCol", "rgRow");
}

// Mod+A is handled here because RevoGrid only selects all when a multi-cell range already exists.
// Mod+Z / Mod+Shift+Z / Ctrl+Y step the sheet history; inside an open cell editor they stay native text undo.
function onGridKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
  const key = event.key.toLowerCase();
  if (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey)) {
    event.preventDefault();
    event.stopPropagation();
    stepHistory(key === "z" && !event.shiftKey ? "undo" : "redo");
  } else if (event.code === "KeyA" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    void selectAllCells();
  }
}

const viewerRef = ref<HTMLElement>();

// RevoGrid copies and pastes through the native clipboard events, which WebKit (the macOS and Linux webviews) only
// fires for a text selection or an editable field, so Mod+C and Mod+V on selected cells did nothing there. Both are
// handled here instead; Mod+Shift+C adds the column names. Listening on the document also covers focus left on the
// body or the find field.
function onDocumentKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.defaultPrevented) return;
  const isCopy = event.code === "KeyC";
  const isPaste = event.code === "KeyV" && !event.shiftKey;
  if (!isCopy && !isPaste) return;
  const target = event.target instanceof Element ? event.target : null;
  const onPage = !target || target === document.body || target === document.documentElement;
  if (!onPage && !viewerRef.value?.contains(target)) return;
  // An open cell editor keeps the native clipboard, as does pasting into the find field or copying selected text.
  if (target?.closest("input, textarea, [contenteditable='true']") && (isPaste || gridElement()?.contains(target))) return;
  if (isCopy && hasTextSelection(target)) return;
  event.preventDefault();
  event.stopPropagation();
  if (isCopy) void copySelection(event.shiftKey);
  else runEdit(pasteIntoSelection);
}

async function pasteIntoSelection() {
  const element = gridElement();
  if (!element || loading.value) return;
  const clip = parseSpreadsheetClipboard(await readTextFromClipboard());
  const focused = await element.getFocused();
  const range: GridRange | null = (await element.getSelectedRange()) ?? (focused ? { x: focused.cell.x, y: focused.cell.y, x1: focused.cell.x, y1: focused.cell.y } : null);
  if (!range) return;
  // Selection rows are viewport rows; the change is recorded against the records' physical positions.
  const visible = await element.getVisibleSource();
  const source = await currentSource();
  const positions = new Map(source.map((record, index) => [record, index]));
  const columns = grid.value.columns;
  const cells = spreadsheetPasteCells(clip, range, visible.length, columns.length).flatMap(({ x, y, value }): SpreadsheetCellChange[] => {
    const row = positions.get(visible[y]);
    const prop = String(columns[x].prop);
    if (row === undefined) return [];
    const before = source[row][prop];
    return Object.is(before, value) ? [] : [{ row, prop, before, after: value }];
  });
  if (cells.length === 0) return;
  recordChange({ kind: "cells", cells });
  await replayCells(cells, "redo");
  onGridDataChanged();
}

function hasTextSelection(target: Element | null) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.selectionStart !== target.selectionEnd;
  return !(window.getSelection()?.isCollapsed ?? true);
}

function menuItems(): ContextMenuItem[] {
  const target = menuTarget.value;
  if (!target) return [];
  return target.kind === "row" ? rowMenuItems(target) : columnMenuItems(target);
}

function rowMenuItems(target: Extract<MenuTarget, { kind: "row" }>): ContextMenuItem[] {
  const count = target.physical.length;
  if (count === 0) return [];
  return [
    { label: t("spreadsheet.menu.insertRowsAbove", { count }, count), icon: ArrowUpToLine, action: () => runEdit(() => insertRows(target, count, "before")) },
    { label: t("spreadsheet.menu.insertRowsBelow", { count }, count), icon: ArrowDownToLine, action: () => runEdit(() => insertRows(target, count, "after")) },
    { label: t("spreadsheet.menu.insertRowsMultiple"), icon: ListPlus, action: () => openInsertDialog(target) },
    { label: t("spreadsheet.menu.duplicateRows", { count }, count), icon: CopyPlus, action: () => runEdit(() => duplicateRows(target)) },
    { label: "", separator: true },
    { label: t("spreadsheet.menu.deleteRows", { count }, count), icon: Trash2, variant: "destructive", action: () => runEdit(() => deleteRows(target)) },
  ];
}

function columnMenuItems(target: Extract<MenuTarget, { kind: "column" }>): ContextMenuItem[] {
  const index = target.index;
  if (!grid.value.columns[index]) return [];
  const count = target.end - target.start + 1;
  const structure: ContextMenuItem[] = [
    { label: "", separator: true },
    { label: t("spreadsheet.menu.renameColumn"), icon: PencilLine, action: () => openRenameDialog(index) },
    { label: t("spreadsheet.menu.insertColumnsLeft", { count }, count), icon: ArrowLeftToLine, action: () => insertColumns(target, count, "before") },
    { label: t("spreadsheet.menu.insertColumnsRight", { count }, count), icon: ArrowRightToLine, action: () => insertColumns(target, count, "after") },
    { label: t("spreadsheet.menu.insertColumnsMultiple"), icon: ListPlus, action: () => openInsertDialog(target) },
    { label: t("spreadsheet.menu.duplicateColumns", { count }, count), icon: CopyPlus, action: () => duplicateColumns(target) },
    // Removing every column leaves no header to right-click, so at least one has to stay.
    { label: t("spreadsheet.menu.deleteColumns", { count }, count), icon: Trash2, variant: "destructive", disabled: count >= grid.value.columns.length, action: () => deleteColumns(target) },
  ];
  // An empty sheet has no row numbers to right-click, so offer the first row here.
  if (grid.value.source.length === 0) structure.push({ label: t("spreadsheet.menu.appendRow"), icon: ListPlus, action: () => runEdit(() => insertRows(undefined, 1, "after")) });
  return [...headerColumnItems(index), ...structure];
}

function headerColumnItems(index: number): ContextMenuItem[] {
  return [
    {
      label: t("spreadsheet.menu.copy"),
      icon: Copy,
      children: [
        { label: t("spreadsheet.menu.copyColumn"), action: () => void copyColumn(index, false) },
        { label: t("spreadsheet.menu.copyColumnWithHeader"), action: () => void copyColumn(index, true) },
      ],
    },
    {
      label: t("spreadsheet.menu.sort"),
      icon: ArrowUpDown,
      children: [
        { label: t("spreadsheet.menu.sortAsc"), icon: ArrowDownAZ, checked: sortedBy(index, "asc"), action: () => sortColumn(index, "asc") },
        { label: t("spreadsheet.menu.sortDesc"), icon: ArrowDownZA, checked: sortedBy(index, "desc"), action: () => sortColumn(index, "desc") },
        { label: t("spreadsheet.menu.clearSort"), disabled: activeSort.value?.index !== index, action: () => sortColumn(index, undefined) },
      ],
    },
    {
      label: t("spreadsheet.menu.filter"),
      icon: Filter,
      children: [
        { label: t("spreadsheet.menu.filterColumn"), icon: Filter, action: () => openColumnFilter(index) },
        { label: t("spreadsheet.menu.clearColumnFilter"), icon: FilterX, action: () => void clearColumnFilter(index) },
        { label: t("spreadsheet.menu.clearAllFilters"), action: () => void clearAllFilters() },
      ],
    },
  ];
}

// Find runs over the visible (sorted and filtered) rows, so match coordinates are viewport cells.
const searchBarRef = ref<InstanceType<typeof TextContentSearchBar>>();
const searchOpen = ref(false);
const searchQuery = ref("");
const searchMatches = shallowRef<SpreadsheetCell[]>([]);
const searchIndex = ref(-1);
// The lower-cased query the cell highlighter reads; the grid only redraws when it changes.
let searchNeedle = "";
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;
// The match last stepped to, for when the grid has no focused cell to step from.
let lastSearchCell: SpreadsheetCell | undefined;

const searchStatus = computed(() => textContentSearchStatus(Math.max(searchIndex.value, 0), searchMatches.value.length, searchMatches.value.length >= SPREADSHEET_SEARCH_MATCH_LIMIT));

const highlightSearchMatch: PropertiesFunc = ({ model, prop }) => (spreadsheetCellMatches(model[prop], searchNeedle) ? { class: { "spreadsheet-search-match": true } } : undefined);

function withSearchHighlight(columns: ColumnRegular[]) {
  for (const column of columns) column.cellProperties = highlightSearchMatch;
  return columns;
}

function focusSearch() {
  if (error.value) return false;
  searchOpen.value = true;
  void nextTick(() => searchBarRef.value?.focusInput(true));
  return true;
}

function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = "";
}

function scheduleSearch(jump = false) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = undefined;
    void runSearch(jump);
  }, 150);
}

// Edits, sorting and filtering move or change the matches, so they are counted again.
function onGridDataChanged() {
  if (searchQuery.value) scheduleSearch();
}

async function runSearch(jump: boolean) {
  const generation = ++searchGeneration;
  const element = gridElement();
  const query = searchQuery.value;
  const rows = query && element ? ((await element.getVisibleSource()) as SpreadsheetRecord[]) : [];
  if (generation !== searchGeneration) return;
  searchMatches.value = findSpreadsheetMatches(
    rows,
    grid.value.columns.map((column) => String(column.prop)),
    query,
  );
  searchIndex.value = -1;
  const needle = query.toLowerCase();
  if (needle !== searchNeedle) {
    searchNeedle = needle;
    await element?.refresh("rgRow");
  }
  if (jump) await stepSearch(1, true);
}

// Steps from the focused cell, like Excel, so clicking elsewhere and pressing Enter continues from there.
async function stepSearch(delta: 1 | -1, inclusive = false) {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = undefined;
    await runSearch(false);
  }
  const element = gridElement();
  const matches = searchMatches.value;
  if (!element || matches.length === 0) return;
  const focused = await element.getFocused();
  const index = spreadsheetMatchFrom(matches, focused ? { x: focused.cell.x, y: focused.cell.y } : lastSearchCell, delta, inclusive);
  const cell = matches[index];
  searchIndex.value = index;
  lastSearchCell = cell;
  await element.setCellsFocus(cell, cell, "rgCol", "rgRow");
  await element.scrollToCoordinate(cell);
  // Focusing the cell must not take Enter away from the find field, or the next Enter would edit it.
  searchBarRef.value?.focusInput(false);
}

watch(searchQuery, () => scheduleSearch(true));

// RevoGrid clears its focused cell on any mouseup outside the grid that is not prevented, which would drop
// the current match whenever the find panel's buttons or the scrollbar are clicked.
function keepGridFocus(event: MouseEvent) {
  event.preventDefault();
}

// RevoGrid reads keys from the whole document, so typing in a field outside the grid (such as the find field)
// would otherwise start editing, or with Backspace clear, the focused cell.
function onGridBeforeKeydown(event: CustomEvent<{ original: KeyboardEvent }>) {
  const target = event.detail.original.target;
  if (!(target instanceof Element) || gridElement()?.contains(target)) return;
  if (target.closest("input, textarea, select, [contenteditable='true']")) event.preventDefault();
}

// RevoGrid's vertical scrollbar is native, which macOS hides until the grid scrolls and which is easy to miss.
// An always-visible overlay thumb drives that same scroll element, so dragging it jumps through the sheet.
const gridContainerRef = ref<HTMLElement>();
const rowScroller = ref<HTMLElement | null>(null);
const rowScrollerContent = ref<HTMLElement | null>(null);
const scrollbarTrackRef = ref<HTMLElement | null>(null);
const scrollbarBounds = ref({ top: 0, height: 0 });
const {
  hasOverflow: hasRowOverflow,
  isDragging: isScrollbarDragging,
  thumbStyle: scrollbarThumbStyle,
  onScroll: onRowScroll,
  onTrackPointerDown: onScrollbarTrackPointerDown,
  onThumbPointerDown: onScrollbarThumbPointerDown,
} = useVerticalOverlayScrollbar(rowScroller, rowScrollerContent, scrollbarTrackRef);
let scrollerResizeObserver: ResizeObserver | undefined;

function attachRowScroller() {
  const scroller = gridElement()?.querySelector<HTMLElement>("revogr-scroll-virtual.vertical") ?? null;
  if (scroller === rowScroller.value) return;
  rowScroller.value?.removeEventListener("scroll", onRowScroll);
  scrollerResizeObserver?.disconnect();
  scroller?.addEventListener("scroll", onRowScroll, { passive: true });
  rowScroller.value = scroller;
  rowScrollerContent.value = scroller?.firstElementChild instanceof HTMLElement ? scroller.firstElementChild : null;
  if (scroller && typeof ResizeObserver !== "undefined") {
    scrollerResizeObserver = new ResizeObserver(updateScrollbarBounds);
    scrollerResizeObserver.observe(scroller);
  }
  updateScrollbarBounds();
}

// The track lines up with RevoGrid's scroll element, which leaves room for the horizontal scrollbar.
function updateScrollbarBounds() {
  const scroller = rowScroller.value;
  const container = gridContainerRef.value;
  if (!scroller || !container) return;
  const inner = scroller.getBoundingClientRect();
  scrollbarBounds.value = { top: inner.top - container.getBoundingClientRect().top, height: inner.height };
}

function onScrollbarWheel(event: WheelEvent) {
  if (rowScroller.value) rowScroller.value.scrollTop += event.deltaY;
}

onMounted(() => {
  document.addEventListener("keydown", onDocumentKeydown);
  void load();
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDocumentKeydown);
  clearTimeout(searchTimer);
  rowScroller.value?.removeEventListener("scroll", onRowScroll);
  scrollerResizeObserver?.disconnect();
});

defineExpose({ refresh, focusSearch });
</script>

<template>
  <div ref="viewerRef" class="flex h-full min-h-0 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
      <span class="truncate" :title="filePath">{{ filePath }}</span>
      <span class="shrink-0">· {{ t("spreadsheet.rowCount", { count: grid.source.length }) }}</span>
      <span v-if="truncated" class="shrink-0 text-amber-600 dark:text-amber-400">{{ t("spreadsheet.truncated", { max: SPREADSHEET_VIEWER_MAX_ROWS }) }}</span>
      <span v-if="dirty" class="shrink-0 text-amber-600 dark:text-amber-400">· {{ t("spreadsheet.unsaved") }}</span>
      <Button variant="ghost" size="icon" class="ml-auto h-7 w-7" :title="`${t('editor.search.find')} (${formatShortcutDisplay('Mod+F')})`" :aria-label="t('editor.search.find')" :disabled="loading || !!error" @click="focusSearch">
        <Search class="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7" :title="`${t('spreadsheet.undo')} (${formatShortcutDisplay('Mod+Z')})`" :aria-label="t('spreadsheet.undo')" :disabled="loading || !historyState.canUndo" @click="stepHistory('undo')">
        <Undo2 class="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7" :title="`${t('spreadsheet.redo')} (${formatShortcutDisplay('Mod+Shift+Z')})`" :aria-label="t('spreadsheet.redo')" :disabled="loading || !historyState.canRedo" @click="stepHistory('redo')">
        <Redo2 class="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-xs" :title="truncated ? t('spreadsheet.saveDisabledTruncated') : t('spreadsheet.saveAsCsv')" :disabled="loading || saving || truncated || !!error" @click="saveAsCsv">
        <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" />
        <Save v-else class="h-3.5 w-3.5" />
        {{ t("spreadsheet.saveAsCsv") }}
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7" :title="t('spreadsheet.reload')" :disabled="loading" @click="refresh">
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
    <div ref="gridContainerRef" class="relative min-h-0 flex-1">
      <div v-if="error" class="flex h-full items-center justify-center gap-2 p-6 text-sm text-destructive">
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span class="break-all">{{ t("spreadsheet.loadFailed", { message: error }) }}</span>
      </div>
      <CustomContextMenu v-else :items="menuItems" v-slot="{ onContextMenu }">
        <!-- isolate keeps RevoGrid's internal z-indexes under the find panel and scrollbar. -->
        <div class="spreadsheet-grid isolate h-full w-full" @contextmenu="onGridContextMenu($event, onContextMenu)" @click="onGridClick" @keydown.capture="onGridKeydown" @beforekeydown="onGridBeforeKeydown">
          <VGrid
            ref="gridRef"
            class="h-full w-full"
            :theme="theme"
            :columns="grid.columns"
            :source="grid.source"
            :readonly="false"
            :apply-on-close="true"
            :resize="true"
            :range="true"
            :filter="true"
            :row-headers="true"
            :can-focus="true"
            @beforeedit="onBeforeEdit"
            @beforerangeedit="onBeforeRangeEdit"
            @afteredit="onAfterEdit"
            @aftersourceset="onGridDataChanged"
            @aftertrimmed="onGridDataChanged"
            @aftersortingapply="onGridDataChanged"
            @aftergridrender="attachRowScroller"
            @headerclick="onHeaderClick"
            @headerdblclick="onHeaderDblClick"
            @clipboardrangecopy="onClipboardRangeCopy"
          />
        </div>
      </CustomContextMenu>
      <div
        v-if="hasRowOverflow && !error"
        ref="scrollbarTrackRef"
        class="spreadsheet-scrollbar"
        :class="{ 'spreadsheet-scrollbar--dragging': isScrollbarDragging }"
        :style="{ top: `${scrollbarBounds.top}px`, height: `${scrollbarBounds.height}px` }"
        @pointerdown="onScrollbarTrackPointerDown"
        @mouseup="keepGridFocus"
        @wheel.prevent="onScrollbarWheel"
      >
        <div class="spreadsheet-scrollbar__thumb" :style="scrollbarThumbStyle" @pointerdown.stop="onScrollbarThumbPointerDown" />
      </div>
      <TextContentSearchBar v-if="searchOpen" ref="searchBarRef" v-model="searchQuery" :status="searchStatus" :match-count="searchMatches.length" @activate="stepSearch" @prev="stepSearch(-1)" @next="stepSearch(1)" @close="closeSearch" @mouseup="keepGridFocus" />
      <div v-if="loading && !error" class="absolute inset-0 flex items-center justify-center bg-background/60">
        <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
    <SpreadsheetInsertDialog v-model:open="insertDialog.open" :kind="insertDialog.kind" :initial-count="insertDialog.count" @insert="onInsertDialogConfirm" />
    <SpreadsheetRenameColumnDialog v-model:open="renameDialog.open" :initial-name="headers[renameDialog.index] ?? ''" :placeholder="columnLetter(Math.max(renameDialog.index, 0))" @rename="renameColumn(renameDialog.index, $event)" />
    <div v-if="sheets.length > 1" class="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t px-2">
      <button v-for="sheet in sheets" :key="sheet" type="button" class="shrink-0 rounded px-2 py-0.5 text-xs" :class="sheet === activeSheet ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'" :disabled="loading" @click="switchSheet(sheet)">
        {{ sheet }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.spreadsheet-grid :deep(.rgCell.spreadsheet-search-match) {
  background-color: rgb(250 204 21 / 0.35);
}

.spreadsheet-grid :deep(revogr-scroll-virtual.vertical) {
  scrollbar-width: none;
}

.spreadsheet-grid :deep(revogr-scroll-virtual.vertical::-webkit-scrollbar) {
  width: 0;
}

.spreadsheet-scrollbar {
  position: absolute;
  right: 0;
  z-index: 10;
  width: 12px;
}

.spreadsheet-scrollbar__thumb {
  position: absolute;
  right: 2px;
  width: 6px;
  min-height: 24px;
  border-radius: 999px;
  background: rgb(128 128 128 / 0.45);
  background: color-mix(in oklch, var(--foreground) 30%, transparent);
  transition:
    background-color 120ms ease,
    width 120ms ease,
    right 120ms ease;
}

.spreadsheet-scrollbar:hover .spreadsheet-scrollbar__thumb,
.spreadsheet-scrollbar--dragging .spreadsheet-scrollbar__thumb {
  right: 1px;
  width: 10px;
  background: rgb(128 128 128 / 0.7);
  background: color-mix(in oklch, var(--foreground) 48%, transparent);
}
</style>
