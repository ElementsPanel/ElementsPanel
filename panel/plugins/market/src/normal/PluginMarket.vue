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
  uninstallMarketPlugin,
  type MarketPlugin
} from "../api";

// The plugin market lists plugins published to EPanel_Market. Installing one
// copies its compiled package into the panel's and the daemon's plugin
// directories, so it loads like any other plugin — after a restart, which is what
// the note under the list tells the user.

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

      <div class="plugin-market-description">
        <div class="plugin-market-description-text">
          <span>{{ t("TXT_CODE_PLUGIN_MARKET_DESC") }}</span>
        </div>
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

      <div class="plugin-market-hint">
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
          <VBtn color="error" @click="confirmUninstall">
            {{ t("TXT_CODE_PLUGIN_MARKET_UNINSTALL") }}
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

.plugin-market-description {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  color: var(--color-gray-7);
  margin-bottom: 16px;
}

.plugin-market-hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--color-gray-7);
}

@media (max-width: 992px) {
  .plugin-market-container {
    padding: 16px 12px 28px;
  }
}
</style>
