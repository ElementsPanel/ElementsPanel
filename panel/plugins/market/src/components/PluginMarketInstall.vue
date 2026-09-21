<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, ref, watch } from "vue";
import {
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
  pluginMarketNodes,
  pluginMarketPackage,
  uninstallMarketPlugin,
  type MarketNode,
  type MarketPlugin,
  type MarketPluginVersion
} from "../api";

const props = defineProps<{ plugin: MarketPlugin; version?: MarketPluginVersion }>();
const emit = defineEmits<{
  installed: [pluginId: string, version: string | undefined];
  busy: [value: boolean];
}>();
const pendingId = ref("");
// Whether the answer to the last install or uninstall asked for a restart. A
// development checkout reloads its plugins instead, so the note under the list
// is only kept while a restart is what it actually takes.
const restartHint = ref(true);

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

/**
 * Whether a package carries a daemon half. The market's file list answers this
 * for an install and for an uninstall alike: what was installed here says
 * nothing about the nodes, because the daemon half never lands on the panel.
 */
async function hasDaemonHalf(plugin: MarketPlugin, version = plugin.latestVersion?.version) {
  const { execute } = pluginMarketPackage();
  const response = await execute({
    params: { pluginId: plugin.id, version }
  });
  return (response.value?.sides ?? []).includes("daemon");
}

/**
 * Offers the node picker, or goes straight ahead when the question has no
 * answers: a package with no daemon half, or no daemon to send one to.
 */
function openNodePicker(plugin: MarketPlugin, mode: "install" | "uninstall", list: MarketNode[]) {
  nodes.value = list;
  nodeSelection.value = list.map((node) => node.daemonId);
  nodeMode.value = mode;
  nodeTarget.value = plugin;
}

function confirmNodes() {
  const plugin = nodeTarget.value;
  const daemonIds = [...nodeSelection.value];
  nodeTarget.value = null;
  if (!plugin) return;
  if (nodeMode.value === "install") void runInstall(plugin, daemonIds);
  else void runUninstall(plugin, daemonIds);
}

/**
 * Installing: the panel half always lands here, and the daemon half goes to
 * whichever nodes the user picked. A package with no daemon half needs no
 * answer, and neither does one with no node to send it to.
 */
async function install() {
  if (busy.value || !props.version) return;
  const plugin = { ...props.plugin, latestVersion: props.version };
  pendingId.value = plugin.id;
  try {
    const list = (await hasDaemonHalf(plugin)) ? await fetchNodes() : [];
    if (list.length) return openNodePicker(plugin, "install", list);
    await runInstall(plugin, []);
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
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
    restartHint.value = response.value?.restartRequired ?? true;
    emit("installed", plugin.id, plugin.latestVersion?.version);
    const failed = response.value?.failedNodes ?? [];
    if (failed.length) {
      message.error(
        t("TXT_CODE_PLUGIN_MARKET_NODE_FAILED", { nodes: nodeNames(failed).join("、") })
      );
    } else {
      message.success(t("TXT_CODE_PLUGIN_MARKET_INSTALLED"));
    }
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

async function requestUninstall(plugin: MarketPlugin) {
  uninstallTarget.value = null;
  pendingId.value = plugin.id;
  try {
    const list = (await hasDaemonHalf(plugin, plugin.installedVersion)) ? await fetchNodes() : [];
    if (list.length) return openNodePicker(plugin, "uninstall", list);
    await runUninstall(plugin, []);
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
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
    restartHint.value = response.value?.restartRequired ?? true;
    emit("installed", plugin.id, undefined);
    message.success(t("TXT_CODE_PLUGIN_MARKET_UNINSTALLED"));
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

const busy = computed(() => Boolean(pendingId.value || nodeTarget.value || uninstallTarget.value));
watch(busy, (value) => emit("busy", value));
</script>

<template>
  <div>
    <div class="d-flex flex-wrap ga-2">
      <VBtn
        v-if="version"
        color="primary"
        prepend-icon="mdi-download"
        :loading="Boolean(pendingId)"
        :disabled="busy"
        @click="install"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_INSTALL_VERSION", { version: version.version }) }}
      </VBtn>
      <VBtn
        v-if="plugin.installedVersion"
        color="error"
        variant="text"
        :disabled="busy"
        @click="uninstallTarget = { ...plugin }"
      >
        {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
      </VBtn>
    </div>
    <p v-if="restartHint" class="text-caption text-medium-emphasis mt-4 mb-0">
      {{ t("TXT_CODE_PLUGIN_MARKET_RESTART_HINT") }}
    </p>
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
          <VBtn color="error" @click="requestUninstall(uninstallTarget!)">
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
          <VBtn color="primary" @click="confirmNodes">
            {{ t("TXT_CODE_PLUGIN_MARKET_CONFIRM") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
