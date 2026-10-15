<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { AlertTriangle, ArrowDownAZ, ArrowDownToLine, ArrowDownZA, ArrowLeftToLine, ArrowRightToLine, ArrowUpDown, ArrowUpToLine, Copy, CopyPlus, Filter, FilterX, ListPlus, Loader2, RefreshCw, Save, Trash2 } from "@lucide/vue";
import type { ColumnRegular } from "@revolist/revogrid";
import { VGrid } from "@revolist/vue3-datagrid";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import CustomContextMenu, { type ContextMenuItem } from "@/components/ui/CustomContextMenu.vue";
import { useTheme } from "@/composables/useTheme";
import { useToast } from "@/composables/useToast";
import * as api from "@/lib/backend/api";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";
import { copyToClipboard } from "@/lib/common/clipboard";
import {
  buildSpreadsheetGrid,
  columnClipboardText,
  defaultCsvSavePath,
  deleteColumnsSplice,
  deleteSpreadsheetRows,
  duplicateColumnsSplice,
  duplicateSpreadsheetRows,
  type GridRange,
  insertColumnsSplice,
  insertSpreadsheetRows,
  rangeClipboardText,
  type SpreadsheetColumnSplice,
  type SpreadsheetRecord,
  spliceSpreadsheetColumnList,
  spliceSpreadsheetColumns,
  spreadsheetColumns,
  SPREADSHEET_VIEWER_MAX_ROWS,
  spreadsheetSourceToRows,
} from "@/lib/spreadsheet/spreadsheetGrid";
import SpreadsheetInsertDialog, { type SpreadsheetInsertPosition } from "@/components/spreadsheet/SpreadsheetInsertDialog.vue";
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
const dirty = ref(false);
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
    grid.value = buildSpreadsheetGrid(preview.columns, preview.rows);
    dirty.value = false;
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
    // getSource is the unsorted, unfiltered backing data, including in-grid edits.
    const source = ((await gridRef.value?.$el.getSource()) ?? grid.value.source) as Record<string, unknown>[];
    const width = grid.value.columns.length;
    await api.exportQueryResultCsv(
      outputPath,
      Array.from({ length: width }, (_, index) => headers.value[index] ?? ""),
      spreadsheetSourceToRows(source, width),
      useSettingsStore().editorSettings.csvQuoteMode,
    );
    dirty.value = false;
    toast(t("spreadsheet.saved", { path: outputPath }), 3000);
  } catch (e: any) {
    toast(t("spreadsheet.saveFailed", { message: e?.message || String(e) }), 5000);
  } finally {
    saving.value = false;
  }
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
  dirty.value = true;
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

async function insertRows(target: Extract<MenuTarget, { kind: "row" }> | undefined, count: number, position: SpreadsheetInsertPosition) {
  const source = await currentSource();
  const width = grid.value.columns.length;
  // Without a row target (empty sheet) rows are appended.
  const at = !target || target.physical.length === 0 ? source.length : position === "before" ? Math.min(...target.physical) : Math.max(...target.physical) + 1;
  const next = insertSpreadsheetRows(source, at, count, width);
  await replaceRows(next, next.slice(at, at + count));
}

async function duplicateRows(target: Extract<MenuTarget, { kind: "row" }>) {
  const result = duplicateSpreadsheetRows(await currentSource(), target.physical);
  await replaceRows(result.source, result.source.slice(result.at, result.at + result.count));
}

async function deleteRows(target: Extract<MenuTarget, { kind: "row" }>) {
  await replaceRows(deleteSpreadsheetRows(await currentSource(), target.physical));
}

async function applyColumnSplice(splice: SpreadsheetColumnSplice, focus?: { start: number; end: number }) {
  const element = gridElement();
  const width = grid.value.columns.length;
  const next = spliceSpreadsheetColumns({ headers: headers.value, source: await currentSource(), width }, splice);
  const sizes = spliceSpreadsheetColumnList(
    grid.value.columns.map((column) => column.size),
    splice,
    undefined,
  );
  // Sort and filter state is keyed by the positional prop, so it would jump to whichever column now owns it.
  if (activeSort.value) {
    activeSort.value = undefined;
    await element?.clearSorting();
  }
  await clearAllFilters();
  headers.value = next.headers;
  grid.value = { columns: spreadsheetColumns(next.headers, next.width, sizes), source: next.source };
  dirty.value = true;
  resetSelectionAnchors();
  await nextTick();
  if (focus && next.width > 0) await selectColumns(focus.start, Math.min(focus.end, next.width - 1));
  else await element?.clearFocus();
}

function insertColumns(target: Extract<MenuTarget, { kind: "column" }>, count: number, position: SpreadsheetInsertPosition) {
  const at = position === "before" ? target.start : target.end + 1;
  void applyColumnSplice(insertColumnsSplice(at, count), { start: at, end: at + count - 1 });
}

function duplicateColumns(target: Extract<MenuTarget, { kind: "column" }>) {
  const count = target.end - target.start + 1;
  void applyColumnSplice(duplicateColumnsSplice(target.start, target.end), { start: target.end + 1, end: target.end + count });
}

function deleteColumns(target: Extract<MenuTarget, { kind: "column" }>) {
  void applyColumnSplice(deleteColumnsSplice(target.start, target.end));
}

const insertDialog = ref<{ open: boolean; kind: "rows" | "columns"; count: number; target?: MenuTarget }>({ open: false, kind: "rows", count: 1 });

function openInsertDialog(target: MenuTarget) {
  const count = target.end - target.start + 1;
  insertDialog.value = { open: true, kind: target.kind === "row" ? "rows" : "columns", count, target };
}

function onInsertDialogConfirm(count: number, position: SpreadsheetInsertPosition) {
  const target = insertDialog.value.target;
  if (target?.kind === "column") insertColumns(target, count, position);
  else void insertRows(target, count, position);
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

async function copySelectionWithHeaders() {
  const element = gridElement();
  if (!element) return;
  try {
    const focused = await element.getFocused();
    const range: GridRange | null = (await element.getSelectedRange()) ?? (focused ? { x: focused.cell.x, y: focused.cell.y, x1: focused.cell.x, y1: focused.cell.y } : null);
    if (!range) return;
    const rows = (await element.getVisibleSource()) as Record<string, unknown>[];
    await copyToClipboard(rangeClipboardText(rows, grid.value.columns, range, true));
    toast(t("spreadsheet.copiedWithHeaders"));
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

// Plain Mod+C keeps RevoGrid's paste-friendly copy; Mod+Shift+C adds the column names.
// Mod+A is handled here because RevoGrid only selects all when a multi-cell range already exists.
function onGridKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
  if (event.code === "KeyC" && event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    void copySelectionWithHeaders();
  } else if (event.code === "KeyA" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    void selectAllCells();
  }
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
    { label: t("spreadsheet.menu.insertRowsAbove", { count }, count), icon: ArrowUpToLine, action: () => void insertRows(target, count, "before") },
    { label: t("spreadsheet.menu.insertRowsBelow", { count }, count), icon: ArrowDownToLine, action: () => void insertRows(target, count, "after") },
    { label: t("spreadsheet.menu.insertRowsMultiple"), icon: ListPlus, action: () => openInsertDialog(target) },
    { label: t("spreadsheet.menu.duplicateRows", { count }, count), icon: CopyPlus, action: () => void duplicateRows(target) },
    { label: "", separator: true },
    { label: t("spreadsheet.menu.deleteRows", { count }, count), icon: Trash2, variant: "destructive", action: () => void deleteRows(target) },
  ];
}

function columnMenuItems(target: Extract<MenuTarget, { kind: "column" }>): ContextMenuItem[] {
  const index = target.index;
  if (!grid.value.columns[index]) return [];
  const count = target.end - target.start + 1;
  const structure: ContextMenuItem[] = [
    { label: "", separator: true },
    { label: t("spreadsheet.menu.insertColumnsLeft", { count }, count), icon: ArrowLeftToLine, action: () => insertColumns(target, count, "before") },
    { label: t("spreadsheet.menu.insertColumnsRight", { count }, count), icon: ArrowRightToLine, action: () => insertColumns(target, count, "after") },
    { label: t("spreadsheet.menu.insertColumnsMultiple"), icon: ListPlus, action: () => openInsertDialog(target) },
    { label: t("spreadsheet.menu.duplicateColumns", { count }, count), icon: CopyPlus, action: () => duplicateColumns(target) },
    // Removing every column leaves no header to right-click, so at least one has to stay.
    { label: t("spreadsheet.menu.deleteColumns", { count }, count), icon: Trash2, variant: "destructive", disabled: count >= grid.value.columns.length, action: () => deleteColumns(target) },
  ];
  // An empty sheet has no row numbers to right-click, so offer the first row here.
  if (grid.value.source.length === 0) structure.push({ label: t("spreadsheet.menu.appendRow"), icon: ListPlus, action: () => void insertRows(undefined, 1, "after") });
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

onMounted(() => void load());

defineExpose({ refresh });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
      <span class="truncate" :title="filePath">{{ filePath }}</span>
      <span class="shrink-0">· {{ t("spreadsheet.rowCount", { count: grid.source.length }) }}</span>
      <span v-if="truncated" class="shrink-0 text-amber-600 dark:text-amber-400">{{ t("spreadsheet.truncated", { max: SPREADSHEET_VIEWER_MAX_ROWS }) }}</span>
      <span v-if="dirty" class="shrink-0 text-amber-600 dark:text-amber-400">· {{ t("spreadsheet.unsaved") }}</span>
      <Button variant="ghost" size="sm" class="ml-auto h-7 gap-1 px-2 text-xs" :title="truncated ? t('spreadsheet.saveDisabledTruncated') : t('spreadsheet.saveAsCsv')" :disabled="loading || saving || truncated || !!error" @click="saveAsCsv">
        <Loader2 v-if="saving" class="h-3.5 w-3.5 animate-spin" />
        <Save v-else class="h-3.5 w-3.5" />
        {{ t("spreadsheet.saveAsCsv") }}
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7" :title="t('spreadsheet.reload')" :disabled="loading" @click="refresh">
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
    <div class="relative min-h-0 flex-1">
      <div v-if="error" class="flex h-full items-center justify-center gap-2 p-6 text-sm text-destructive">
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span class="break-all">{{ t("spreadsheet.loadFailed", { message: error }) }}</span>
      </div>
      <CustomContextMenu v-else :items="menuItems" v-slot="{ onContextMenu }">
        <div class="h-full w-full" @contextmenu="onGridContextMenu($event, onContextMenu)" @click="onGridClick" @keydown.capture="onGridKeydown">
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
            @afteredit="dirty = true"
            @headerclick="onHeaderClick"
            @clipboardrangecopy="onClipboardRangeCopy"
          />
        </div>
      </CustomContextMenu>
      <div v-if="loading && !error" class="absolute inset-0 flex items-center justify-center bg-background/60">
        <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
    <SpreadsheetInsertDialog v-model:open="insertDialog.open" :kind="insertDialog.kind" :initial-count="insertDialog.count" @insert="onInsertDialogConfirm" />
    <div v-if="sheets.length > 1" class="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t px-2">
      <button v-for="sheet in sheets" :key="sheet" type="button" class="shrink-0 rounded px-2 py-0.5 text-xs" :class="sheet === activeSheet ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'" :disabled="loading" @click="switchSheet(sheet)">
        {{ sheet }}
      </button>
    </div>
  </div>
</template>
