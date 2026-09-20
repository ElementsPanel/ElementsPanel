<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VChip,
  VCol,
  VContainer,
  VDialog,
  VProgressLinear,
  VRow,
  VSpacer,
  VTextField
} from "vuetify/components";
import {
  installMarketPlugin,
  pluginMarketList,
  pluginMarketNodes,
  pluginMarketPackage,
  uninstallMarketPlugin,
  type MarketNode,
  type MarketPlugin
} from "../api";

// The plugin market lists plugins published to EPanel_Market. Installing one
// copies its compiled package into the panel's plugin directory, and — when the
// package has a daemon half — asks which nodes to send that half to, because a
// daemon plugin has to sit on the machine that loads it. Half of the package is
// written here; the other half travels over the panel's existing daemon
// connections.

const loading = ref(false);
const plugins = ref<MarketPlugin[]>([]);
const keyword = ref("");
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
async function hasDaemonHalf(plugin: MarketPlugin) {
  const { execute } = pluginMarketPackage();
  const response = await execute({
    params: { pluginId: plugin.id, version: plugin.latestVersion?.version }
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

const visiblePlugins = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return plugins.value;
  return plugins.value.filter((plugin) =>
    [plugin.displayName, plugin.name, plugin.summary].some((field) =>
      String(field ?? "").toLowerCase().includes(q)
    )
  );
});

async function refresh() {
  loading.value = true;
  try {
    const { execute } = pluginMarketList();
    plugins.value = (await execute()).value ?? [];
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
  } finally {
    loading.value = false;
  }
}

/**
 * Installing: the panel half always lands here, and the daemon half goes to
 * whichever nodes the user picked. A package with no daemon half needs no
 * answer, and neither does one with no node to send it to.
 */
async function install(plugin: MarketPlugin) {
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
    plugin.installedVersion = plugin.latestVersion?.version;
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
    const list = (await hasDaemonHalf(plugin)) ? await fetchNodes() : [];
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
    plugin.installedVersion = undefined;
    message.success(t("TXT_CODE_PLUGIN_MARKET_UNINSTALLED"));
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

onMounted(refresh);
</script>

<template>
  <main class="plugin-market">
    <VContainer fluid class="plugin-market-container">
      <PageToolbar :title="t('TXT_CODE_PLUGIN_MARKET')" icon="mdi-puzzle-outline">
        <template #search>
          <VTextField
            v-model="keyword"
            :label="t('TXT_CODE_PLUGIN_MARKET_SEARCH')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            density="comfortable"
            variant="solo-filled"
          />
        </template>
        <template #actions>
          <VBtn variant="text" :loading="loading" @click="refresh">
            {{ t("TXT_CODE_PLUGIN_MARKET_REFRESH") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VProgressLinear v-if="loading && !plugins.length" indeterminate class="mb-4" />

      <VAlert
        v-if="!loading && !plugins.length"
        type="info"
        :title="t('TXT_CODE_PLUGIN_MARKET_EMPTY')"
        :text="t('TXT_CODE_PLUGIN_MARKET_UNREACHABLE')"
      />

      <VRow v-else>
        <VCol v-for="plugin in visiblePlugins" :key="plugin.id" cols="12" md="6" lg="4">
          <VCard class="plugin-market-card h-100" elevation="0">
            <VCardText class="plugin-market-card-content">
              <div class="text-h6">
                {{ plugin.displayName }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t("TXT_CODE_PLUGIN_MARKET_BY", { name: plugin.author?.displayName ?? "" }) }}
                <span v-if="plugin.category">· {{ plugin.category }}</span>
              </div>
              <div class="text-body-2 mt-2">
                {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
              </div>
            </VCardText>

            <VCardActions class="plugin-market-card-actions">
              <VChip v-if="plugin.latestVersion" size="small" variant="tonal">
                {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.latestVersion.version }) }}
              </VChip>
              <VChip
                v-if="plugin.installedVersion"
                size="small"
                color="success"
                variant="tonal"
              >
                {{ t("TXT_CODE_PLUGIN_MARKET_INSTALLED") }}
              </VChip>
              <VSpacer />
              <VBtn
                v-if="plugin.installedVersion"
                size="small"
                variant="text"
                color="error"
                :loading="pendingId === plugin.id"
                @click="uninstallTarget = plugin"
              >
                {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
              </VBtn>
              <VBtn
                v-else
                size="small"
                color="primary"
                variant="tonal"
                :loading="pendingId === plugin.id"
                @click="install(plugin)"
              >
                {{ t("TXT_CODE_PLUGIN_MARKET_INSTALL") }}
              </VBtn>
            </VCardActions>
          </VCard>
        </VCol>
      </VRow>

      <div v-if="restartHint" class="plugin-market-hint">
        {{ t("TXT_CODE_PLUGIN_MARKET_RESTART_HINT") }}
      </div>
    </VContainer>

    <VDialog v-model="uninstallShown" max-width="420">
      <VCard :title="t('TXT_CODE_PLUGIN_MARKET_UNINSTALL')">
        <VCardText>
          {{ t("TXT_CODE_PLUGIN_MARKET_CONFIRM_UNINSTALL", { name: uninstallTarget?.displayName ?? "" }) }}
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
  </main>
</template>

<style lang="scss" scoped>
// Same shell as the application market page: identical container width, gutters
// and mobile breakpoint, so the two markets line up.
.plugin-market {
  width: 100%;
  min-height: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden;
}

.plugin-market-container {
  width: 100%;
  min-width: 0;
  max-width: var(--app-max-width);
  margin: 0 auto;
  box-sizing: border-box;
  padding: 20px 24px 32px;
}

.plugin-market-hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--color-gray-7);
}

// A card is a column: the description takes the space that is left, so the
// version chips and the install button stay on the last line of every card
// instead of following the text up and down.
.plugin-market-card {
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.plugin-market-card-content {
  flex: 1 0 auto;
}

.plugin-market-card-actions {
  align-items: center;
  padding-top: 8px;
}

@media (max-width: 992px) {
  .plugin-market-container {
    padding: 16px 12px 28px;
  }
}
</style>
