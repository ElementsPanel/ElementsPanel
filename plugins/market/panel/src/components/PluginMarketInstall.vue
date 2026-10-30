<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ctx } from "@/plugin/context";
import { t } from "@/lang/i18n";
import { getValidatorErrorMsg } from "@/tools/validator";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VDialog,
  VProgressLinear,
  VSelect,
  VSpacer,
  VTable
} from "vuetify/components";
import {
  pluginMarketDetail,
  pluginMarketInstalled,
  type InstalledPlugin,
  type MarketPlugin,
  type MarketPluginDetail,
  type MarketPluginVersion
} from "../api";
import {
  applyingChanges,
  bulkMode,
  discardMarketChange,
  installedChange,
  queuedChanges
} from "../operations";
import PluginMarketOperations from "./PluginMarketOperations.vue";
import PluginMarketSideBadge from "./PluginMarketSideBadge.vue";

const props = defineProps<{
  plugin: MarketPlugin;
  version?: MarketPluginVersion;
  installOnly?: boolean;
  disabled?: boolean;
  embedded?: boolean;
}>();
const emit = defineEmits<{
  installed: [pluginId: string, version: string | undefined];
  busy: [value: boolean];
}>();
const shown = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const detail = ref<MarketPluginDetail>();
const installations = ref<InstalledPlugin[]>([]);
const installedLoaded = ref(false);
const selectedVersion = ref("");
const configTarget = ref("panel");
let requestId = 0;
let installedRequestId = 0;

const installed = computed(() =>
  installations.value.find((item) => item.pluginId === props.plugin.id)
);
const plugin = computed<MarketPlugin>(() => ({
  ...props.plugin,
  ...detail.value,
  installedVersion: installedLoaded.value
    ? installed.value?.version
    : props.plugin.installedVersion,
  installedState: installedLoaded.value ? installed.value?.state : props.plugin.installedState,
  installedRemovable: installedLoaded.value
    ? installed.value?.removable
    : props.plugin.installedRemovable
}));
const queued = computed(() =>
  queuedChanges.value.find((item) => item.plugin.id === props.plugin.id)
);
const actionText = computed(() =>
  queued.value
    ? queued.value.kind === "uninstall"
      ? "TXT_CODE_PLUGIN_MARKET_WAIT_REMOVE"
      : plugin.value.installedVersion
      ? "TXT_CODE_PLUGIN_MARKET_WAIT_UPDATE"
      : "TXT_CODE_PLUGIN_MARKET_WAIT_INSTALL"
    : plugin.value.installedVersion
    ? "TXT_CODE_PLUGIN_MARKET_MODIFY"
    : "TXT_CODE_PLUGIN_MARKET_ADD"
);
const versions = computed(() => detail.value?.versions ?? (props.version ? [props.version] : []));
const version = computed(() =>
  versions.value.find((item) => item.version === selectedVersion.value)
);
const versionItems = computed(() => {
  const items = versions.value.map((item) => ({
    title:
      item.version +
      (item.version === plugin.value.installedVersion
        ? ` (${t("TXT_CODE_PLUGIN_MARKET_CURRENT")})`
        : ""),
    value: item.version
  }));
  const current = plugin.value.installedVersion;
  if (current && !items.some((item) => item.value === current))
    items.unshift({ title: `${current} (${t("TXT_CODE_PLUGIN_MARKET_CURRENT")})`, value: current });
  return items;
});
const configTargets = computed(() => {
  const record = installed.value;
  if (!record) return [];
  return [
    ...(record.panelVersion || !record.daemonIds.length
      ? [{ title: t("TXT_CODE_PLUGIN_MARKET_SIDE_PANEL"), value: "panel" }]
      : []),
    ...record.daemonIds.map((id) => ({
      title: `${t("TXT_CODE_PLUGIN_MARKET_SIDE_DAEMON")} · ${id}`,
      value: id
    }))
  ];
});
const majorWarning = computed(() => {
  const current = plugin.value.installedVersion?.split(/[.+-]/);
  const target = version.value?.version.split(/[.+-]/);
  return (
    current &&
    target &&
    (current[0] !== target[0] || (current[0] === "0" && current[1] !== target[1]))
  );
});
const requirements = computed(() => {
  const selected = version.value;
  if (!selected) return [];
  return [
    ...Object.entries(selected.dependencies ?? {}).map(([name, range]) => ({
      name,
      range,
      kind: "npm"
    })),
    ...Object.entries(selected.peerDependencies ?? {}).map(([name, range]) => ({
      name,
      range,
      kind: selected.peerDependenciesMeta?.[name]?.optional
        ? t("TXT_CODE_PLUGIN_MARKET_OPTIONAL")
        : "peer"
    })),
    ...Object.entries(selected.engines ?? {}).map(([name, range]) => ({
      name,
      range,
      kind: t("TXT_CODE_PLUGIN_MARKET_RUNTIME")
    })),
    ...Object.entries(selected.compatibility ?? {}).flatMap(([side, contract]) =>
      contract
        ? [
            {
              name: `${side} API`,
              range: String(contract.api),
              kind: t("TXT_CODE_PLUGIN_MARKET_HOST_CURRENT", { version: 1 })
            },
            ...(contract.sdk === undefined
              ? []
              : [
                  {
                    name: `${side} SDK`,
                    range: String(contract.sdk),
                    kind: t("TXT_CODE_PLUGIN_MARKET_HOST_CURRENT", { version: 1 })
                  }
                ])
          ]
        : []
    ),
    ...(selected.frontendDependencies ?? []).map((name) => ({
      name,
      range: "—",
      kind: installations.value.some(
        (item) => item.pluginId === name && item.panelVersion && item.state === "active"
      )
        ? t("TXT_CODE_PLUGIN_MARKET_INSTALLED")
        : t("TXT_CODE_PLUGIN_MARKET_FRONTEND_DEPENDENCY")
    }))
  ];
});

async function readInstalled() {
  const request = ++installedRequestId;
  const response = await pluginMarketInstalled().execute();
  if (request !== installedRequestId || !shown.value) return;
  installations.value = response.value ?? [];
  installedLoaded.value = true;
  if (!configTargets.value.some((item) => item.value === configTarget.value))
    configTarget.value = configTargets.value[0]?.value ?? "panel";
}

function dependencyVersion(name: string) {
  if (/^(panel|daemon) (API|SDK)$/.test(name)) return "1";
  return (
    detail.value?.dependencyVersions?.[name] ||
    installations.value.find((item) => item.pluginId === name)?.panelVersion ||
    "—"
  );
}

async function open() {
  if (props.disabled || applyingChanges.value) return;
  shown.value = true;
  loading.value = true;
  error.value = "";
  installedLoaded.value = false;
  installations.value = [];
  detail.value = undefined;
  selectedVersion.value =
    queued.value?.version ||
    (props.installOnly ? props.version?.version : props.plugin.installedVersion) ||
    props.version?.version ||
    props.plugin.latestVersion?.version ||
    "";
  const request = ++requestId;
  const results = await Promise.allSettled([
    pluginMarketDetail().execute({ params: { pluginId: props.plugin.id } }),
    readInstalled()
  ]);
  if (request !== requestId || !shown.value) return;
  const result = results[0];
  if (result.status === "fulfilled" && result.value.value) {
    detail.value = result.value.value;
    if (!selectedVersion.value) selectedVersion.value = detail.value.selectedVersion.version;
  } else {
    error.value =
      result.status === "rejected"
        ? getValidatorErrorMsg(result.reason)
        : t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND");
  }
  if (results[1].status === "rejected") error.value ||= getValidatorErrorMsg(results[1].reason);
  loading.value = false;
}

function installedUpdated(pluginId: string, currentVersion: string | undefined) {
  installedLoaded.value = false;
  if (detail.value) detail.value.installedVersion = currentVersion;
  emit("installed", pluginId, currentVersion);
  shown.value = false;
}

function configure() {
  const router = ctx.get("vue")?.router;
  if (!router) return;
  const node = configTarget.value !== "panel";
  const query = {
    scope: node ? "node" : "panel",
    plugin: props.plugin.id,
    ...(node ? { daemonId: configTarget.value } : {})
  };
  if (
    props.embedded &&
    ctx.get("desktop")?.open({
      id: `plugin-config-${props.plugin.id}-${configTarget.value}`,
      view: "plugin-config",
      props: {
        scope: query.scope,
        daemonId: node ? configTarget.value : undefined,
        pluginId: props.plugin.id
      }
    })
  ) {
    shown.value = false;
    return;
  }
  shown.value = false;
  void router.push({ path: "/plugins/config", query });
}

watch(shown, (value) => {
  if (!value) {
    requestId++;
    installedRequestId++;
    installedLoaded.value = false;
  }
});
watch(
  () => props.plugin.installedVersion,
  () => {
    if (!shown.value) installedLoaded.value = false;
  }
);
watch(installedChange, (change) => {
  if (shown.value && change?.pluginId === props.plugin.id)
    void readInstalled().catch((cause) => (error.value = getValidatorErrorMsg(cause)));
});
onBeforeUnmount(() => {
  requestId++;
  installedRequestId++;
});
</script>

<template>
  <VBtn
    :color="
      queued
        ? queued.kind === 'uninstall'
          ? 'error'
          : 'warning'
        : plugin.installedVersion
        ? 'success'
        : 'primary'
    "
    :prepend-icon="plugin.installedVersion ? 'mdi-pencil-outline' : 'mdi-plus'"
    :disabled="disabled || applyingChanges"
    @click.stop.prevent="open"
    @keydown.stop
    >{{ t(actionText) }}</VBtn
  >
  <VDialog v-model="shown" max-width="780" :persistent="busy || applyingChanges" scrollable>
    <VCard :title="t('TXT_CODE_PLUGIN_MARKET_MANAGE', { name: plugin.displayName })">
      <VProgressLinear v-if="loading" indeterminate />
      <VCardText>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ plugin.name }}</div>
        <VAlert v-if="error" type="error" variant="tonal" :text="error" class="mb-4" />
        <VAlert
          v-if="plugin.installedVersion && plugin.installedRemovable === false"
          type="info"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_MARKET_PROTECTED')"
          class="mb-4"
        />
        <div v-if="plugin.installedVersion" class="mb-4">
          {{ t("TXT_CODE_PLUGIN_MARKET_INSTALLED_VERSION", { version: plugin.installedVersion }) }}
        </div>
        <VSelect
          v-model="selectedVersion"
          :items="versionItems"
          :label="t('TXT_CODE_PLUGIN_MARKET_TARGET_VERSION')"
          :disabled="loading || busy || applyingChanges"
          hide-details
          class="mb-4"
        />
        <PluginMarketSideBadge :sides="version?.sides ?? plugin.sides" />
        <VAlert
          v-if="version?.deprecated"
          type="warning"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_MARKET_DEPRECATED', { reason: version.deprecated })"
          class="my-4"
        />
        <VAlert
          v-if="majorWarning"
          type="warning"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_MARKET_MAJOR_WARNING')"
          class="my-4"
        />
        <VTable v-if="requirements.length" density="compact" class="my-4">
          <thead>
            <tr>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_DEPENDENCY") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_VERSION_RANGE") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_PANEL_CURRENT") }}</th>
              <th>{{ t("TXT_CODE_PLUGIN_MARKET_DEPENDENCY_TYPE") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in requirements" :key="index">
              <td>{{ item.name }}</td>
              <td>{{ item.range }}</td>
              <td>
                {{ dependencyVersion(item.name) }}
              </td>
              <td>{{ item.kind }}</td>
            </tr>
          </tbody>
        </VTable>
        <p class="text-caption text-medium-emphasis my-3">
          {{ t("TXT_CODE_PLUGIN_MARKET_NPM_DEPENDENCIES") }}
        </p>
        <VSelect
          v-if="configTargets.length > 1"
          v-model="configTarget"
          :items="configTargets"
          :label="t('TXT_CODE_PLUGIN_MARKET_CONFIG_TARGET')"
          :disabled="busy"
          hide-details
          class="mb-4"
        />
        <div v-if="installed?.daemonIds.length" class="text-caption text-medium-emphasis mb-4">
          <div v-for="daemonId in installed.daemonIds" :key="daemonId">
            {{ daemonId }} · {{ installed.daemonVersions?.[daemonId] ?? installed.version }}
          </div>
        </div>
        <VCheckbox
          v-model="bulkMode"
          :disabled="busy || applyingChanges"
          :label="t('TXT_CODE_PLUGIN_MARKET_BULK_MODE')"
          :hint="t('TXT_CODE_PLUGIN_MARKET_BULK_HINT')"
          persistent-hint
        />
      </VCardText>
      <VCardActions class="flex-wrap ga-2">
        <VBtn variant="text" :disabled="busy || applyingChanges" @click="shown = false">{{
          t("TXT_CODE_PLUGIN_MARKET_CANCEL")
        }}</VBtn>
        <VBtn
          v-if="queued"
          variant="text"
          :disabled="busy || applyingChanges"
          @click="discardMarketChange(plugin.id)"
          >{{ t("TXT_CODE_PLUGIN_MARKET_DISCARD") }}</VBtn
        >
        <VSpacer />
        <VBtn
          v-if="configTargets.length"
          color="primary"
          variant="text"
          :disabled="busy || applyingChanges"
          @click="configure"
          >{{ t("TXT_CODE_PLUGIN_MARKET_CONFIGURE") }}</VBtn
        >
        <PluginMarketOperations
          :plugin="plugin"
          :version="version"
          :disabled="disabled || loading || applyingChanges"
          allow-version-change
          @installed="installedUpdated"
          @staged="shown = false"
          @busy="
            (value) => {
              busy = value;
              emit('busy', value);
            }
          "
        />
      </VCardActions>
    </VCard>
  </VDialog>
</template>
