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
import { pluginMarketNodes, pluginMarketUpdates } from "../api";
import type { PluginUpdate, PluginUpdates, PluginUpdateTarget } from "../updates";
import { defaultMarketTargets, type MarketTargetOption } from "../targets";
import PluginMarketTargetsDialog from "./PluginMarketTargetsDialog.vue";
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

const props = defineProps<{ keyword?: string | null; daemonId?: string }>();
const emit = defineEmits<{ loading: [value: boolean] }>();
const loading = ref(false);
const error = ref("");
const updates = ref<PluginUpdates>();
const targetsShown = ref(false);
const preparingTargets = ref(false);
const targets = ref<MarketTargetOption[]>([]);
const selection = ref<string[]>([]);
const pendingUpdates = ref<PluginUpdate[]>([]);
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
const updateCount = computed(() => visibleUpdates.value.length);
const canUpdate = computed(() => !blocked.value);
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
    const response = await pluginMarketUpdates().execute({
      params: { daemonId: props.daemonId },
      forceRequest: true,
      timeout: 60000
    });
    if (request === requestId) updates.value = response.value;
  } catch (cause) {
    if (request === requestId) error.value = getValidatorErrorMsg(cause);
  } finally {
    if (request === requestId) loading.value = false;
  }
}

async function runUpdates(plugins: PluginUpdate[]) {
  const results = await updateMarketPlugins(plugins);
  if (!results.length) return;
  if (results.some((item) => item.result?.restartRequired))
    message.warning(t("TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"));
  if (results.every((item) => !item.error && !item.result?.failedTargets.length))
    message.success(t("TXT_CODE_PLUGIN_MARKET_UPDATED"));
}

async function updateAll() {
  if (disposed || blocked.value) return;
  const query = (props.keyword ?? "").trim().toLowerCase();
  preparingTargets.value = true;
  try {
    const [available, response] = await Promise.all([
      pluginMarketNodes().execute({ forceRequest: true }),
      pluginMarketUpdates().execute({ forceRequest: true, timeout: 60000 })
    ]);
    if (disposed) return;
    if (!available.value || !response.value)
      throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    pendingUpdates.value = response.value.plugins.filter(
      (plugin) =>
        !query ||
        [plugin.displayName, plugin.name].some((name) => name.toLowerCase().includes(query))
    );
    const unchecked = new Set(response.value.uncheckedNodes.map((node) => node.daemonId));
    targets.value = [
      { daemonId: "", remarks: "", ip: "", port: 0, available: true },
      ...available.value
    ].map((node) => {
      const unavailable = !node.available || unchecked.has(node.daemonId);
      const hasUpdates = pendingUpdates.value.some((plugin) =>
        plugin.targets.some((target) => (target.daemonId ?? "") === node.daemonId)
      );
      return {
        ...node,
        disabled: unavailable || !hasUpdates,
        hint: unavailable
          ? t("TXT_CODE_PLUGIN_MARKET_NODE_UNAVAILABLE")
          : !hasUpdates
          ? t("TXT_CODE_PLUGIN_MARKET_UP_TO_DATE")
          : ""
      };
    });
    selection.value = defaultMarketTargets(targets.value, props.daemonId);
    targetsShown.value = true;
  } catch (cause) {
    if (!disposed) message.error(getValidatorErrorMsg(cause));
  } finally {
    preparingTargets.value = false;
  }
}

async function confirmTargets(selected = selection.value) {
  if (disposed || !targetsShown.value || preparingTargets.value || applyingChanges.value) return;
  const chosen = new Set(
    targets.value
      .filter((target) => !target.disabled && selected.includes(target.daemonId))
      .map((target) => target.daemonId)
  );
  const plans = pendingUpdates.value
    .map((plugin) => ({
      ...plugin,
      targets: plugin.targets.filter((target) => chosen.has(target.daemonId ?? ""))
    }))
    .filter((plugin) => plugin.targets.length);
  if (!plans.length) return;
  // Release this dialog's reservation before the shared update executor acquires it.
  targetsShown.value = false;
  await runUpdates(plans);
}

async function updateOne(plugin: PluginUpdate) {
  if (!disposed && !blocked.value) await runUpdates([plugin]);
}

const selectingTargets = computed(() => preparingTargets.value || targetsShown.value);
watch(selectingTargets, (value) => (activeOperations.value += value ? 1 : -1), { flush: "sync" });
watch(loading, (value) => emit("loading", value), { flush: "sync" });
watch(installedChange, () => {
  if (!applyingChanges.value) void refresh();
});
watch(applyingChanges, (value, previous) => {
  if (!value && previous) void refresh();
});
watch(
  () => props.daemonId,
  () => {
    updates.value = undefined;
    void refresh();
  }
);
onMounted(refresh);
onBeforeUnmount(() => {
  disposed = true;
  requestId++;
  if (selectingTargets.value) activeOperations.value--;
});
defineExpose({ refresh, updateAll, updateCount, canUpdate, preparingTargets });
</script>

<template>
  <section class="plugin-updates">
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
            <VBtn variant="text" color="primary" :disabled="blocked" @click="updateOne(plugin)">
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
    <PluginMarketTargetsDialog
      v-model="targetsShown"
      v-model:selection="selection"
      :targets="targets"
      mode="update"
      @confirm="confirmTargets"
    />
  </section>
</template>

<style scoped>
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
