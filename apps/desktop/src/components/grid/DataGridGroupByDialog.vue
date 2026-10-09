<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as api from "@/lib/backend/api";
import type { QueryResult } from "@/types/database";

const MAX_ROWS = 1000;

const { t } = useI18n();
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ columnName: string; sql: string; connectionId: string; database: string; schema?: string }>();

const loading = ref(false);
const error = ref("");
const result = ref<QueryResult | null>(null);
let requestSeq = 0;

async function run() {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    const res = await api.executeQuery(props.connectionId, props.database, props.sql, props.schema, undefined, { maxRows: MAX_ROWS, fetchSize: MAX_ROWS, pageSize: MAX_ROWS });
    if (seq === requestSeq) result.value = res;
  } catch (e: any) {
    if (seq === requestSeq) error.value = e?.message || String(e);
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

watch(
  () => [open.value, props.sql] as const,
  ([isOpen]) => {
    if (isOpen && props.sql) void run();
  },
  { immediate: true },
);

function formatCell(value: unknown): string {
  return value === null || value === undefined ? "NULL" : String(value);
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[80vh] flex-col sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle class="truncate">{{ t("grid.groupByColumnValuesTitle", { column: columnName }) }}</DialogTitle>
      </DialogHeader>
      <pre class="dbx-data-grid-value-font w-full overflow-x-auto whitespace-pre-wrap break-all rounded-[6px] border border-input bg-muted/30 px-2.5 py-1.5 text-xs" data-group-by-sql>{{ sql }}</pre>
      <div class="min-h-24 flex-1 overflow-auto rounded-[6px] border border-input">
        <div v-if="loading" class="flex h-24 items-center justify-center text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /></div>
        <div v-else-if="error" class="whitespace-pre-wrap break-all p-3 text-xs text-destructive">{{ error }}</div>
        <table v-else-if="result" class="dbx-data-grid-value-font w-full text-xs">
          <thead class="sticky top-0 bg-muted">
            <tr>
              <th class="w-12 border-b border-border px-2 py-1 text-right font-normal text-muted-foreground">#</th>
              <th v-for="col in result.columns" :key="col" class="border-b border-border px-2 py-1 text-left font-medium">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in result.rows" :key="rowIndex" class="hover:bg-muted/50">
              <td class="border-b border-border/50 px-2 py-1 text-right text-muted-foreground">{{ rowIndex + 1 }}</td>
              <td v-for="(cell, colIndex) in row" :key="colIndex" class="border-b border-border/50 px-2 py-1 break-all" :class="cell === null && 'italic text-muted-foreground'">{{ formatCell(cell) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DialogFooter class="items-center sm:justify-between">
        <span class="text-xs text-muted-foreground">
          <template v-if="result">{{ result.rows.length >= MAX_ROWS ? t("grid.groupByColumnValuesTruncated", { count: MAX_ROWS }) : t("grid.groupByColumnValuesCount", { count: result.rows.length }) }}</template>
        </span>
        <div class="flex gap-2">
          <Button variant="outline" :disabled="loading" @click="run">{{ t("grid.groupByColumnValuesRerun") }}</Button>
          <Button @click="open = false">{{ t("grid.groupByColumnValuesClose") }}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
