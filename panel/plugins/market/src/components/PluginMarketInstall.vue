<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
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

const props = defineProps<{
  plugin: MarketPlugin;
  version?: MarketPluginVersion;
  /**
   * Only offer the install action. A release row installs that one release and has
   * nothing to say about uninstalling, which belongs to the plugin as a whole.
   */
  installOnly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  installed: [pluginId: string, version: string | undefined];
  busy: [value: boolean];
}>();
const pendingId = ref("");
const incompatible = computed(() =>
  Object.values(props.version?.compatibility || {}).some(
    (contract) =>
      contract && (contract.api !== 1 || (contract.sdk !== undefined && contract.sdk !== 1))
  )
);
let disposed = false;

const uninstallTarget = ref<MarketPlugin | null>(null);
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
async function install() {
  if (disposed || props.disabled || incompatible.value || busy.value || !props.version) return;
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
  pendingId.value = plugin.id;
  try {
    const { execute } = installMarketPlugin();
    const response = await execute({
      data: {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.latestVersion?.version,
        daemonIds
      }
    });
    if (disposed) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    emit("installed", plugin.id, response.value.installedVersion);
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
  pendingId.value = plugin.id;
  try {
    const { execute } = uninstallMarketPlugin();
    const response = await execute({
      params: { pluginId: plugin.id, daemonIds: daemonIds.join(",") }
    });
    if (disposed) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE"));
    emit("installed", plugin.id, response.value.installedVersion);
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
onScopeDispose(() => {
  disposed = true;
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
        v-if="version"
        color="primary"
        prepend-icon="mdi-download"
        :loading="Boolean(pendingId)"
        :disabled="busy || disabled || incompatible"
        @click="install"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_INSTALL") }}
      </VBtn>
      <VBtn
        v-if="plugin.installedVersion && !installOnly"
        color="error"
        variant="text"
        :disabled="busy || disabled"
        @click="uninstallTarget = { ...plugin }"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
      </VBtn>
    </div>
    <VDialog v-model="uninstallShown" max-width="420">
      <VCard :title="t('TXT_CODE_PLUGIN_MARKET_UNINSTALL')">
        <VCardText>
          {{
            t("TXT_CODE_PLUGIN_MARKET_CONFIRM_UNINSTALL", {
              name: uninstallTarget?.displayName ?? ""
            })
          }}
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
