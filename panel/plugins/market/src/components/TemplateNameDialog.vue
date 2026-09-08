<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { t } from "@/lang/i18n";
import type { QuickStartPackages } from "@/types";
import { computed, reactive } from "vue";
import { VChip, VTextField } from "vuetify/lib/components/index.mjs";

const props = defineProps<{ open: boolean; template: QuickStartPackages | null }>();
const emit = defineEmits<{ "update:open": [value: boolean]; confirm: [instanceName: string, template: QuickStartPackages] }>();
const dialogOpen = computed({ get: () => props.open, set: (value: boolean) => emit("update:open", value) });
const formData = reactive({ instanceName: "" });
const handleCancel = () => { emit("update:open", false); formData.instanceName = ""; };
const handleConfirm = () => {
  if (!formData.instanceName.trim() || !props.template) return;
  emit("confirm", formData.instanceName.trim(), props.template);
  handleCancel();
};
</script>

<template>
  <AppDialog v-model:open="dialogOpen" :title="t('TXT_CODE_c10ea805')" width="500px" compact :ok-text="t('TXT_CODE_e4898801')" @ok="handleConfirm" @cancel="handleCancel">
    <div v-if="template" class="template-info">
      <img v-if="template.image" :src="template.image" :alt="template.title" class="template-image" />
      <div class="template-details">
        <div class="template-title">{{ template.title }}</div>
        <div class="template-description">{{ template.description }}</div>
        <div class="template-meta"><VChip size="small" variant="tonal">{{ template.category }}</VChip><VChip size="small" variant="tonal">{{ template.platform }}</VChip></div>
      </div>
    </div>
    <VTextField v-model="formData.instanceName" :label="t('TXT_CODE_44ae0e7')" :placeholder="t('TXT_CODE_cf27ab7e')" maxlength="50" counter variant="solo-filled" hide-details="auto" @keyup.enter="handleConfirm" />
  </AppDialog>
</template>

<style scoped>
.template-info { display:flex; gap:16px; margin-bottom:20px; padding:16px; border-radius:12px; background:var(--color-gray-2); }
.template-image { width:80px; height:80px; object-fit:cover; border-radius:10px; flex-shrink:0; }
.template-details { min-width:0; }
.template-title { font-weight:600; font-size:18px; margin-bottom:6px; }
.template-description { color:var(--color-gray-7); font-size:14px; line-height:1.5; margin-bottom:10px; }
.template-meta { display:flex; gap:8px; flex-wrap:wrap; }
</style>
