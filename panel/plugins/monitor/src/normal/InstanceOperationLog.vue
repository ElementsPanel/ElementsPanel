<script setup lang="ts">
import { getInstanceOperationLog } from "../api";
import { formatOperationLogItem, type FormattedOperationLog } from "../hooks/useOperationLog";
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { FileTextOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { computed, onMounted, ref } from "vue";
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
const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

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
  emit("close");
};

onMounted(fetchLogs);
</script>

<template>
  <Teleport to="body">
    <Transition name="monitor-log-fade">
      <component
        :is="desktopWindow"
        v-if="useDesktopWindow"
        id="instance-operation-log"
        :title="t('TXT_CODE_f6a33629')"
        :icon="FileTextOutlined"
        :visible="dialogOpen"
        :minimized="false"
        :maximized="false"
        :active="true"
        :initial-width="680"
        :initial-height="500"
        :initial-x="windowWidth / 2 - 340"
        :initial-y="windowHeight / 2 - 250"
        :z-index="10004"
        :show-minimize="false"
        :show-maximize="false"
        :resizable="false"
        @close="close"
      >
        <InstanceOperationLogContent :loading="loading" :logs="logs" desktop />
      </component>

      <a-modal
        v-else
        v-model:open="dialogOpen"
        centered
        :mask-closable="true"
        :width="680"
        :title="t('TXT_CODE_f6a33629')"
        :footer="null"
        @cancel="close"
      >
        <InstanceOperationLogContent :loading="loading" :logs="logs" />
      </a-modal>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.monitor-log-fade-enter-active,
.monitor-log-fade-leave-active {
  transition: all 0.25s ease;
}

.monitor-log-fade-enter-from,
.monitor-log-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
