<script setup lang="ts">
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
  VChip,
  VCol,
  VDialog,
  VProgressLinear,
  VRow,
  VSpacer,
  VTextField
} from "vuetify/components";
import {
  installMarketPlugin,
  pluginMarketList,
  uninstallMarketPlugin,
  type MarketPlugin
} from "../api";

// The plugin market lists plugins published to EPanel_Market. Installing one
// copies its compiled package into the panel's and the daemon's plugin
// directories, so it loads like any other plugin — after a restart, which is what
// the confirmation tells the user.

const loading = ref(false);
const plugins = ref<MarketPlugin[]>([]);
const keyword = ref("");
const pendingId = ref("");

const uninstallTarget = ref<MarketPlugin | null>(null);
const uninstallShown = computed({
  get: () => uninstallTarget.value !== null,
  set: (value: boolean) => {
    if (!value) uninstallTarget.value = null;
  }
});

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

async function install(plugin: MarketPlugin) {
  pendingId.value = plugin.id;
  try {
    const { execute } = installMarketPlugin();
    await execute({
      data: {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.latestVersion?.version
      }
    });
    plugin.installedVersion = plugin.latestVersion?.version;
    message.success(t("TXT_CODE_PLUGIN_MARKET_INSTALLED"));
  } catch (error) {
    message.error(getValidatorErrorMsg(error));
  } finally {
    pendingId.value = "";
  }
}

async function confirmUninstall() {
  const plugin = uninstallTarget.value;
  if (!plugin) return;
  uninstallTarget.value = null;
  pendingId.value = plugin.id;
  try {
    const { execute } = uninstallMarketPlugin();
    await execute({ params: { pluginId: plugin.id } });
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
  <div class="plugin-market">
    <VRow align="center" class="mb-4">
      <VCol cols="12" md="6">
        <VTextField
          v-model="keyword"
          :label="t('TXT_CODE_PLUGIN_MARKET_SEARCH')"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          density="comfortable"
          variant="solo-filled"
        />
      </VCol>
      <VCol cols="12" md="6" class="d-flex align-center">
        <VSpacer />
        <VBtn variant="text" :loading="loading" @click="refresh">
          {{ t("TXT_CODE_PLUGIN_MARKET_REFRESH") }}
        </VBtn>
      </VCol>
    </VRow>

    <div class="text-body-2 text-medium-emphasis mb-4">
      {{ t("TXT_CODE_PLUGIN_MARKET_DESC") }}
    </div>

    <VProgressLinear v-if="loading && !plugins.length" indeterminate class="mb-4" />

    <VAlert
      v-if="!loading && !plugins.length"
      type="info"
      :title="t('TXT_CODE_PLUGIN_MARKET_EMPTY')"
      :text="t('TXT_CODE_PLUGIN_MARKET_UNREACHABLE')"
    />

    <VRow v-else>
      <VCol v-for="plugin in visiblePlugins" :key="plugin.id" cols="12" md="6" lg="4">
        <VCard class="h-100">
          <VCardText>
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

          <VCardActions>
            <VChip
              v-if="plugin.latestVersion"
              size="small"
              variant="tonal"
            >
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

    <div class="text-caption text-medium-emphasis mt-4">
      {{ t("TXT_CODE_PLUGIN_MARKET_RESTART_HINT") }}
    </div>

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
          <VBtn color="error" @click="confirmUninstall">
            {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
