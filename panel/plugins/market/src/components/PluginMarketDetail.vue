<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { getCurrentLang, t } from "@/lang/i18n";
import { markdownToHTML } from "@/tools/safe";
import { getValidatorErrorMsg } from "@/tools/validator";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  VAlert,
  VBtn,
  VChip,
  VContainer,
  VIcon,
  VProgressLinear,
  VTab,
  VTabs
} from "vuetify/components";
import { pluginMarketDetail, type MarketPluginDetail } from "../api";
import PluginMarketInstall from "./PluginMarketInstall.vue";
import PluginMarketSideBadge from "./PluginMarketSideBadge.vue";

const props = defineProps<{ pluginId: string; embedded?: boolean }>();
const emit = defineEmits<{
  back: [];
  installed: [pluginId: string, version: string | undefined];
}>();
const plugin = ref<MarketPluginDetail>();
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const activeTab = ref<"overview" | "versions" | "updates">("overview");
let requestId = 0;
// Every release row carries its own install button, so more than one install can be
// in flight; count them instead of letting the last event win.
let running = 0;

const description = computed(() => markdownToHTML(plugin.value?.description || ""));
// The updates tab lists every release's notes, so each one is rendered once here
// rather than re-parsed on every render.
const changelogs = computed(() =>
  (plugin.value?.versions ?? []).map((version) => ({
    version,
    html: markdownToHTML(version.changelog || "")
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

/**
 * Reloading keeps the plugin on screen: the name, the header action and the tabs
 * all show it, so emptying the view would flash the whole page. Only a different
 * plugin clears it.
 */
async function refresh() {
  const currentRequest = ++requestId;
  loading.value = true;
  error.value = "";
  if (plugin.value?.id !== props.pluginId) plugin.value = undefined;
  // A refresh starts from a clean slate: an install still running belongs to the
  // state this page is leaving behind.
  running = 0;
  busy.value = false;
  try {
    const { execute } = pluginMarketDetail();
    const response = await execute({ params: { pluginId: props.pluginId } });
    if (currentRequest !== requestId) return;
    if (!response.value) throw new Error(t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND"));
    plugin.value = response.value;
  } catch (err) {
    if (currentRequest === requestId) error.value = getValidatorErrorMsg(err);
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

function trackBusy(value: boolean) {
  running = Math.max(0, running + (value ? 1 : -1));
  busy.value = running > 0;
}

function updateInstalled(pluginId: string, version: string | undefined) {
  if (plugin.value?.id === pluginId) plugin.value.installedVersion = version;
  emit("installed", pluginId, version);
}

watch(() => props.pluginId, refresh, { immediate: true });
// A marketplace entry always opens on its description; only the user's next
// click moves the tab.
watch(
  () => props.pluginId,
  () => {
    activeTab.value = "overview";
  }
);
onBeforeUnmount(() => requestId++);
</script>

<template>
  <main class="plugin-detail" :class="{ 'plugin-detail--embedded': embedded }">
    <VContainer fluid class="plugin-detail-container">
      <PageToolbar :title="t('TXT_CODE_PLUGIN_MARKET_DETAIL')" icon="mdi-puzzle-outline">
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
      <VAlert v-if="error" type="error" :text="error" class="mb-4" />

      <template v-if="plugin">
        <header class="plugin-detail-header">
          <div class="plugin-detail-heading">
            <span class="plugin-detail-icon">
              <VIcon icon="mdi-puzzle-outline" size="34" />
            </span>
            <div class="plugin-detail-heading-text">
              <h1 class="plugin-detail-title">{{ plugin.displayName }}</h1>
              <p class="plugin-detail-summary">
                {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
              </p>
              <div class="plugin-detail-meta">
                <span class="plugin-detail-author">
                  <VIcon icon="mdi-account-circle-outline" size="16" />
                  {{ t("TXT_CODE_PLUGIN_MARKET_BY", { name: plugin.author?.displayName ?? "" }) }}
                </span>
                <span v-if="plugin.category" class="plugin-detail-category">
                  {{ plugin.category }}
                </span>
                <PluginMarketSideBadge :sides="plugin.selectedVersion.sides ?? plugin.sides" />
                <VChip v-if="plugin.installedVersion" size="small" color="success" variant="tonal">
                  {{
                    t("TXT_CODE_PLUGIN_MARKET_INSTALLED_VERSION", {
                      version: plugin.installedVersion
                    })
                  }}
                </VChip>
              </div>
            </div>
          </div>

          <div class="plugin-detail-action">
            <PluginMarketInstall
              :key="plugin.id"
              :plugin="plugin"
              :version="plugin.selectedVersion"
              @installed="updateInstalled"
              @busy="trackBusy"
            />
          </div>
        </header>

        <div class="plugin-detail-tabs">
          <VTabs v-model="activeTab" color="primary">
            <VTab value="overview">{{ t("TXT_CODE_PLUGIN_MARKET_OVERVIEW") }}</VTab>
            <VTab value="versions">{{ t("TXT_CODE_PLUGIN_MARKET_VERSIONS") }}</VTab>
            <VTab value="updates">{{ t("TXT_CODE_PLUGIN_MARKET_UPDATES") }}</VTab>
          </VTabs>
        </div>

        <div class="plugin-detail-body">
          <section class="plugin-detail-content">
            <template v-if="activeTab === 'overview'">
              <div
                v-if="plugin.description"
                class="global-markdown-html plugin-detail-markdown"
                v-html="description"
              />
              <p v-else class="plugin-detail-empty">
                {{ t("TXT_CODE_PLUGIN_MARKET_NO_DESCRIPTION") }}
              </p>
            </template>

            <!-- 版本页签只列出历史，并给每个版本自己的安装入口；点一行不会切换页面 -->
            <template v-else-if="activeTab === 'versions'">
              <ul class="plugin-detail-versions">
                <li
                  v-for="item in plugin.versions"
                  :key="item.version"
                  class="plugin-detail-version"
                >
                  <div class="plugin-detail-version-text">
                    <span class="plugin-detail-version-name">
                      {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: item.version }) }}
                    </span>
                    <span class="plugin-detail-version-meta">
                      {{
                        t("TXT_CODE_PLUGIN_MARKET_PUBLISHED_AT", {
                          date: formatDate(item.submittedAt)
                        })
                      }}
                      ·
                      {{
                        t("TXT_CODE_PLUGIN_MARKET_PACKAGE_SIZE", {
                          size: formatSize(item.sizeBytes),
                          count: item.fileCount
                        })
                      }}
                    </span>
                  </div>
                  <PluginMarketInstall
                    :plugin="plugin"
                    :version="item"
                    install-only
                    @installed="updateInstalled"
                    @busy="trackBusy"
                  />
                </li>
              </ul>
            </template>

            <template v-else>
              <article
                v-for="entry in changelogs"
                :key="entry.version.version"
                class="plugin-detail-update"
              >
                <h2 class="plugin-detail-update-head">
                  <span class="plugin-detail-update-version">
                    {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: entry.version.version }) }}
                  </span>
                  <span class="plugin-detail-update-date">
                    {{ formatDate(entry.version.submittedAt) }}
                  </span>
                </h2>
                <div
                  v-if="entry.html"
                  class="global-markdown-html plugin-detail-markdown"
                  v-html="entry.html"
                />
                <p v-else class="plugin-detail-empty">
                  {{ t("TXT_CODE_PLUGIN_MARKET_NO_CHANGELOG") }}
                </p>
              </article>
            </template>
          </section>

          <aside class="plugin-detail-sidebar">
            <section v-if="plugin.category" class="plugin-detail-sidebar-section">
              <h2 class="plugin-detail-sidebar-title">
                {{ t("TXT_CODE_PLUGIN_MARKET_TAGS") }}
              </h2>
              <span class="plugin-detail-tag">{{ plugin.category }}</span>
            </section>

            <section class="plugin-detail-sidebar-section">
              <h2 class="plugin-detail-sidebar-title">
                {{ t("TXT_CODE_PLUGIN_MARKET_ADDITIONAL_INFO") }}
              </h2>
              <dl class="plugin-detail-info">
                <div class="plugin-detail-info-row">
                  <dt>{{ t("TXT_CODE_PLUGIN_MARKET_PLUGIN_ID") }}</dt>
                  <dd>{{ plugin.name }}</dd>
                </div>
                <div class="plugin-detail-info-row">
                  <dt>{{ t("TXT_CODE_PLUGIN_MARKET_VENDOR") }}</dt>
                  <dd>{{ plugin.author?.displayName ?? "" }}</dd>
                </div>
                <div v-if="plugin.latestVersion" class="plugin-detail-info-row">
                  <dt>{{ t("TXT_CODE_PLUGIN_MARKET_LATEST") }}</dt>
                  <dd>
                    {{
                      t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.latestVersion.version })
                    }}
                  </dd>
                </div>
                <div v-if="plugin.installedVersion" class="plugin-detail-info-row">
                  <dt>{{ t("TXT_CODE_PLUGIN_MARKET_INSTALLED") }}</dt>
                  <dd>
                    {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.installedVersion }) }}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </template>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.plugin-detail {
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;

  // The page header keeps room before the store-style header block below it.
  :deep(.page-toolbar) {
    margin-bottom: 56px;
  }
}

.plugin-detail-container {
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
}

// A marketplace entry reads like its store page: a logo, the name, the author,
// and the install action held out to the right of the title.
.plugin-detail-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
}

.plugin-detail-heading {
  display: flex;
  gap: 20px;
  flex: 1 1 420px;
  min-width: 0;
}

.plugin-detail-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 14px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.plugin-detail-heading-text {
  min-width: 0;
}

.plugin-detail-title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
}

.plugin-detail-summary {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.plugin-detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.plugin-detail-author {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.plugin-detail-category {
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.plugin-detail-action {
  flex: 0 1 320px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  text-align: right;
}

// `VTabs` draws its own slider; this rule only extends it across the page, as
// a background rather than a border because Desktop mode strips every border
// inside a window.
.plugin-detail-tabs {
  position: relative;
  margin-bottom: 24px;

  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: rgba(var(--v-theme-on-surface), 0.12);
  }
}

.plugin-detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 40px;
  align-items: start;
}

.plugin-detail-content,
.plugin-detail-sidebar {
  min-width: 0;
}

.plugin-detail-sidebar-section + .plugin-detail-sidebar-section {
  margin-top: 28px;
}

.plugin-detail-sidebar-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.plugin-detail-tag {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.plugin-detail-info {
  margin: 0;
}

.plugin-detail-info-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;

  dt {
    flex: 0 0 84px;
    color: rgba(var(--v-theme-on-surface), 0.6);
  }

  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
}

.plugin-detail-versions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

// 每一行只做两件事：说清是哪个版本，给出这个版本自己的安装入口。
.plugin-detail-version {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 8px;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
}

.plugin-detail-version-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.plugin-detail-version-name {
  font-size: 15px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.plugin-detail-version-meta {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.plugin-detail-update + .plugin-detail-update {
  margin-top: 28px;
  padding-top: 28px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.plugin-detail-update-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 12px;
}

.plugin-detail-update-version {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
}

.plugin-detail-update-date {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.plugin-detail-empty {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
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

// Normal mode is laid out against the viewport; Desktop mode answers to its
// window instead, so it is left out here and handled by the container query.
@media (max-width: 992px) {
  .plugin-detail:not(.plugin-detail--embedded) {
    .plugin-detail-container {
      padding: 16px 12px 28px;
    }

    .plugin-detail-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }

    .plugin-detail-title {
      font-size: 22px;
    }

    .plugin-detail-action {
      align-items: flex-start;
      text-align: left;
    }
  }
}

// Desktop mode hands the page a window that is narrower than the screen, so the
// layout follows the window it was given rather than the viewport.
.plugin-detail--embedded {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  container-type: inline-size;

  .plugin-detail-container {
    max-width: none;
    padding: 20px;
  }

  :deep(.page-toolbar) {
    margin-bottom: 24px;
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

@container (max-width: 820px) {
  .plugin-detail--embedded {
    .plugin-detail-body {
      grid-template-columns: minmax(0, 1fr);
      gap: 28px;
    }

    .plugin-detail-title {
      font-size: 22px;
    }

    .plugin-detail-action {
      align-items: flex-start;
      text-align: left;
    }
  }
}
</style>
