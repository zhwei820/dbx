<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { AlertTriangle, Loader2, RefreshCw } from "@lucide/vue";
import { VGrid } from "@revolist/vue3-datagrid";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/composables/useTheme";
import * as api from "@/lib/backend/api";
import { buildSpreadsheetGrid, SPREADSHEET_VIEWER_MAX_ROWS } from "@/lib/spreadsheet/spreadsheetGrid";

const props = defineProps<{ filePath: string }>();

const { t } = useI18n();
const { isDark } = useTheme();

const loading = ref(true);
const error = ref("");
const sheets = ref<string[]>([]);
const activeSheet = ref<string>();
const grid = ref(buildSpreadsheetGrid([], []));
const truncated = ref(false);
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
    grid.value = buildSpreadsheetGrid(preview.columns, preview.rows);
    truncated.value = preview.rows.length >= SPREADSHEET_VIEWER_MAX_ROWS;
  } catch (e: any) {
    if (generation !== loadGeneration) return;
    error.value = e?.message || String(e);
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

function refresh() {
  void load(activeSheet.value);
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
      <Button variant="ghost" size="icon" class="ml-auto h-7 w-7" :title="t('spreadsheet.reload')" :disabled="loading" @click="refresh">
        <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>
    <div class="relative min-h-0 flex-1">
      <div v-if="error" class="flex h-full items-center justify-center gap-2 p-6 text-sm text-destructive">
        <AlertTriangle class="h-4 w-4 shrink-0" />
        <span class="break-all">{{ t("spreadsheet.loadFailed", { message: error }) }}</span>
      </div>
      <template v-else>
        <VGrid class="h-full w-full" :theme="theme" :columns="grid.columns" :source="grid.source" :readonly="true" :resize="true" :range="true" :filter="true" :row-headers="true" :can-focus="true" />
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </template>
    </div>
    <div v-if="sheets.length > 1" class="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t px-2">
      <button
        v-for="sheet in sheets"
        :key="sheet"
        type="button"
        class="shrink-0 rounded px-2 py-0.5 text-xs"
        :class="sheet === activeSheet ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'"
        :disabled="loading"
        @click="sheet !== activeSheet && load(sheet)"
      >
        {{ sheet }}
      </button>
    </div>
  </div>
</template>
