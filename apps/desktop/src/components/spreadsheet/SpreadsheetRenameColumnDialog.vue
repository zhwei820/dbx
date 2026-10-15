<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const { t } = useI18n();
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ initialName: string; placeholder: string }>();
const emit = defineEmits<{ rename: [name: string] }>();

const name = ref("");

watch(open, (isOpen) => {
  if (isOpen) name.value = props.initialName;
});

// Enter that commits an IME candidate (typing a Chinese name) must not submit the dialog.
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  confirm();
}

function confirm() {
  emit("rename", name.value.trim());
  open.value = false;
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>{{ t("spreadsheet.renameDialog.title") }}</DialogTitle>
        <DialogDescription>{{ t("spreadsheet.renameDialog.hint", { letter: placeholder }) }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <label for="spreadsheet-rename-column" class="text-sm font-medium">{{ t("spreadsheet.renameDialog.name") }}</label>
        <Input id="spreadsheet-rename-column" v-model="name" :placeholder="placeholder" @focus="($event.target as HTMLInputElement).select()" @keydown.enter="onEnter" />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t("dangerDialog.cancel") }}</Button>
        <Button @click="confirm">{{ t("spreadsheet.renameDialog.confirm") }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
