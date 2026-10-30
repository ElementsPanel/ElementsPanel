<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { ctx } from "@/plugin/context";
import { computed, onScopeDispose, ref, watch } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VSpacer
} from "vuetify/components";
import {
  installMarketPlugin,
  pluginMarketInstalled,
  pluginMarketNodes,
  pluginMarketPackage,
  uninstallMarketPlugin,
  type MarketNode,
  type MarketPlugin,
  type MarketPluginVersion
} from "../api";
import { isNewerVersion } from "../version";
import {
  activeOperations,
  applyingChanges,
  bulkMode,
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
      props.plugin.installedRemovable !== false &&
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

const uninstallTarget = ref<MarketPlugin | null>(null);
const removeConfig = ref(false);
const uninstallShown = computed({
  get: () => uninstallTarget.value !== null,
  set: (value: boolean) => {
    if (!value) uninstallTarget.value = null;
  }
});

// The node picker: which daemons a package's daemon half goes to. It is only
// asked for when there is a daemon half and a node to send it to, and every node
// is selected to begin with — the package's own author published both halves
// together, so both halves are the default.
const nodes = ref<MarketNode[]>([]);
const nodeSelection = ref<string[]>([]);
const nodeRequired = ref(false);
const nodeMode = ref<"install" | "uninstall">("install");
const nodeTarget = ref<MarketPlugin | null>(null);
const nodeShown = computed({
  get: () => nodeTarget.value !== null,
  set: (value: boolean) => {
    if (!value) nodeTarget.value = null;
  }
});

function nodeLabel(node: MarketNode) {
  const address = node.port ? `${node.ip}:${node.port}` : node.ip;
  const offline = node.available ? "" : ` · ${t("TXT_CODE_PLUGIN_MARKET_NODE_OFFLINE")}`;
  return `${node.remarks || node.ip}（${address}）${offline}`;
}

function nodeNames(daemonIds: readonly string[]) {
  return daemonIds.map((daemonId) => {
    const node = nodes.value.find((item) => item.daemonId === daemonId);
    return node ? node.remarks || node.ip : daemonId;
  });
}

async function fetchNodes() {
  const { execute } = pluginMarketNodes();
  return (await execute()).value ?? [];
}

async function packageSides(plugin: MarketPlugin) {
  const { execute } = pluginMarketPackage();
  const response = await execute({
    params: { pluginId: plugin.id, version: plugin.latestVersion?.version }
  });
  return response.value?.sides ?? [];
}

/**
 * Offers the node picker, or goes straight ahead when the question has no
 * answers: a package with no daemon half, or no daemon to send one to.
 */
function openNodePicker(
  plugin: MarketPlugin,
  mode: "install" | "uninstall",
  list: MarketNode[],
  required: boolean
) {
  nodes.value = list;
  nodeSelection.value = list.map((node) => node.daemonId);
  nodeMode.value = mode;
  nodeRequired.value = required;
  nodeTarget.value = plugin;
}

function confirmNodes() {
  const plugin = nodeTarget.value;
  if (!plugin || disposed || pendingId.value) return;
  const daemonIds = [...nodeSelection.value];
  if (nodeRequired.value && !daemonIds.length) return;
  pendingId.value = plugin.id;
  nodeTarget.value = null;
  if (nodeMode.value === "install") void runInstall(plugin, daemonIds);
  else void runUninstall(plugin, daemonIds);
}

/**
 * Installing: the panel half always lands here, and the daemon half goes to
 * whichever nodes the user picked. A package with no daemon half needs no
 * answer, and neither does one with no node to send it to.
 */
async function install(toNodes = false) {
  if (
    disposed ||
    props.disabled ||
    applyingChanges.value ||
    incompatible.value ||
    busy.value ||
    !props.version
  )
    return;
  if (!canInstall.value && !canUpdate.value && !toNodes) return;
  if (props.plugin.installedVersion && props.plugin.installedRemovable === false) return;
  const plugin = { ...props.plugin, latestVersion: props.version };
  pendingId.value = plugin.id;
  try {
    const sides = await packageSides(plugin);
    if (disposed) return;
    const needsNode = sides.includes("daemon") && !sides.includes("panel");
    const list = sides.includes("daemon") ? await fetchNodes() : [];
    if (disposed) return;
    if (list.length) return openNodePicker(plugin, "install", list, needsNode);
    if (needsNode) return message.error(t("TXT_CODE_2de92a5d"));
    await runInstall(plugin, []);
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

async function runInstall(plugin: MarketPlugin, daemonIds: string[]) {
  if (bulkMode.value) {
    queueMarketChange({
      plugin,
      kind: "install",
      version: plugin.latestVersion?.version,
      daemonIds
    });
    pendingId.value = "";
    emit("staged");
    return;
  }
  pendingId.value = plugin.id;
  try {
    const { execute } = installMarketPlugin();
    const response = await execute({
      // Nodes are processed independently; allow each selected npm operation its full window.
      timeout: (daemonIds.length + 1) * 11 * 60 * 1000,
      data: {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.latestVersion?.version,
        daemonIds
      }
    });
    if (disposed) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    // npm has already committed the operation; asset refresh failures are
    // reported by the frontend loader and must not turn it into an npm error.
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    emit("installed", plugin.id, response.value.installedVersion);
    notifyInstalled(plugin.id, response.value.installedVersion);
    const failed = response.value.failedNodes;
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
    pendingId.value = "";
  }
}

async function requestUninstall(plugin = uninstallTarget.value) {
  if (
    !plugin ||
    disposed ||
    pendingId.value ||
    nodeTarget.value ||
    (props.disabled && !uninstallTarget.value)
  )
    return;
  pendingId.value = plugin.id;
  uninstallTarget.value = null;
  try {
    // Uninstall must still work when the marketplace is offline or a release
    // has been removed. Read the persisted installation, including node retries.
    const { execute } = pluginMarketInstalled();
    const installed = (await execute()).value?.find((item) => item.pluginId === plugin.id);
    if (disposed) return;
    if (installed?.daemonIds.length) {
      const availableNodes = await fetchNodes();
      if (disposed) return;
      const list = installed.daemonIds.map(
        (daemonId) =>
          availableNodes.find((node) => node.daemonId === daemonId) ?? {
            daemonId,
            remarks: "",
            ip: daemonId,
            port: 0,
            available: false
          }
      );
      return openNodePicker(plugin, "uninstall", list, !installed.sides.includes("panel"));
    }
    await runUninstall(plugin, []);
  } catch (error) {
    if (!disposed) message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

async function runUninstall(plugin: MarketPlugin, daemonIds: string[]) {
  if (bulkMode.value) {
    queueMarketChange({ plugin, kind: "uninstall", daemonIds, removeConfig: removeConfig.value });
    pendingId.value = "";
    emit("staged");
    return;
  }
  pendingId.value = plugin.id;
  try {
    const { execute } = uninstallMarketPlugin();
    const response = await execute({
      timeout: (daemonIds.length + 1) * 11 * 60 * 1000,
      params: {
        pluginId: plugin.id,
        daemonIds: daemonIds.join(","),
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
    emit("installed", plugin.id, response.value.installedVersion);
    notifyInstalled(plugin.id, response.value.installedVersion);
    const failed = response.value.failedNodes;
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
    pendingId.value = "";
  }
}

const busy = computed(() => Boolean(pendingId.value || nodeTarget.value || uninstallTarget.value));
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
        @click="uninstallTarget = { ...plugin }"
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
          plugin.installedVersion &&
          version?.sides?.includes('daemon') &&
          plugin.installedRemovable !== false
        "
        variant="text"
        :disabled="busy || disabled || applyingChanges || incompatible"
        @click="install(true)"
        >{{ t("TXT_CODE_PLUGIN_MARKET_DEPLOY_NODES") }}</VBtn
      >
    </div>
    <VDialog v-model="uninstallShown" max-width="420">
      <VCard :title="t('TXT_CODE_PLUGIN_MARKET_UNINSTALL')">
        <VCardText>
          {{
            t("TXT_CODE_PLUGIN_MARKET_CONFIRM_UNINSTALL", {
              name: uninstallTarget?.displayName ?? ""
            })
          }}
          <VCheckbox
            v-model="removeConfig"
            :label="t('TXT_CODE_PLUGIN_MARKET_REMOVE_CONFIG')"
            hide-details
          />
          <p class="text-caption text-medium-emphasis mt-2">
            {{ t("TXT_CODE_PLUGIN_MARKET_KEEP_DATA") }}
          </p>
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="uninstallTarget = null">
            {{ t("TXT_CODE_PLUGIN_MARKET_CANCEL") }}
          </VBtn>
          <VBtn color="error" @click="requestUninstall()">
            {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="nodeShown" max-width="480">
      <VCard :title="t('TXT_CODE_PLUGIN_MARKET_SELECT_NODES')">
        <VCardText>
          <div class="mb-2">
            {{
              nodeMode === "install"
                ? t("TXT_CODE_PLUGIN_MARKET_SELECT_NODES_INSTALL")
                : t("TXT_CODE_PLUGIN_MARKET_SELECT_NODES_UNINSTALL")
            }}
          </div>
          <VCheckbox
            v-for="node in nodes"
            :key="node.daemonId"
            v-model="nodeSelection"
            :value="node.daemonId"
            :label="nodeLabel(node)"
            density="compact"
            hide-details
          />
        </VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="nodeTarget = null">
            {{ t("TXT_CODE_PLUGIN_MARKET_CANCEL") }}
          </VBtn>
          <VBtn
            color="primary"
            :disabled="nodeRequired && !nodeSelection.length"
            @click="confirmNodes"
          >
            {{ t("TXT_CODE_PLUGIN_MARKET_CONFIRM") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
