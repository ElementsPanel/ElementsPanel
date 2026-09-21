<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { getCurrentLang, t } from "@/lang/i18n";
import { markdownToHTML } from "@/tools/safe";
import { getValidatorErrorMsg } from "@/tools/validator";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  VAlert,
  VBtn,
  VCard,
  VCardText,
  VChip,
  VCol,
  VContainer,
  VProgressLinear,
  VRow,
  VSelect
} from "vuetify/components";
import { pluginMarketDetail, type MarketPluginDetail } from "../api";
import PluginMarketInstall from "./PluginMarketInstall.vue";

const props = defineProps<{ pluginId: string; version?: string; embedded?: boolean }>();
const emit = defineEmits<{
  back: [];
  "select-version": [version: string];
  installed: [pluginId: string, version: string | undefined];
}>();
const plugin = ref<MarketPluginDetail>();
const loading = ref(false);
const busy = ref(false);
const error = ref("");
let requestId = 0;

const description = computed(() => markdownToHTML(plugin.value?.description || ""));
const changelog = computed(() => markdownToHTML(plugin.value?.selectedVersion.changelog || ""));
const versionOptions = computed(() =>
  (plugin.value?.versions ?? []).map((version) => ({
    title: t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: version.version }),
    value: version.version
  }))
);

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString(getCurrentLang().replace("_", "-"));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function refresh() {
  const currentRequest = ++requestId;
  loading.value = true;
  error.value = "";
  plugin.value = undefined;
  busy.value = false;
  try {
    const { execute } = pluginMarketDetail();
    const response = await execute({
      params: {
        pluginId: props.pluginId,
        version: props.version
      }
    });
    if (currentRequest !== requestId) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND"));
    plugin.value = response.value;
  } catch (err) {
    if (currentRequest === requestId) error.value = getValidatorErrorMsg(err);
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

function selectVersion(version: string) {
  if (busy.value || !version) return;
  emit("select-version", version);
}

function updateInstalled(pluginId: string, version: string | undefined) {
  if (plugin.value?.id === pluginId) plugin.value.installedVersion = version;
  emit("installed", pluginId, version);
}

watch(() => [props.pluginId, props.version], refresh, { immediate: true });
onBeforeUnmount(() => requestId++);
</script>

<template>
  <main class="plugin-detail" :class="{ 'plugin-detail--embedded': embedded }">
    <VContainer fluid class="plugin-detail-container">
      <PageToolbar
        :title="t('TXT_CODE_PLUGIN_MARKET_DETAIL')"
        icon="mdi-puzzle-outline"
        class="mb-14"
      >
        <template #actions>
          <VBtn variant="text" prepend-icon="mdi-arrow-left" :disabled="busy" @click="emit('back')">
            {{ t("TXT_CODE_PLUGIN_MARKET_BACK") }}
          </VBtn>
          <VBtn variant="text" :loading="loading" :disabled="busy" @click="refresh">
            {{ t("TXT_CODE_PLUGIN_MARKET_REFRESH") }}
          </VBtn>
        </template>
      </PageToolbar>

      <VProgressLinear v-if="loading" indeterminate class="mb-4" />
      <VAlert v-else-if="error" type="error" :text="error" />

      <template v-else-if="plugin">
        <VCard class="mb-8 pa-4" elevation="0">
          <VCardText>
            <h1 class="text-h5 mb-2">{{ plugin.displayName }}</h1>
            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t("TXT_CODE_PLUGIN_MARKET_BY", { name: plugin.author?.displayName ?? "" }) }}
              <span class="ml-2">{{ plugin.name }}</span>
            </div>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <VChip v-if="plugin.category" size="small" variant="tonal">{{
                plugin.category
              }}</VChip>
              <VChip v-if="plugin.latestVersion" size="small" variant="tonal">
                {{
                  t("TXT_CODE_PLUGIN_MARKET_LATEST_VERSION", {
                    version: plugin.latestVersion.version
                  })
                }}
              </VChip>
              <VChip v-if="plugin.installedVersion" size="small" color="success" variant="tonal">
                {{
                  t("TXT_CODE_PLUGIN_MARKET_INSTALLED_VERSION", {
                    version: plugin.installedVersion
                  })
                }}
              </VChip>
            </div>
            <p class="text-body-1 mb-0">
              {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
            </p>
          </VCardText>
        </VCard>

        <VRow :gap="32" class="plugin-detail-grid">
          <VCol cols="12" md="8">
            <VCard :title="t('TXT_CODE_PLUGIN_MARKET_DESCRIPTION')" elevation="0" class="pa-4">
              <VCardText>
                <div
                  v-if="plugin.description"
                  class="global-markdown-html plugin-detail-markdown"
                  v-html="description"
                />
                <p v-else class="text-medium-emphasis mb-0">
                  {{ t("TXT_CODE_PLUGIN_MARKET_NO_DESCRIPTION") }}
                </p>
              </VCardText>
            </VCard>
          </VCol>
          <VCol cols="12" md="4">
            <VCard :title="t('TXT_CODE_PLUGIN_MARKET_RELEASE')" elevation="0" class="pa-4">
              <VCardText>
                <VSelect
                  :model-value="plugin.selectedVersion.version"
                  :items="versionOptions"
                  :label="t('TXT_CODE_PLUGIN_MARKET_SELECT_VERSION')"
                  :disabled="busy"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  class="mb-4"
                  @update:model-value="selectVersion"
                />
                <div class="text-body-2 text-medium-emphasis mb-4">
                  <div>
                    {{
                      t("TXT_CODE_PLUGIN_MARKET_PUBLISHED_AT", {
                        date: formatDate(plugin.selectedVersion.submittedAt)
                      })
                    }}
                  </div>
                  <div>
                    {{
                      t("TXT_CODE_PLUGIN_MARKET_PACKAGE_SIZE", {
                        size: formatSize(plugin.selectedVersion.sizeBytes),
                        count: plugin.selectedVersion.fileCount
                      })
                    }}
                  </div>
                </div>
                <PluginMarketInstall
                  :key="plugin.id"
                  :plugin="plugin"
                  :version="plugin.selectedVersion"
                  @installed="updateInstalled"
                  @busy="busy = $event"
                />
              </VCardText>
            </VCard>
            <VCard :title="t('TXT_CODE_PLUGIN_MARKET_CHANGELOG')" elevation="0" class="mt-8 pa-4">
              <VCardText>
                <div
                  v-if="plugin.selectedVersion.changelog"
                  class="global-markdown-html plugin-detail-markdown"
                  v-html="changelog"
                />
                <p v-else class="text-medium-emphasis mb-0">
                  {{ t("TXT_CODE_PLUGIN_MARKET_NO_CHANGELOG") }}
                </p>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
      </template>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.plugin-detail {
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
}

.plugin-detail-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

.plugin-detail-markdown {
  overflow-x: auto;

  :deep(img) {
    max-width: 100%;
    height: auto;
  }

  :deep(pre) {
    overflow-x: auto;
  }
}

@media (max-width: 992px) {
  .plugin-detail-container {
    padding: 16px 12px 28px;
  }
}

.plugin-detail--embedded {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  container-type: inline-size;

  .plugin-detail-container {
    max-width: none;
    padding: 20px;
  }

  .plugin-detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  }

  :deep(.page-toolbar-title) {
    flex: 1 1 180px;
    font-size: 18px;
  }

  :deep(.page-toolbar-actions) {
    flex: 1 1 260px;
    justify-content: flex-end;
  }
}

@container (max-width: 800px) {
  .plugin-detail--embedded .plugin-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
