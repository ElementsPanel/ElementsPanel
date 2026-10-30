<script setup lang="ts">
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import DesktopDialog from "@/components/DesktopDialog.vue";
import { VBtn } from "vuetify/components";
import { getInstanceOperationLog } from "../api";
import { formatOperationLogItem, type FormattedOperationLog } from "../hooks/useOperationLog";
import InstanceOperationLogContent from "./InstanceOperationLogContent.vue";

const props = defineProps<{
  mode: "normal" | "desktop";
  instanceId: string;
  daemonId: string;
  instanceName?: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();

const dialogOpen = ref(true);
const loading = ref(false);
const logs = ref<FormattedOperationLog[]>([]);
const desktopWindow = computed(() => ctx.desktop.window);
const useDesktopWindow = computed(() => props.mode === "desktop" && !!desktopWindow.value);

const fetchLogs = async () => {
  loading.value = true;
  try {
    const { execute } = getInstanceOperationLog();
    const data = await execute({
      params: {
        daemonId: props.daemonId,
        instanceId: props.instanceId,
        limit: 100
      }
    });
    logs.value = (data.value || []).reverse().map(formatOperationLogItem);
  } catch (error: any) {
    message.error(error?.message || t("TXT_CODE_4a689666"));
    logs.value = [];
  } finally {
    loading.value = false;
  }
};

const close = () => {
  dialogOpen.value = false;
};

const emitClose = () => {
  emit("close");
};

onMounted(fetchLogs);
</script>

<template>
  <DesktopDialog v-if="useDesktopWindow" :model-value="dialogOpen"
    id="instance-operation-log" :title="t('TXT_CODE_f6a33629')" icon="mdi-file-document-outline"
    :width="680" :height="500" :z-index="10004" :padded="false" :scrollable="false"
    @close="close" @after-leave="emitClose">
    <InstanceOperationLogContent :loading="loading" :logs="logs" desktop />
  </DesktopDialog>

    <AppDialog
      v-else
      v-model:open="dialogOpen"
      :max-width="680"
      :title="t('TXT_CODE_f6a33629')"
      @after-close="emitClose"
    >
      <InstanceOperationLogContent :loading="loading" :logs="logs" />
      <template #footer>
        <VBtn variant="text" @click="close">
          {{ t("TXT_CODE_b1dedda3") }}
        </VBtn>
      </template>
    </AppDialog>
</template>
