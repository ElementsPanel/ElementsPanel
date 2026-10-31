<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import {
  VAlert,
  VBtn,
  VIcon,
  VProgressCircular,
  VProgressLinear,
  VTable
} from "vuetify/components";
import { pluginMarketUpdates } from "../api";
import type { PluginUpdates, PluginUpdateTarget } from "../updates";
import {
  activeOperations,
  applyingChanges,
  installedChange,
  queuedChanges,
  updateMarketPlugins,
  updateProgress,
  updateResults,
  updatingPlugins
} from "../operations";

const props = defineProps<{ keyword?: string | null }>();
const emit = defineEmits<{ loading: [value: boolean] }>();
const loading = ref(false);
const error = ref("");
const updates = ref<PluginUpdates>();
let requestId = 0;
let disposed = false;
const visibleUpdates = computed(() => {
  const query = (props.keyword ?? "").trim().toLowerCase();
  return (updates.value?.plugins ?? []).filter(
    (plugin) =>
      !query || [plugin.displayName, plugin.name].some((name) => name.toLowerCase().includes(query))
  );
});
const blocked = computed(
  () =>
    loading.value ||
    applyingChanges.value ||
    Boolean(activeOperations.value) ||
    Boolean(queuedChanges.value.length)
);
const failures = computed(() =>
  updateResults.value.filter((item) => item.error || item.result?.failedTargets.length)
);
const targetLabel = (target: PluginUpdateTarget) =>
  target.daemonId ? target.label : t("TXT_CODE_PLUGIN_MARKET_SIDE_PANEL");

async function refresh() {
  if (disposed || updatingPlugins.value) return;
  const request = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const response = await pluginMarketUpdates().execute({ forceRequest: true, timeout: 60000 });
    if (request === requestId) updates.value = response.value;
  } catch (cause) {
    if (request === requestId) error.value = getValidatorErrorMsg(cause);
  } finally {
    if (request === requestId) loading.value = false;
  }
}

async function updateAll(plugins = visibleUpdates.value) {
  if (blocked.value) return;
  const results = await updateMarketPlugins(plugins);
  if (!results.length) return;
  if (results.some((item) => item.result?.restartRequired))
    message.warning(t("TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"));
  if (results.every((item) => !item.error && !item.result?.failedTargets.length))
    message.success(t("TXT_CODE_PLUGIN_MARKET_UPDATED"));
}

watch(loading, (value) => emit("loading", value), { flush: "sync" });
watch(installedChange, () => {
  if (!applyingChanges.value) void refresh();
});
watch(applyingChanges, (value, previous) => {
  if (!value && previous) void refresh();
});
onMounted(refresh);
onBeforeUnmount(() => {
  disposed = true;
  requestId++;
});
defineExpose({ refresh });
</script>

<template>
  <section class="plugin-updates">
    <div class="plugin-updates-actions mb-4">
      <VBtn
        color="primary"
        prepend-icon="mdi-update"
        :disabled="blocked || !visibleUpdates.length"
        :loading="updatingPlugins"
        @click="updateAll()"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_UPDATE_ALL") }}
        <span v-if="visibleUpdates.length"> ({{ visibleUpdates.length }})</span>
      </VBtn>
    </div>
    <VAlert v-if="error" type="error" variant="tonal" :text="error" class="mb-4" />
    <VAlert
      v-if="updates?.uncheckedNodes.length"
      type="warning"
      variant="tonal"
      class="mb-4"
      :text="
        t('TXT_CODE_PLUGIN_MARKET_UNCHECKED_NODES', {
          nodes: updates.uncheckedNodes.map((node) => node.label).join('、')
        })
      "
    />
    <VAlert
      v-if="queuedChanges.length"
      type="info"
      variant="tonal"
      class="mb-4"
      :text="t('TXT_CODE_PLUGIN_MARKET_UPDATES_QUEUE_HINT')"
    />
    <template v-if="updatingPlugins">
      <div class="text-body-2 mb-2" role="status">
        {{ t("TXT_CODE_PLUGIN_MARKET_UPDATE_PROGRESS", updateProgress) }}
      </div>
      <VProgressLinear
        :model-value="
          updateProgress.total ? (updateProgress.completed / updateProgress.total) * 100 : 0
        "
        class="mb-4"
      />
    </template>
    <div v-else-if="loading && !updates" class="plugin-market-loading">
      <VProgressCircular indeterminate color="primary" :size="40" :width="3" />
    </div>
    <VAlert
      v-for="item in failures"
      :key="item.update.pluginId"
      type="error"
      variant="tonal"
      class="mb-4"
      :title="item.update.displayName"
      :text="
        item.error
          ? getValidatorErrorMsg(item.error)
          : t('TXT_CODE_PLUGIN_MARKET_UPDATE_FAILED', {
              targets: item.result?.failedTargets.map(targetLabel).join('、')
            })
      "
    />
    <VAlert
      v-if="updateResults.some((item) => item.result?.restartRequired)"
      type="warning"
      variant="tonal"
      :text="t('TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED')"
      class="mb-4"
    />
    <VTable v-if="visibleUpdates.length" class="plugin-updates-table">
      <thead>
        <tr>
          <th>{{ t("TXT_CODE_PLUGIN_MARKET_PLUGIN_ID") }}</th>
          <th>{{ t("TXT_CODE_PLUGIN_MARKET_UPDATE_TARGETS") }}</th>
          <th>{{ t("TXT_CODE_PLUGIN_MARKET_TARGET_VERSION") }}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="plugin in visibleUpdates" :key="plugin.pluginId">
          <td>
            <div class="font-weight-medium">{{ plugin.displayName }}</div>
            <div class="text-caption text-medium-emphasis">{{ plugin.name }}</div>
          </td>
          <td>
            <div v-for="target in plugin.targets" :key="target.daemonId || 'panel'">
              {{ targetLabel(target) }} ·
              {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: target.currentVersion }) }}
            </div>
          </td>
          <td>{{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.version }) }}</td>
          <td class="text-end">
            <VBtn variant="text" color="primary" :disabled="blocked" @click="updateAll([plugin])">
              {{ t("TXT_CODE_PLUGIN_MARKET_UPDATES") }}
            </VBtn>
          </td>
        </tr>
      </tbody>
    </VTable>
    <div
      v-else-if="!loading && !error && !updatingPlugins"
      class="plugin-market-empty"
      role="status"
    >
      <VIcon icon="mdi-check-circle-outline" size="48" class="mb-3" />
      <div>{{ t(keyword?.trim() ? "TXT_CODE_NO_DATA" : "TXT_CODE_PLUGIN_MARKET_UP_TO_DATE") }}</div>
    </div>
  </section>
</template>

<style scoped>
.plugin-updates-actions {
  display: flex;
  justify-content: flex-start;
}
.plugin-updates-table td {
  padding-block: 16px !important;
}
.plugin-market-loading {
  min-height: 38vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.plugin-market-empty {
  padding: 64px 24px;
  text-align: center;
  color: var(--text-color);
}
</style>
