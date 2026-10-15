<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SPREADSHEET_MAX_INSERT_COLUMNS, SPREADSHEET_MAX_INSERT_ROWS } from "@/lib/spreadsheet/spreadsheetGrid";

export type SpreadsheetInsertPosition = "before" | "after";

const { t } = useI18n();
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ kind: "rows" | "columns"; initialCount?: number; initialPosition?: SpreadsheetInsertPosition }>();
const emit = defineEmits<{ insert: [count: number, position: SpreadsheetInsertPosition] }>();

const count = ref<string | number>("1");
const position = ref<SpreadsheetInsertPosition>("after");
const max = computed(() => (props.kind === "rows" ? SPREADSHEET_MAX_INSERT_ROWS : SPREADSHEET_MAX_INSERT_COLUMNS));

watch(open, (isOpen) => {
  if (!isOpen) return;
  count.value = String(props.initialCount ?? 1);
  position.value = props.initialPosition ?? "after";
});

const parsedCount = computed<number | null>(() => {
  const trimmed = String(count.value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? Math.min(value, max.value) : null;
});

function confirm() {
  if (parsedCount.value === null) return;
  emit("insert", parsedCount.value, position.value);
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>{{ kind === "rows" ? t("spreadsheet.insertDialog.rowsTitle") : t("spreadsheet.insertDialog.columnsTitle") }}</DialogTitle>
        <DialogDescription>{{ t("spreadsheet.insertDialog.maxHint", { max }) }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-3">
        <div class="space-y-2">
          <label for="spreadsheet-insert-count" class="text-sm font-medium">{{ t("spreadsheet.insertDialog.count") }}</label>
          <Input id="spreadsheet-insert-count" v-model="count" type="number" min="1" :max="max" :aria-invalid="parsedCount === null" class="w-40" @keydown.enter.prevent="confirm" />
        </div>
        <div class="space-y-1.5">
          <span class="text-sm font-medium">{{ t("spreadsheet.insertDialog.position") }}</span>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="position" type="radio" value="before" class="h-3.5 w-3.5 accent-primary" />
            {{ kind === "rows" ? t("spreadsheet.insertDialog.above") : t("spreadsheet.insertDialog.left") }}
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="position" type="radio" value="after" class="h-3.5 w-3.5 accent-primary" />
            {{ kind === "rows" ? t("spreadsheet.insertDialog.below") : t("spreadsheet.insertDialog.right") }}
          </label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t("dangerDialog.cancel") }}</Button>
        <Button :disabled="parsedCount === null" @click="confirm">{{ t("spreadsheet.insertDialog.confirm") }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
