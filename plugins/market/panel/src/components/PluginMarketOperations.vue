<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { ctx } from "@/plugin/context";
import { computed, onScopeDispose, ref, watch } from "vue";
import { VAlert, VBtn, VCheckbox } from "vuetify/components";
import {
  installMarketPlugin,
  pluginMarketTargets,
  pluginMarketPackage,
  uninstallMarketPlugin,
  type MarketPlugin,
  type MarketPluginVersion
} from "../api";
import PluginMarketTargetsDialog from "./PluginMarketTargetsDialog.vue";
import { defaultMarketTargets, type MarketTargetOption } from "../targets";
import { isNewerVersion } from "../version";
import {
  activeOperations,
  applyingChanges,
  bulkMode,
  changingDependencies,
  notifyInstalled,
  queueMarketChange
} from "../operations";

const props = defineProps<{
  plugin: MarketPlugin;
  version?: MarketPluginVersion;
  /**
   * Only offer the install action. A release row installs that one release and has
   * nothing to say about uninstalling, which belongs to the plugin as a whole.
   */
  installOnly?: boolean;
  allowVersionChange?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  installed: [pluginId: string, version: string | undefined];
  busy: [value: boolean];
  staged: [];
}>();
const pendingId = ref("");
const canInstall = computed(() => Boolean(props.version && !props.plugin.installedVersion));
const canUpdate = computed(() =>
  Boolean(
    !props.installOnly &&
      props.version &&
      props.plugin.installedVersion &&
      props.plugin.installedUpdatable !== false &&
      (props.allowVersionChange
        ? props.version.version !== props.plugin.installedVersion ||
          props.plugin.installedState === "failed"
        : isNewerVersion(props.version.version, props.plugin.installedVersion))
  )
);
const incompatible = computed(() =>
  Object.values(props.version?.compatibility || {}).some(
    (contract) =>
      contract && (contract.api !== 1 || (contract.sdk !== undefined && contract.sdk !== 1))
  )
);
let disposed = false;

const removeConfig = ref(false);
const targets = ref<MarketTargetOption[]>([]);
const selection = ref<string[]>([]);
const mode = ref<"install" | "uninstall">("install");
const targetPlugin = ref<MarketPlugin | null>(null);
const targetsShown = computed({
  get: () => targetPlugin.value !== null,
  set: (value: boolean) => {
    if (!value) targetPlugin.value = null;
  }
});

function nodeNames(daemonIds: readonly string[]) {
  return daemonIds.map((daemonId) => {
    const node = targets.value.find((item) => item.daemonId === daemonId);
    return node ? node.remarks || node.ip : daemonId;
  });
}

async function packageSides(plugin: MarketPlugin) {
  const { execute } = pluginMarketPackage();
  const response = await execute({
    params: { pluginId: plugin.id, version: plugin.latestVersion?.version }
  });
  return response.value?.sides ?? [];
}

async function prepareTargets(
  plugin: MarketPlugin,
  operation: "install" | "uninstall",
  sides?: string[]
) {
  const response = await pluginMarketTargets().execute({
    params: { pluginId: plugin.id },
    forceRequest: true,
    timeout: 15000
  });
  if (disposed) return;
  if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
  targets.value = response.value.map((target) => {
    let reason = "";
    if (!target.available) reason = "TXT_CODE_PLUGIN_MARKET_NODE_UNAVAILABLE";
    else if (operation === "uninstall") {
      if (!target.installed) reason = "TXT_CODE_PLUGIN_MARKET_NOT_INSTALLED";
      else if (!target.removable) reason = "TXT_CODE_PLUGIN_MARKET_UNINSTALL_PROTECTED";
    } else if (!sides?.includes(target.daemonId ? "daemon" : "panel"))
      reason = "TXT_CODE_PLUGIN_MARKET_UNSUPPORTED_TARGET";
    else if (target.installed && !target.updatable) reason = "TXT_CODE_PLUGIN_MARKET_PROTECTED";
    return {
      ...target,
      disabled: Boolean(reason),
      hint: reason
        ? t(reason)
        : target.installedVersion
        ? t("TXT_CODE_PLUGIN_MARKET_INSTALLED_VERSION", { version: target.installedVersion })
        : ""
    };
  });
  selection.value = defaultMarketTargets(targets.value, plugin.targetDaemonId);
  mode.value = operation;
  targetPlugin.value = plugin;
}

async function confirmTargets(selected = selection.value) {
  const plugin = targetPlugin.value;
  if (!plugin || disposed || pendingId.value) return;
  const chosen = targets.value
    .filter((target) => !target.disabled && selected.includes(target.daemonId))
    .map((target) => target.daemonId);
  if (!chosen.length) return;
  pendingId.value = plugin.id;
  targetPlugin.value = null;
  if (mode.value === "install") await runInstall(plugin, chosen);
  else await runUninstall(plugin, chosen);
}

async function install(toNodes = false) {
  if (
    disposed ||
    props.disabled ||
    applyingChanges.value ||
    activeOperations.value ||
    incompatible.value ||
    busy.value ||
    !props.version
  )
    return;
  if (!canInstall.value && !canUpdate.value && !toNodes) return;
  if (props.plugin.installedVersion && props.plugin.installedUpdatable === false) return;
  const plugin = { ...props.plugin, latestVersion: props.version };
  pendingId.value = plugin.id;
  try {
    const sides = await packageSides(plugin);
    if (disposed) return;
    await prepareTargets(plugin, "install", sides);
    if (toNodes && !disposed)
      selection.value = targets.value
        .filter((target) => target.daemonId && !target.disabled)
        .map((target) => target.daemonId);
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

function stageTargets(plugin: MarketPlugin, selected: string[], kind: "install" | "uninstall") {
  for (const daemonId of selected) {
    const target = targets.value.find((item) => item.daemonId === daemonId);
    queueMarketChange({
      plugin: { ...plugin, targetDaemonId: daemonId, installedVersion: target?.installedVersion },
      kind,
      ...(kind === "install"
        ? { version: plugin.latestVersion?.version }
        : { removeConfig: removeConfig.value }),
      daemonIds: daemonId ? [daemonId] : []
    });
  }
  pendingId.value = "";
  emit("staged");
}

function publishChanges(
  plugin: MarketPlugin,
  selected: string[],
  failedNodes: string[],
  kind: "install" | "uninstall",
  installedVersion?: string
) {
  const changed = selected.filter((daemonId) => !failedNodes.includes(daemonId));
  // One invalidation covers a multi-host change; Vue batches synchronous notifications.
  if (changed.length)
    notifyInstalled(
      plugin.id,
      changed.length === 1
        ? kind === "install"
          ? plugin.latestVersion?.version
          : undefined
        : installedVersion,
      changed.length === 1 ? changed[0] : undefined
    );
  if (plugin.targetDaemonId === undefined) emit("installed", plugin.id, installedVersion);
  else if (changed.includes(plugin.targetDaemonId))
    emit("installed", plugin.id, kind === "install" ? plugin.latestVersion?.version : undefined);
}

async function runInstall(plugin: MarketPlugin, selected: string[]) {
  const daemonIds = selected.filter(Boolean);
  if (bulkMode.value) {
    stageTargets(plugin, selected, "install");
    return;
  }
  pendingId.value = plugin.id;
  changingDependencies.value++;
  try {
    const { execute } = installMarketPlugin();
    const response = await execute({
      // Nodes are processed independently; allow each selected npm operation its full window.
      timeout: (daemonIds.length + 1) * 11 * 60 * 1000,
      data: {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.latestVersion?.version,
        daemonIds,
        panel: selected.includes("")
      }
    });
    if (disposed) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    // npm has already committed the operation; asset refresh failures are
    // reported by the frontend loader and must not turn it into an npm error.
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    const failed = response.value.failedNodes;
    publishChanges(plugin, selected, failed, "install", response.value.installedVersion);
    if (failed.length) {
      message.error(
        t("TXT_CODE_PLUGIN_MARKET_NODE_FAILED", { nodes: nodeNames(failed).join("、") })
      );
    } else {
      message.success(t("TXT_CODE_PLUGIN_MARKET_INSTALLED"));
    }
    if (response.value.restartRequired) {
      message.warning(t("TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"));
    }
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    changingDependencies.value--;
    pendingId.value = "";
  }
}

async function requestUninstall(plugin = props.plugin) {
  if (
    !plugin ||
    disposed ||
    busy.value ||
    activeOperations.value ||
    applyingChanges.value ||
    props.disabled
  )
    return;
  pendingId.value = plugin.id;
  removeConfig.value = false;
  try {
    // Reading live host inventories keeps removal independent of market availability.
    await prepareTargets({ ...plugin }, "uninstall");
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

async function runUninstall(plugin: MarketPlugin, selected: string[]) {
  const daemonIds = selected.filter(Boolean);
  if (bulkMode.value) {
    stageTargets(plugin, selected, "uninstall");
    return;
  }
  pendingId.value = plugin.id;
  changingDependencies.value++;
  try {
    const { execute } = uninstallMarketPlugin();
    const response = await execute({
      timeout: (daemonIds.length + 1) * 11 * 60 * 1000,
      params: {
        pluginId: plugin.id,
        daemonIds: daemonIds.join(","),
        panel: selected.includes(""),
        ...(removeConfig.value ? { removeConfig: true } : {})
      }
    });
    if (disposed) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    // npm has already committed the operation; asset refresh failures are
    // reported by the frontend loader and must not turn it into an npm error.
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    const failed = response.value.failedNodes;
    publishChanges(plugin, selected, failed, "uninstall", response.value.installedVersion);
    if (failed.length) {
      message.error(
        t("TXT_CODE_PLUGIN_MARKET_NODE_FAILED", { nodes: nodeNames(failed).join("、") })
      );
    } else if (response.value.removed) {
      message.success(t("TXT_CODE_PLUGIN_MARKET_UNINSTALLED"));
    } else {
      message.warning(t("TXT_CODE_PLUGIN_MARKET_UNINSTALL_REMAINING"));
    }
    if (response.value.restartRequired) {
      message.warning(t("TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"));
    }
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    changingDependencies.value--;
    pendingId.value = "";
  }
}

const busy = computed(() => Boolean(pendingId.value || targetPlugin.value));
watch(busy, (value) => emit("busy", value), { flush: "sync" });
watch(busy, (value) => (activeOperations.value += value ? 1 : -1), { flush: "sync" });
onScopeDispose(() => {
  disposed = true;
  if (busy.value) activeOperations.value--;
  if (busy.value) emit("busy", false);
});
</script>

<template>
  <VAlert
    v-if="incompatible"
    type="warning"
    variant="tonal"
    :text="t('TXT_CODE_PLUGIN_MARKET_INCOMPATIBLE')"
  />
  <div>
    <div class="d-flex flex-wrap ga-2">
      <VBtn
        v-if="canInstall"
        color="primary"
        prepend-icon="mdi-download"
        :loading="Boolean(pendingId)"
        :disabled="busy || disabled || applyingChanges || incompatible"
        @click="install()"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_INSTALL") }}
      </VBtn>
      <VBtn
        v-if="plugin.installedVersion && !installOnly && plugin.installedRemovable !== false"
        color="error"
        variant="text"
        :disabled="busy || disabled || applyingChanges"
        @click="requestUninstall()"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
      </VBtn>
      <VBtn
        v-if="plugin.installedVersion && !installOnly"
        color="primary"
        prepend-icon="mdi-update"
        :loading="Boolean(pendingId)"
        :disabled="!canUpdate || busy || disabled || applyingChanges || incompatible"
        @click="install()"
      >
        {{
          t(
            plugin.installedState === "failed"
              ? "TXT_CODE_PLUGIN_MARKET_REPAIR"
              : "TXT_CODE_40ca4f2"
          )
        }}
      </VBtn>
      <VBtn
        v-if="
          allowVersionChange &&
          plugin.targetDaemonId === undefined &&
          plugin.installedVersion &&
          version?.sides?.includes('daemon') &&
          plugin.installedUpdatable !== false
        "
        variant="text"
        :disabled="busy || disabled || applyingChanges || incompatible"
        @click="install(true)"
        >{{ t("TXT_CODE_PLUGIN_MARKET_DEPLOY_NODES") }}</VBtn
      >
    </div>
    <PluginMarketTargetsDialog
      v-model="targetsShown"
      v-model:selection="selection"
      :targets="targets"
      :mode="mode"
      :name="targetPlugin?.displayName"
      @confirm="confirmTargets"
    >
      <template v-if="mode === 'uninstall'">
        <VCheckbox
          v-model="removeConfig"
          :label="t('TXT_CODE_PLUGIN_MARKET_REMOVE_CONFIG')"
          hide-details
        />
        <p class="text-caption text-medium-emphasis mt-2">
          {{ t("TXT_CODE_PLUGIN_MARKET_KEEP_DATA") }}
        </p>
      </template>
    </PluginMarketTargetsDialog>
  </div>
</template>
