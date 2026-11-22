<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { defineComponent, proxyRefs, ref } from "vue";
import {
  VAvatar,
  VBtn,
  VCard,
  VChip,
  VDivider,
  VIcon,
  VImg,
  VList,
  VListItem,
  VMenu,
  VProgressCircular,
  VTextField
} from "vuetify/components";
import PluginMarketChanges from "../components/PluginMarketChanges.vue";
import PluginMarketInstall from "../components/PluginMarketInstall.vue";
import PluginMarketSideBadge from "../components/PluginMarketSideBadge.vue";
import PluginMarketUpdates from "../components/PluginMarketUpdates.vue";
import { usePluginMarketDetail } from "../hooks/usePluginMarketDetail";
import { usePluginMarketList } from "../hooks/usePluginMarketList";
import { activeOperations, applyingChanges } from "../operations";

const listTabs = [
  { id: "browse", title: "TXT_CODE_PLUGIN_MARKET_BROWSE" },
  { id: "updates", title: "TXT_CODE_PLUGIN_MARKET_UPDATES" }
] as const;
const detailTabs = [
  { id: "readme", title: "TXT_CODE_PLUGIN_MARKET_README" },
  { id: "versions", title: "TXT_CODE_PLUGIN_MARKET_VERSIONS" },
  { id: "updates", title: "TXT_CODE_PLUGIN_MARKET_UPDATES" }
] as const;
const selectedPluginId = ref("");

function openPlugin(pluginId: string) {
  selectedPluginId.value = pluginId;
}

const {
  selectedDaemonId,
  nodes,
  nodesLoading,
  targetLabel,
  loading,
  failed,
  failureMessage,
  plugins,
  keyword,
  currentPage,
  pageSize,
  activeTab,
  updateView,
  updatesLoading,
  icons,
  visiblePlugins,
  totalItems,
  totalPages,
  pagedPlugins,
  refresh,
  refreshActive,
  selectPlugin,
  onCardKeydown,
  updateInstalled
} = usePluginMarketList(
  { embedded: true },
  {
    select: openPlugin
  }
);

const DesktopPluginDetailController = defineComponent({
  name: "DesktopPluginDetailController",
  props: {
    pluginId: { type: String, required: true },
    daemonId: { type: String, default: undefined }
  },
  emits: ["installed"],
  setup(props, { emit, slots }) {
    const state = proxyRefs(
      usePluginMarketDetail(props, (pluginId, version) => emit("installed", pluginId, version))
    );
    return () => slots.default?.(state);
  }
});
</script>

<template>
  <div class="dpm">
    <section v-show="!selectedPluginId" class="dpm-view dpm-view--list">
      <div class="dpm-toolbar">
        <VTextField
          v-model="keyword"
          class="dpm-search"
          :label="t('TXT_CODE_PLUGIN_MARKET_SEARCH')"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          hide-details
          clearable
          autocomplete="off"
          spellcheck="false"
        />

        <div class="dpm-toolbar__actions">
          <VMenu location="bottom end">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                class="dpm-btn dpm-target"
                variant="text"
                :loading="nodesLoading"
                :disabled="applyingChanges || Boolean(activeOperations)"
                :aria-label="t('TXT_CODE_PLUGIN_MARKET_SELECT_NODES')"
              >
                <VIcon icon="mdi-server-outline" />
                <span class="dpm-target__label">{{ targetLabel }}</span>
                <VIcon icon="mdi-chevron-down" />
              </VBtn>
            </template>
            <VList density="compact">
              <VListItem
                :active="!selectedDaemonId"
                :title="t('TXT_CODE_PLUGIN_MARKET_CURRENT_PANEL')"
                prepend-icon="mdi-monitor-dashboard"
                @click="selectedDaemonId = ''"
              />
              <VDivider v-if="nodes.length" />
              <VListItem
                v-for="node in nodes"
                :key="node.daemonId"
                :active="selectedDaemonId === node.daemonId"
                :disabled="!node.available"
                :title="computeNodeName(node.ip, node.available, node.remarks)"
                :prepend-icon="node.available ? 'mdi-database-outline' : 'mdi-server-off-outline'"
                @click="selectedDaemonId = node.daemonId"
              />
            </VList>
          </VMenu>

          <span v-if="activeTab === 'browse'" class="dpm-action-slot">
            <PluginMarketChanges />
          </span>
          <VBtn
            v-else
            class="dpm-btn dpm-btn--primary"
            variant="text"
            :disabled="!updateView?.canUpdate"
            :loading="updateView?.preparingTargets"
            @click="updateView?.updateAll()"
          >
            <VIcon icon="mdi-update" />
            {{ t("TXT_CODE_PLUGIN_MARKET_UPDATE_ALL") }}
          </VBtn>
          <VBtn
            class="dpm-btn dpm-btn--icon"
            variant="text"
            :loading="activeTab === 'updates' ? updatesLoading : loading"
            :disabled="applyingChanges"
            :title="t('TXT_CODE_PLUGIN_MARKET_REFRESH')"
            :aria-label="t('TXT_CODE_PLUGIN_MARKET_REFRESH')"
            @click="refreshActive"
          >
            <VIcon icon="mdi-refresh" />
          </VBtn>
        </div>
      </div>

      <div class="dpm-navigation">
        <nav class="dpm-tabs" :aria-label="t('TXT_CODE_PLUGIN_MARKET')">
          <VBtn
            v-for="tab in listTabs"
            :key="tab.id"
            class="dpm-tab"
            variant="text"
            :class="{ 'dpm-tab--active': activeTab === tab.id }"
            :aria-pressed="activeTab === tab.id"
            :disabled="applyingChanges || Boolean(activeOperations)"
            @click="activeTab = tab.id"
          >
            {{ t(tab.title) }}
          </VBtn>
        </nav>
        <span v-if="totalItems" class="dpm-result-count">
          {{ totalItems }}
        </span>
      </div>

      <div v-show="activeTab === 'browse'" class="dpm-content">
        <div v-if="loading && !plugins.length" class="dpm-loading">
          <VProgressCircular indeterminate size="30" />
        </div>

        <Empty
          v-else-if="!plugins.length"
          :icon="failed ? 'mdi-lan-disconnect' : 'mdi-puzzle-outline'"
          :title="
            failed ? t('TXT_CODE_PLUGIN_MARKET_UNREACHABLE') : t('TXT_CODE_PLUGIN_MARKET_EMPTY')
          "
          :description="failed ? failureMessage : t('TXT_CODE_NO_DATA')"
        >
          <template v-if="failed" #actions>
            <VBtn
              class="dpm-btn"
              variant="text"
              :loading="loading"
              :disabled="applyingChanges"
              @click="refresh"
            >
              <VIcon icon="mdi-refresh" />
              {{ t("TXT_CODE_COMMON_RETRY") }}
            </VBtn>
          </template>
        </Empty>

        <div v-else-if="visiblePlugins.length" class="dpm-grid">
          <VCard
            v-for="plugin in pagedPlugins"
            :key="plugin.id"
            class="dpm-card"
            tag="article"
            variant="flat"
            rounded="8px"
            ripple
            role="button"
            tabindex="0"
            @click="selectPlugin(plugin)"
            @keydown="onCardKeydown($event, plugin)"
          >
            <div class="dpm-card__head">
              <VAvatar
                class="dpm-card__icon"
                size="48"
                rounded="10px"
                color="surface"
                variant="flat"
              >
                <VImg
                  v-if="icons[plugin.id]"
                  :src="icons[plugin.id]"
                  alt=""
                  cover
                  transition="fade-transition"
                  @error="delete icons[plugin.id]"
                />
                <VIcon v-else icon="mdi-puzzle-outline" size="26" />
              </VAvatar>
              <div class="dpm-card__heading">
                <h2>{{ plugin.displayName }}</h2>
                <p>
                  {{ plugin.author?.displayName ?? "" }}
                  <span v-if="plugin.category"> · {{ plugin.category }}</span>
                </p>
              </div>
              <VIcon class="dpm-card__open" icon="mdi-chevron-right" />
            </div>
            <p class="dpm-card__summary">
              {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
            </p>
            <div class="dpm-card__footer">
              <div class="dpm-card__badges">
                <VChip v-if="plugin.latestVersion" size="small" variant="tonal">
                  {{
                    t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.latestVersion.version })
                  }}
                </VChip>
                <PluginMarketSideBadge :sides="plugin.sides" />
              </div>
              <PluginMarketInstall
                :plugin="plugin"
                :version="plugin.latestVersion"
                embedded
                @installed="updateInstalled"
              />
            </div>
          </VCard>
        </div>

        <Empty v-else-if="!loading" icon="mdi-magnify" :title="t('TXT_CODE_NO_DATA')" />
      </div>

      <div v-if="activeTab === 'updates'" class="dpm-updates">
        <PluginMarketUpdates
          ref="updateView"
          :keyword="keyword"
          :daemon-id="selectedDaemonId"
          :page="currentPage"
          :page-size="pageSize"
          @loading="updatesLoading = $event"
        />
      </div>

      <div v-if="totalItems && totalPages > 1" class="dpm-pagination">
        <VBtn
          class="dpm-btn dpm-btn--icon"
          variant="text"
          icon="mdi-chevron-left"
          :disabled="currentPage <= 1"
          @click="currentPage--"
        />
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <VBtn
          class="dpm-btn dpm-btn--icon"
          variant="text"
          icon="mdi-chevron-right"
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
        />
      </div>
    </section>

    <DesktopPluginDetailController
      v-if="selectedPluginId"
      :plugin-id="selectedPluginId"
      :daemon-id="selectedDaemonId"
      @installed="updateInstalled"
      v-slot="detail"
    >
      <section class="dpm-view dpm-view--detail">
        <div class="dpm-toolbar dpm-detail-toolbar">
          <div class="dpm-detail-toolbar__left">
            <VBtn
              class="dpm-btn dpm-btn--icon dpm-btn--back"
              variant="text"
              :disabled="detail.busy"
              :title="t('TXT_CODE_PLUGIN_MARKET_BACK')"
              :aria-label="t('TXT_CODE_PLUGIN_MARKET_BACK')"
              @click="selectedPluginId = ''"
            >
              <VIcon icon="mdi-arrow-left" />
            </VBtn>
          </div>
          <div class="dpm-toolbar__actions">
            <span class="dpm-action-slot"><PluginMarketChanges /></span>
            <VBtn
              class="dpm-btn dpm-btn--icon"
              variant="text"
              :loading="detail.loading"
              :disabled="detail.busy"
              :title="t('TXT_CODE_PLUGIN_MARKET_REFRESH')"
              :aria-label="t('TXT_CODE_PLUGIN_MARKET_REFRESH')"
              @click="detail.refresh"
            >
              <VIcon icon="mdi-refresh" />
            </VBtn>
          </div>
        </div>

        <div class="dpm-detail-scroll">
          <div v-if="detail.loading && !detail.plugin" class="dpm-loading">
            <VProgressCircular indeterminate size="30" />
          </div>

          <Empty
            v-if="detail.error"
            class="dpm-detail-error"
            icon="mdi-alert-circle-outline"
            :title="t('TXT_CODE_COMMON_PAGE_FAILED_TO_LOAD_PLEASE_TRY_AGAIN_LATER')"
            :description="detail.error"
            :compact="!!detail.plugin"
          >
            <template #actions>
              <VBtn
                class="dpm-btn"
                variant="text"
                :loading="detail.loading"
                :disabled="detail.busy"
                @click="detail.refresh"
              >
                <VIcon icon="mdi-refresh" />
                {{ t("TXT_CODE_COMMON_RETRY") }}
              </VBtn>
            </template>
          </Empty>

          <template v-if="detail.plugin">
            <header class="dpm-detail-head">
              <div class="dpm-detail-heading">
                <VAvatar
                  class="dpm-detail-icon"
                  size="64"
                  rounded="12px"
                  color="surface"
                  variant="flat"
                >
                  <VImg
                    v-if="detail.icon"
                    :src="detail.icon"
                    alt=""
                    cover
                    transition="fade-transition"
                    @error="delete detail.icons[detail.plugin.id]"
                  />
                  <VIcon v-else icon="mdi-puzzle-outline" size="34" />
                </VAvatar>
                <div class="dpm-detail-heading__text">
                  <h1>{{ detail.plugin.displayName }}</h1>
                  <p>{{ detail.plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}</p>
                  <div class="dpm-detail-meta">
                    <span>
                      <VIcon icon="mdi-account-circle-outline" size="15" />
                      {{
                        t("TXT_CODE_PLUGIN_MARKET_BY", {
                          name: detail.plugin.author?.displayName ?? ""
                        })
                      }}
                    </span>
                    <span v-if="detail.plugin.category" class="dpm-tag">
                      {{ detail.plugin.category }}
                    </span>
                    <PluginMarketSideBadge
                      :sides="detail.plugin.selectedVersion.sides ?? detail.plugin.sides"
                    />
                    <VChip
                      v-if="detail.plugin.installedVersion"
                      size="small"
                      color="success"
                      variant="tonal"
                    >
                      {{
                        t("TXT_CODE_PLUGIN_MARKET_INSTALLED_VERSION", {
                          version: detail.plugin.installedVersion
                        })
                      }}
                    </VChip>
                  </div>
                </div>
              </div>
              <PluginMarketInstall
                :key="detail.plugin.id"
                :plugin="detail.plugin"
                :version="detail.plugin.latestVersion || detail.plugin.selectedVersion"
                :disabled="detail.busy || detail.loading"
                embedded
                @installed="detail.updateInstalled"
                @busy="detail.trackBusy"
              />
            </header>

            <nav class="dpm-tabs dpm-detail-tabs" :aria-label="detail.plugin.displayName">
              <VBtn
                v-for="tab in detailTabs"
                :key="tab.id"
                class="dpm-tab"
                variant="text"
                :class="{ 'dpm-tab--active': detail.activeTab === tab.id }"
                :aria-pressed="detail.activeTab === tab.id"
                :disabled="detail.busy"
                @click="detail.activeTab = tab.id"
              >
                {{ t(tab.title) }}
              </VBtn>
            </nav>

            <div class="dpm-detail-body">
              <section class="dpm-detail-main">
                <template v-if="detail.activeTab === 'readme'">
                  <div
                    v-if="detail.plugin.readme || detail.plugin.description"
                    class="global-markdown-html dpm-markdown"
                    v-html="detail.readme"
                  />
                  <Empty
                    v-else
                    icon="mdi-file-document-outline"
                    :title="t('TXT_CODE_PLUGIN_MARKET_NO_DESCRIPTION')"
                    compact
                  />
                </template>

                <template v-else-if="detail.activeTab === 'versions'">
                  <ul class="dpm-versions">
                    <li
                      v-for="item in detail.plugin.versions"
                      :key="item.version"
                      class="dpm-version"
                    >
                      <div class="dpm-version__text">
                        <strong>
                          {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: item.version }) }}
                        </strong>
                        <span>
                          {{
                            t("TXT_CODE_PLUGIN_MARKET_PUBLISHED_AT", {
                              date: detail.formatDate(item.submittedAt)
                            })
                          }}
                          ·
                          {{
                            t("TXT_CODE_PLUGIN_MARKET_PACKAGE_SIZE", {
                              size: detail.formatSize(item.sizeBytes),
                              count: item.fileCount
                            })
                          }}
                        </span>
                      </div>
                      <PluginMarketInstall
                        v-if="!detail.plugin.installedVersion"
                        :plugin="detail.plugin"
                        :version="item"
                        :disabled="detail.busy || detail.loading"
                        embedded
                        install-only
                        @installed="detail.updateInstalled"
                        @busy="detail.trackBusy"
                      />
                    </li>
                  </ul>
                </template>

                <template v-else>
                  <article
                    v-for="entry in detail.changelogs"
                    :key="entry.version.version"
                    class="dpm-changelog"
                  >
                    <header>
                      <strong>
                        {{
                          t("TXT_CODE_PLUGIN_MARKET_VERSION", {
                            version: entry.version.version
                          })
                        }}
                      </strong>
                      <span>{{ detail.formatDate(entry.version.submittedAt) }}</span>
                    </header>
                    <div
                      v-if="entry.html"
                      class="global-markdown-html dpm-markdown"
                      v-html="entry.html"
                    />
                    <Empty
                      v-else
                      icon="mdi-text-box-outline"
                      :title="t('TXT_CODE_PLUGIN_MARKET_NO_CHANGELOG')"
                      compact
                    />
                  </article>
                </template>
              </section>

              <aside class="dpm-detail-side">
                <section v-if="detail.plugin.category">
                  <h2>{{ t("TXT_CODE_PLUGIN_MARKET_TAGS") }}</h2>
                  <span class="dpm-tag">{{ detail.plugin.category }}</span>
                </section>
                <section>
                  <h2>{{ t("TXT_CODE_PLUGIN_MARKET_ADDITIONAL_INFO") }}</h2>
                  <dl>
                    <div>
                      <dt>{{ t("TXT_CODE_PLUGIN_MARKET_PLUGIN_ID") }}</dt>
                      <dd>{{ detail.plugin.name }}</dd>
                    </div>
                    <div>
                      <dt>{{ t("TXT_CODE_PLUGIN_MARKET_VENDOR") }}</dt>
                      <dd>{{ detail.plugin.author?.displayName ?? "" }}</dd>
                    </div>
                    <div v-if="detail.plugin.latestVersion">
                      <dt>{{ t("TXT_CODE_PLUGIN_MARKET_LATEST") }}</dt>
                      <dd>
                        {{
                          t("TXT_CODE_PLUGIN_MARKET_VERSION", {
                            version: detail.plugin.latestVersion.version
                          })
                        }}
                      </dd>
                    </div>
                    <div v-if="detail.plugin.installedVersion">
                      <dt>{{ t("TXT_CODE_PLUGIN_MARKET_INSTALLED") }}</dt>
                      <dd>
                        {{
                          t("TXT_CODE_PLUGIN_MARKET_VERSION", {
                            version: detail.plugin.installedVersion
                          })
                        }}
                      </dd>
                    </div>
                  </dl>
                </section>
              </aside>
            </div>
          </template>
        </div>
      </section>
    </DesktopPluginDetailController>
  </div>
</template>

<style lang="scss" scoped>
.dpm {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: var(--desktop-window-text);
  font-size: 13px;
  container-type: inline-size;
}

.dpm-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dpm-toolbar {
  flex: 0 0 auto;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--desktop-window-border);
}

.dpm-search {
  width: min(320px, 42%);
  min-width: 180px;
  flex: 0 1 320px;
}

.dpm-toolbar__actions,
.dpm-detail-toolbar__left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dpm-toolbar__actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}

.dpm-btn {
  min-height: 32px;
  padding-inline: 10px;
  border: 1px solid var(--desktop-window-border);
  border-radius: 6px;
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text);
  font-size: 12px;
  text-transform: none;

  &:hover:not(:disabled) {
    background: var(--desktop-window-control-hover);
  }

  &--icon {
    min-width: 34px;
    width: 34px;
    padding: 0;
  }

  &--primary {
    border-color: #1677ff;
    background: #1677ff;
    color: #fff;

    &:hover:not(:disabled) {
      background: #4096ff;
    }
  }
}

.dpm-target {
  max-width: 220px;
}

.dpm-target__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dpm-action-slot {
  display: inline-flex;

  :deep(.v-btn) {
    min-height: 32px;
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    background: var(--desktop-window-titlebar-bg);
    font-size: 12px;
    text-transform: none;
  }
}

.dpm-navigation {
  flex: 0 0 auto;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--desktop-window-border);
}

.dpm-tabs {
  min-width: 0;
  display: flex;
  gap: 4px;
  overflow-x: auto;
}

.dpm-tab {
  color: var(--desktop-window-text-secondary);
  flex-shrink: 0;

  &--active {
    color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.1);
  }
}

.dpm-result-count {
  min-width: 28px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text-secondary);
  text-align: center;
}

.dpm-content,
.dpm-updates,
.dpm-detail-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.dpm-content {
  padding: 10px;
}

.dpm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 8px;
}

.dpm-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--desktop-window-border);
  background: var(--desktop-window-titlebar-bg);
  cursor: pointer;
  outline: none;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover,
  &:focus-visible {
    background: var(--desktop-window-control-hover);
  }

  &:focus-visible {
    border-color: rgba(22, 119, 255, 0.55);
  }
}

.dpm-card__head {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.dpm-card__icon,
.dpm-detail-icon {
  flex: 0 0 auto;
  overflow: hidden;
}

.dpm-card__heading {
  min-width: 0;
  flex: 1;

  h2,
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h2 {
    color: var(--desktop-window-text);
    font-size: 15px;
    font-weight: 600;
  }

  p {
    margin-top: 3px;
    color: var(--desktop-window-text-secondary);
    font-size: 11px;
  }
}

.dpm-card__open {
  flex: 0 0 auto;
  color: var(--desktop-window-text-muted);
}

.dpm-card__summary {
  min-height: 38px;
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--desktop-window-text-secondary);
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dpm-card__footer {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;

  :deep(.v-btn) {
    min-height: 30px;
    padding-inline: 10px;
    font-size: 12px;
    text-transform: none;
  }
}

.dpm-card__badges,
.dpm-detail-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dpm-loading {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--desktop-window-text-secondary);
}

.dpm-pagination {
  flex: 0 0 auto;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-top: 1px solid var(--desktop-window-border);
  color: var(--desktop-window-text-secondary);
}

.dpm-updates {
  padding: 12px 14px;

  :deep(.v-table) {
    border: 1px solid var(--desktop-window-border);
    border-radius: 8px;
    background: transparent;
    color: var(--desktop-window-text);
  }

  :deep(th) {
    background: var(--desktop-window-titlebar-bg);
    color: var(--desktop-window-text-secondary) !important;
  }

  :deep(td),
  :deep(th) {
    border-color: var(--desktop-window-border) !important;
  }
}

.dpm-detail-toolbar__left {
  flex: 1;
}

.dpm-btn--back {
  flex: 0 0 auto;
}

.dpm-detail-scroll {
  padding: 16px;
  scrollbar-gutter: stable;
  overflow-wrap: anywhere;
}

.dpm-detail-error {
  margin-bottom: 12px;
}

.dpm-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 2px 2px 18px;

  > :deep(.v-btn) {
    flex: 0 0 auto;
    text-transform: none;
  }
}

.dpm-detail-heading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.dpm-detail-heading__text {
  min-width: 0;

  h1 {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 22px;
    line-height: 1.25;
  }

  > p {
    margin: 6px 0 10px;
    color: var(--desktop-window-text-secondary);
    line-height: 1.5;
  }
}

.dpm-detail-meta {
  color: var(--desktop-window-text-secondary);
  font-size: 12px;

  > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.dpm-tag {
  display: inline-block;
  padding: 3px 8px;
  border: 1px solid var(--desktop-window-border);
  border-radius: 999px;
  background: var(--desktop-window-titlebar-bg);
  color: var(--desktop-window-text-secondary);
  font-size: 11px;
}

.dpm-detail-tabs {
  padding: 8px 12px;
  border-top: 1px solid var(--desktop-window-border);
  border-bottom: 1px solid var(--desktop-window-border);
}

.dpm-detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 250px);
  gap: 24px;
  align-items: start;
  padding-top: 18px;
}

.dpm-detail-main,
.dpm-detail-side {
  min-width: 0;
}

.dpm-detail-side {
  padding: 14px;
  border: 1px solid var(--desktop-window-border);
  border-radius: 8px;
  background: var(--desktop-window-titlebar-bg);

  section + section {
    margin-top: 22px;
  }

  h2 {
    margin: 0 0 10px;
    color: var(--desktop-window-text);
    font-size: 13px;
  }

  dl {
    margin: 0;

    > div {
      display: grid;
      grid-template-columns: 76px minmax(0, 1fr);
      gap: 8px;
      margin-top: 8px;
    }

    dt {
      color: var(--desktop-window-text-muted);
    }

    dd {
      min-width: 0;
      margin: 0;
      color: var(--desktop-window-text-secondary);
    }
  }
}

.dpm-versions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dpm-version {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--desktop-window-border);
  border-radius: 7px;
  background: var(--desktop-window-titlebar-bg);

  > :deep(.v-btn) {
    flex: 0 0 auto;
    text-transform: none;
  }
}

.dpm-version__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: var(--desktop-window-text);
  }

  span {
    color: var(--desktop-window-text-secondary);
    font-size: 11px;
  }
}

.dpm-changelog + .dpm-changelog {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--desktop-window-border);
}

.dpm-changelog > header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;

  strong {
    color: var(--desktop-window-text);
  }

  span {
    color: var(--desktop-window-text-muted);
    font-size: 11px;
  }
}

.dpm-markdown {
  color: var(--desktop-window-text-secondary);
  overflow-x: auto;

  :deep(img) {
    max-width: 100%;
    height: auto;
  }

  :deep(pre) {
    max-width: 100%;
    overflow-x: auto;
  }
}

@container (max-width: 760px) {
  .dpm-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .dpm-search {
    width: 100%;
    max-width: none;
    flex-basis: auto;
  }

  .dpm-toolbar__actions {
    justify-content: flex-start;
  }

  .dpm-detail-toolbar {
    flex-direction: row;
    align-items: center;
  }

  .dpm-detail-body {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container (max-width: 540px) {
  .dpm-target {
    max-width: 180px;
  }

  .dpm-detail-head {
    flex-direction: column;
  }

  .dpm-card__footer,
  .dpm-version {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
