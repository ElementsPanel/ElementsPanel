<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useBackgroundTasks, type BackgroundTask } from "@/stores/useBackgroundTasks";
import {
  VAlert,
  VBtn,
  VCard,
  VChip,
  VDialog,
  VDivider,
  VIcon,
  VProgressLinear
} from "vuetify/components";

const { state, isLogged } = useAppStateStore();
const { open, tasks, unavailable, loading, error, activeCount, refresh, reset, cancel, clear } =
  useBackgroundTasks();
const cancelling = ref(new Set<string>());
const clearing = ref(false);
const activeOnly = ref(false);
const visibleTasks = computed(() =>
  [...tasks.value]
    .filter((task) => !activeOnly.value || task.state === "running")
    .sort(
      (a, b) =>
        Number(b.state === "running") - Number(a.state === "running") || b.startedAt - a.startedAt
    )
);
const kinds: Record<string, string> = {
  download: "TASKS_DOWNLOAD",
  modDownload: "TASKS_MOD_DOWNLOAD",
  upload: "TASKS_UPLOAD",
  uploadExtract: "TASKS_UPLOAD_EXTRACT",
  compress: "TASKS_COMPRESS",
  extract: "TASKS_EXTRACT",
  copy: "TASKS_COPY",
  move: "TASKS_MOVE",
  delete: "TASKS_DELETE",
  permissions: "TASKS_PERMISSIONS",
  preview: "TASKS_PREVIEW",
  restore: "TASKS_RESTORE",
  javaInstall: "TASKS_JAVA_INSTALL",
  imagePull: "TASKS_IMAGE_BUILD",
  instanceTask: "TASKS_INSTANCE"
};
const statuses = {
  running: "TASKS_RUNNING",
  completed: "TASKS_COMPLETED",
  failed: "TASKS_FAILED",
  cancelled: "TASKS_CANCELLED"
};
const color = (task: BackgroundTask) =>
  ({ running: "primary", completed: "success", failed: "error", cancelled: "secondary" })[
    task.state
  ];
const percent = (task: BackgroundTask) =>
  task.state === "completed"
    ? 100
    : task.total > 0
    ? Math.min(100, Math.floor((task.current / task.total) * 100))
    : 0;
const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1024 ** 2
    ? `${(value / 1024).toFixed(1)} KB`
    : value < 1024 ** 3
    ? `${(value / 1024 ** 2).toFixed(1)} MB`
    : `${(value / 1024 ** 3).toFixed(1)} GB`;
const stop = async (task: BackgroundTask) => {
  cancelling.value.add(task.id);
  try {
    await cancel(task);
  } catch {
    /* The shared API service displays action errors. */
  } finally {
    cancelling.value.delete(task.id);
  }
};
const clearFinished = async () => {
  clearing.value = true;
  try {
    await clear();
  } catch {
    /* The shared API service displays action errors. */
  } finally {
    clearing.value = false;
  }
};

let timer: ReturnType<typeof setTimeout> | undefined;
let pollingGeneration = 0;
const stopPolling = () => {
  pollingGeneration++;
  clearTimeout(timer);
};
watch(
  () => [isLogged.value, state.userInfo?.uuid] as const,
  () => {
    stopPolling();
    reset();
    activeOnly.value = false;
    if (!isLogged.value) return;
    const generation = pollingGeneration;
    const poll = async () => {
      await refresh();
      if (generation === pollingGeneration) timer = setTimeout(poll, open.value ? 1500 : 4000);
    };
    void poll();
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  stopPolling();
  reset();
});
</script>

<template>
  <VDialog
    v-model="open"
    class="background-tasks-drawer"
    max-width="480"
    transition="slide-x-reverse-transition"
    :aria-label="t('TASKS_TITLE')"
  >
    <VCard
      id="background-tasks-sidebar"
      :title="t('TASKS_TITLE')"
      class="background-tasks-card"
      rounded="0"
    >
      <template #append>
        <VBtn
          icon="mdi-refresh"
          size="small"
          variant="text"
          :loading="loading"
          :title="t('TASKS_REFRESH')"
          :aria-label="t('TASKS_REFRESH')"
          @click="refresh"
        />
        <VBtn
          icon="mdi-close"
          size="small"
          variant="text"
          :title="t('TASKS_CLOSE')"
          :aria-label="t('TASKS_CLOSE')"
          @click="open = false"
        />
      </template>
      <div class="task-toolbar">
        <VChip
          :variant="activeOnly ? 'outlined' : 'tonal'"
          color="primary"
          @click="activeOnly = false"
          >{{ t("TASKS_ALL") }} · {{ tasks.length }}</VChip
        >
        <VChip
          :variant="activeOnly ? 'tonal' : 'outlined'"
          color="primary"
          @click="activeOnly = true"
          >{{ t("TASKS_RUNNING") }} · {{ activeCount }}</VChip
        >
        <VBtn
          class="ml-auto"
          size="small"
          variant="text"
          :loading="clearing"
          :disabled="!tasks.some((task) => task.state !== 'running')"
          @click="clearFinished"
          >{{ t("TASKS_CLEAR") }}</VBtn
        >
      </div>
      <VDivider />
      <div class="task-list" aria-live="polite" aria-relevant="additions removals">
        <VAlert
          v-if="error || unavailable"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
          >{{ t(error ? "TASKS_LOAD_ERROR" : "TASKS_UNAVAILABLE") }}</VAlert
        >
        <div v-if="!visibleTasks.length && !loading" class="task-empty">
          <VIcon icon="mdi-clipboard-check-outline" size="48" class="mb-3" />
          <div>{{ t("TASKS_EMPTY") }}</div>
        </div>
        <article
          v-for="task in visibleTasks"
          :key="`${task.daemonId}:${task.id}`"
          class="task-item"
        >
          <div class="task-heading">
            <span class="text-caption">{{ t(kinds[task.kind] || "TASKS_INSTANCE") }}</span>
            <VChip :color="color(task)" size="x-small" variant="tonal">{{
              t(statuses[task.state])
            }}</VChip>
          </div>
          <div class="task-name" :title="task.name">
            {{ task.name.split(/[\\/]/).pop() || t(kinds[task.kind] || "TASKS_INSTANCE") }}
          </div>
          <div class="task-context text-caption">
            {{ task.nodeName
            }}<template v-if="task.instanceUuid"> · {{ task.instanceUuid }}</template>
          </div>
          <div v-if="task.error" class="task-error text-caption">{{ task.error }}</div>
          <VProgressLinear
            :model-value="percent(task)"
            :color="color(task)"
            height="5"
            rounded
            :indeterminate="task.state === 'running' && !task.total"
            class="my-3"
          />
          <div class="task-footer text-caption">
            <span v-if="task.total > 0"
              >{{ percent(task) }}%<template v-if="!['javaInstall', 'restore'].includes(task.kind)">
                · {{ bytes(task.current) }} / {{ bytes(task.total) }}</template
              ></span
            >
            <time :datetime="new Date(task.startedAt).toISOString()">{{
              new Date(task.startedAt).toLocaleString()
            }}</time>
            <VBtn
              v-if="task.cancellable"
              icon="mdi-stop"
              size="x-small"
              variant="text"
              color="error"
              :loading="cancelling.has(task.id)"
              :title="t('TASKS_CANCEL')"
              :aria-label="t('TASKS_CANCEL')"
              @click="stop(task)"
            />
          </div>
        </article>
      </div>
    </VCard>
  </VDialog>
</template>

<style scoped>
.background-tasks-drawer :deep(.v-overlay__content) {
  right: 0;
  margin: 0 !important;
  width: min(480px, 100vw) !important;
  max-width: 100vw !important;
  height: 100dvh;
  max-height: 100dvh !important;
}
.background-tasks-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.background-tasks-card > :deep(.v-card-item) {
  flex: 0 0 auto;
  min-height: 60px;
  padding: 10px 16px;
}
.background-tasks-card > :deep(.v-card-item .v-card-title) {
  font-size: 15px;
  font-weight: 600;
}
.task-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}
.task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}
.task-empty {
  padding: 64px 12px;
  text-align: center;
  opacity: 0.6;
}
.task-item {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.task-heading,
.task-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.task-name {
  font-weight: 500;
  margin-top: 8px;
  overflow-wrap: anywhere;
}
.task-context {
  opacity: 0.65;
  overflow-wrap: anywhere;
  margin-top: 4px;
}
.task-error {
  color: rgb(var(--v-theme-error));
  overflow-wrap: anywhere;
  margin-top: 8px;
}
.task-footer {
  flex-wrap: wrap;
  opacity: 0.8;
}
</style>
