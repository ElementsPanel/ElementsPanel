<script setup lang="ts">
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VChip,
  VCol,
  VContainer,
  VIcon,
  VProgressLinear,
  VRow,
  VTextField
} from "vuetify/components";
import { pluginMarketList, type MarketPlugin } from "../api";
import PluginMarketSideBadge from "./PluginMarketSideBadge.vue";

const props = defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ select: [pluginId: string] }>();
const loading = ref(false);
const plugins = ref<MarketPlugin[]>([]);
const keyword = ref<string | null>("");

const visiblePlugins = computed(() => {
  const q = (keyword.value ?? "").trim().toLowerCase();
  if (!q) return plugins.value;
  return plugins.value.filter((plugin) =>
    [plugin.displayName, plugin.name, plugin.summary].some((field) =>
      String(field ?? "")
        .toLowerCase()
        .includes(q)
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

function selectPlugin(plugin: MarketPlugin) {
  if (props.embedded) emit("select", plugin.id);
}

function onCardKeydown(event: KeyboardEvent, plugin: MarketPlugin) {
  if (!props.embedded || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  selectPlugin(plugin);
}

function updateInstalled(pluginId: string, version: string | undefined) {
  const plugin = plugins.value.find((item) => item.id === pluginId);
  if (plugin) plugin.installedVersion = version;
}

defineExpose({ updateInstalled });
onMounted(refresh);
</script>

<template>
  <main class="plugin-market" :class="{ 'plugin-market--embedded': embedded }">
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

      <div v-if="!loading && !plugins.length" class="plugin-market-empty" role="status">
        <VIcon icon="mdi-puzzle-outline" size="48" class="plugin-market-empty-icon" />
        <div class="plugin-market-empty-title">{{ t("TXT_CODE_PLUGIN_MARKET_EMPTY") }}</div>
        <div class="plugin-market-empty-text">{{ t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE") }}</div>
      </div>

      <VRow v-else-if="visiblePlugins.length" class="plugin-market-grid">
        <VCol v-for="plugin in visiblePlugins" :key="plugin.id" cols="12" md="6" lg="4">
          <VCard
            class="plugin-market-card h-100"
            elevation="0"
            :to="embedded ? undefined : `/market/plugins/${encodeURIComponent(plugin.id)}`"
            :role="embedded ? 'button' : undefined"
            :tabindex="embedded ? 0 : undefined"
            link
            @click="selectPlugin(plugin)"
            @keydown="onCardKeydown($event, plugin)"
          >
            <VCardText class="plugin-market-card-content">
              <div class="text-h6">
                {{ plugin.displayName }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t("TXT_CODE_PLUGIN_MARKET_BY", { name: plugin.author?.displayName ?? "" }) }}
                <span v-if="plugin.category">· {{ plugin.category }}</span>
              </div>
              <div class="plugin-market-card-summary text-body-2 mt-2">
                {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
              </div>
            </VCardText>

            <VCardActions class="plugin-market-card-actions">
              <VChip v-if="plugin.latestVersion" size="small" variant="tonal">
                {{ t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.latestVersion.version }) }}
              </VChip>
              <PluginMarketSideBadge :sides="plugin.sides" />
              <VChip v-if="plugin.installedVersion" size="small" color="success" variant="tonal">
                {{ t("TXT_CODE_PLUGIN_MARKET_INSTALLED") }}
              </VChip>
            </VCardActions>
          </VCard>
        </VCol>
      </VRow>

      <div v-else-if="!loading" class="plugin-market-empty plugin-market-empty--filtered" role="status">
        <VIcon icon="mdi-magnify" size="42" class="plugin-market-empty-icon" />
        <div class="plugin-market-empty-title">{{ t("TXT_CODE_NO_DATA") }}</div>
      </div>
    </VContainer>
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

// A card is a column: the description takes the space that is left, so the
// version chips stay on the last line of every card
// instead of following the text up and down.
.plugin-market-card {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
}

.plugin-market-card-content {
  flex: 1 0 auto;
}

.plugin-market-card-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.5;
  text-overflow: ellipsis;
}

.plugin-market-card-actions {
  align-items: center;
  padding-top: 8px;
}

.plugin-market-empty {
  min-height: 38vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-gray-7);
}

.plugin-market-empty-icon {
  margin-bottom: 8px;
  color: var(--color-gray-6);
}

.plugin-market-empty-title {
  color: var(--color-gray-8);
  font-size: 1rem;
  font-weight: 600;
}

.plugin-market-empty-text {
  max-width: 460px;
  color: var(--color-gray-7);
  font-size: 0.875rem;
  line-height: 1.5;
}

.plugin-market-empty--filtered {
  min-height: 28vh;
}

@media (max-width: 992px) {
  .plugin-market-container {
    padding: 16px 12px 28px;
  }
}

.plugin-market--embedded {
  height: 100%;
  min-height: 0;
  overflow-y: auto;

  .plugin-market-container {
    max-width: none;
    padding: 20px;
  }

  .plugin-market-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 20px;
  }

  :deep(.page-toolbar) {
    margin-bottom: 24px;
    gap: 12px;
  }

  :deep(.page-toolbar-title) {
    flex: 1 1 200px;
    font-size: 18px;
  }

  :deep(.page-toolbar-search) {
    flex: 1 1 240px;
  }

  :deep(.page-toolbar-actions) {
    flex: 0 0 auto;
    justify-content: flex-end;
  }
}
</style>
