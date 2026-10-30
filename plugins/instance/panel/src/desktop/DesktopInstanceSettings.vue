<script setup lang="ts">
import DesktopDialog from "@/components/DesktopDialog.vue";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { INSTANCE_TYPE_TRANSLATION } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { getNetworkModeList, imageList } from "@/services/apis/envImage";
import { getInstanceInfo, updateAnyInstanceConfig, updateInstanceConfig } from "@/services/apis/instance";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { dockerPortsArray } from "@/tools/common";
import { notifyDesktop, notifyDesktopError } from "@/tools/desktopNotice";
import type { DockerNetworkModes, InstanceDetail } from "@/types";
import { defaultDockerConfig, TERMINAL_CODE } from "@/types/const";
import dayjs from "dayjs";
import { cloneDeep } from "lodash";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  VAlert, VBtn, VCheckbox, VCombobox, VForm, VIcon, VProgressCircular,
  VRadio, VRadioGroup, VSelect, VSwitch, VTextarea, VTextField
} from "vuetify/components";

type Tab = "basic" | "docker" | "advanced" | "resources";
type ListKind = "ports" | "volumes" | "env" | "labels" | "capabilities" | "devices";
type RowKey = "first" | "second" | "third";
interface ListRow { id: number; first: string; second: string; third: string }
interface ListField {
  key: RowKey;
  label: string;
  options?: Array<{ title: string; value: string }>;
}

const props = defineProps<{ instanceId: string; daemonId: string }>();
const emit = defineEmits<{ close: [] }>();
const { isAdmin, state } = useAppStateStore();
const draft = ref<InstanceDetail["config"]>();
const original = ref<InstanceDetail["config"]>();
const activeTab = ref<Tab>("basic");
const isLoading = ref(false);
const isSaving = ref(false);
const loadError = ref("");
const endTimeText = ref("");
const aliasesText = ref("");
const gpuMode = ref<"all" | "count" | "devices">("all");
const gpuDevicesText = ref("");
let generation = 0;

const isGlobalTerminal = computed(() => original.value?.nickname === GLOBAL_INSTANCE_NAME);
const isDockerMode = computed(() => draft.value?.processType === "docker");
const canEdit = computed(() => isAdmin.value ||
  (original.value?.processType === "docker" && state.settings.allowChangeCmd));
const typeItems = computed(() => Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title })));
const tabs = computed<Array<{ id: Tab; title: string }>>(() => {
  const items: Array<{ id: Tab; title: string }> = [{ id: "basic", title: t("TXT_CODE_cc7b54b9") }];
  if (!isAdmin.value) return items;
  if (!isGlobalTerminal.value) items.push({ id: "docker", title: t("TXT_CODE_afb12200") });
  items.push({ id: "advanced", title: t("TXT_CODE_31a1d824") });
  if (!isGlobalTerminal.value) items.push({ id: "resources", title: t("TXT_CODE_604d8d63") });
  return items;
});
const updateCommandHint = t("TXT_CODE_fa487a47");
const updateCommandPlaceholder = t("TXT_CODE_61ca492b") +
  '"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit';

watch(tabs, (items) => {
  if (!items.some((item) => item.id === activeTab.value)) activeTab.value = "basic";
});

const { execute: fetchInstance } = getInstanceInfo();
const { execute: updateAll } = updateAnyInstanceConfig();
const { execute: updateLimited } = updateInstanceConfig();
const applyConfig = (config: InstanceDetail["config"]) => {
  original.value = cloneDeep(config);
  draft.value = cloneDeep(config);
  draft.value.docker = { ...cloneDeep(defaultDockerConfig), ...draft.value.docker };
  endTimeText.value = config.endTime ? dayjs(config.endTime).format("YYYY-MM-DD HH:mm:ss") : "";
  aliasesText.value = draft.value.docker.networkAliases?.join(",") || "";
  gpuDevicesText.value = draft.value.docker.gpuDeviceIds?.join(",") || "";
  gpuMode.value = draft.value.docker.gpuDeviceIds?.length
    ? "devices" : Number(draft.value.docker.gpuCount) > 0 ? "count" : "all";
};
const load = async () => {
  if (isSaving.value) return;
  const version = ++generation;
  const params = { uuid: props.instanceId, daemonId: props.daemonId };
  isLoading.value = true;
  loadError.value = "";
  listOpen.value = false;
  try {
    const result = await fetchInstance({ params, forceRequest: true });
    if (version !== generation) return;
    if (!result.value?.config) throw new Error(t("TXT_CODE_2dae1294"));
    applyConfig(result.value.config);
  } catch (error) {
    if (version !== generation) return;
    loadError.value = error instanceof Error ? error.message : String(error);
    notifyDesktopError(error);
  } finally {
    if (version === generation) isLoading.value = false;
  }
};
const save = async () => {
  if (!draft.value || !canEdit.value || isSaving.value || isLoading.value || listOpen.value) return;
  const version = generation;
  try {
    const config = cloneDeep(draft.value);
    if (!config.startCommand?.trim()) throw new Error(t("TXT_CODE_9911ac11"));
    if (config.startCommand.includes("\n")) throw new Error(t("TXT_CODE_bbbda29"));
    if (isAdmin.value) {
      if (!config.nickname?.trim()) throw new Error(t("TXT_CODE_68a504b3"));
      if (!config.cwd?.trim()) throw new Error(t("TXT_CODE_71c948a9"));
      if (isDockerMode.value && !config.docker.image?.trim()) throw new Error(t("TXT_CODE_be6484f7"));
      if (isDockerMode.value && !config.docker.networkMode?.trim()) throw new Error(t("TXT_CODE_b52cb76c"));
      const date = endTimeText.value.trim() ? dayjs(endTimeText.value) : undefined;
      if (date && !date.isValid()) throw new Error(t("TXT_CODE_9911ac11"));
      config.endTime = date?.valueOf() || 0;
      config.docker.networkAliases = aliasesText.value.split(",").map((value) => value.trim()).filter(Boolean);
      config.docker.gpuDeviceIds = gpuMode.value === "devices"
        ? gpuDevicesText.value.split(",").map((value) => value.trim()).filter(Boolean) : [];
      if (!config.docker.gpuEnabled || gpuMode.value === "all") config.docker.gpuCount = -1;
      else if (gpuMode.value === "devices") config.docker.gpuCount = 0;
      else if (!Number.isInteger(Number(config.docker.gpuCount)) || Number(config.docker.gpuCount) < 1)
        throw new Error(t("TXT_CODE_gpu_count"));
      else config.docker.gpuCount = Number(config.docker.gpuCount);
      if (!config.docker.gpuEnabled) config.docker.gpuDeviceIds = [];
    }
    isSaving.value = true;
    const request = { params: { uuid: props.instanceId, daemonId: props.daemonId }, data: config };
    if (isAdmin.value) await updateAll(request);
    else await updateLimited(request);
    if (version !== generation) return;
    applyConfig(config);
    notifyDesktop(t("TXT_CODE_d3de39b4"), "success");
  } catch (error) {
    if (version === generation) notifyDesktopError(error);
  } finally {
    isSaving.value = false;
  }
};
const changeGpuMode = () => {
  const docker = draft.value?.docker;
  if (docker && gpuMode.value === "count" && !(Number(docker.gpuCount) > 0)) docker.gpuCount = 1;
};

const networkModes = ref<DockerNetworkModes[]>([]);
const images = ref<string[]>([]);
const networkLoading = ref(false);
const imagesLoading = ref(false);
const { execute: fetchNetworks } = getNetworkModeList();
const { execute: fetchImages } = imageList();
const loadNetworks = async () => {
  if (networkLoading.value) return;
  const version = generation;
  networkLoading.value = true;
  try {
    const result = await fetchNetworks({ params: { daemonId: props.daemonId } });
    if (version === generation) networkModes.value = result.value || [];
  } catch {
    // An unavailable network list must not prevent entering a network name.
  } finally {
    networkLoading.value = false;
  }
};
const loadImages = async () => {
  if (imagesLoading.value) return;
  const version = generation;
  imagesLoading.value = true;
  try {
    const result = await fetchImages({ params: { daemonId: props.daemonId }, method: "GET" });
    if (version === generation) images.value = [...new Set(
      (result.value || []).flatMap((image) => image.RepoTags || []).filter((tag) => tag !== "<none>:<none>")
    )];
  } catch {
    // Image names can still be entered when the optional image list fails.
  } finally {
    imagesLoading.value = false;
  }
};

const listOpen = ref(false);
const listKind = ref<ListKind>("env");
const listRows = ref<ListRow[]>([]);
const listError = ref("");
let rowSequence = 0;
const listDefinitions: Record<ListKind, { title: string; columns: string[] }> = {
  ports: { title: "TXT_CODE_cf88c936", columns: ["TXT_CODE_534db0b2", "TXT_CODE_b729d2e", "TXT_CODE_ad1c674c"] },
  volumes: { title: "TXT_CODE_d9c73520", columns: ["TXT_CODE_681aaeb9", "TXT_CODE_30258325"] },
  env: { title: "TXT_CODE_b916a8dc", columns: ["TXT_CODE_a42984e", "TXT_CODE_115e8a25"] },
  labels: { title: "TXT_CODE_g1c43s2h", columns: ["TXT_CODE_a42984e", "TXT_CODE_115e8a25"] },
  capabilities: { title: "TXT_CODE_bbbd4133", columns: ["TXT_CODE_d51db65a", "TXT_CODE_adea33ce"] },
  devices: { title: "TXT_CODE_b3a60c78", columns: ["TXT_CODE_e4a82ac7", "TXT_CODE_ef6115b7", "TXT_CODE_511aea70"] }
};
const listFields = computed<ListField[]>(() => listDefinitions[listKind.value].columns.map((label, index) => {
  const field: ListField = { key: (["first", "second", "third"] as const)[index], label };
  if (listKind.value === "ports" && index === 2)
    field.options = [{ title: "TCP", value: "tcp" }, { title: "UDP", value: "udp" }];
  if (listKind.value === "capabilities" && index === 1)
    field.options = [{ title: t("TXT_CODE_a1d885c1"), value: "add" }, { title: t("TXT_CODE_fac5dc49"), value: "drop" }];
  return field;
}));
const row = (first = "", second = "", third = ""): ListRow => ({ id: ++rowSequence, first, second, third });
const openList = (kind: ListKind) => {
  const docker = draft.value?.docker;
  if (!docker || !canEdit.value || isSaving.value || (!isAdmin.value && kind !== "env")) return;
  listKind.value = kind;
  listError.value = "";
  if (kind === "ports") listRows.value = dockerPortsArray(docker.ports || [])
    .map((item) => row(String(item.host ?? ""), String(item.container ?? ""), item.protocol || "tcp"));
  else if (kind === "capabilities") listRows.value = [
    ...(docker.capAdd || []).map((value) => row(value, "add")),
    ...(docker.capDrop || []).map((value) => row(value, "drop"))
  ];
  else {
    const values = kind === "volumes" ? docker.extraVolumes : docker[kind];
    const separator = kind === "env" || kind === "labels" ? "=" : "|";
    listRows.value = (values || []).map((value) => {
      const [first, ...rest] = value.split(separator);
      return kind === "devices" ? row(first, rest[0] || "", rest[1] || "") : row(first, rest.join(separator));
    });
  }
  listOpen.value = true;
};
const addRow = () => {
  listRows.value.push(row("", listKind.value === "capabilities" ? "add" : "", listKind.value === "ports" ? "tcp" : ""));
};
const assignedPort = (value: string) => /^\{mcsm_port[1-9]\d*\}$/.test(value);
const toggleAssignedPort = (item: ListRow, key: RowKey) => {
  if (assignedPort(item[key])) { item[key] = ""; return; }
  const other = item[key === "first" ? "second" : "first"];
  if (assignedPort(other)) { item[key] = other; return; }
  const used = new Set(listRows.value.flatMap((entry) => [entry.first, entry.second])
    .map((value) => /^\{mcsm_port(\d+)\}$/.exec(value)?.[1]).filter(Boolean).map(Number));
  let index = 1;
  while (used.has(index)) index++;
  item[key] = "{mcsm_port" + index + "}";
};
const applyList = () => {
  const docker = draft.value?.docker;
  const kind = listKind.value;
  if (!docker || !canEdit.value || (!isAdmin.value && kind !== "env")) return;
  if (listRows.value.some((item) => !item.first.trim() ||
    ((kind === "ports" || kind === "volumes") && !item.second.trim()))) {
    listError.value = t("TXT_CODE_9911ac11");
    return;
  }
  const rows = listRows.value;
  if (kind === "ports") docker.ports = rows.map((item) => item.first.trim() + ":" + item.second.trim() + "/" + item.third);
  else if (kind === "volumes") docker.extraVolumes = rows.map((item) => item.first + "|" + item.second);
  else if (kind === "env" || kind === "labels") docker[kind] = rows.map((item) => item.first.trim() + "=" + item.second);
  else if (kind === "capabilities") {
    docker.capAdd = rows.filter((item) => item.second === "add").map((item) => item.first.trim());
    docker.capDrop = rows.filter((item) => item.second === "drop").map((item) => item.first.trim());
  } else docker.devices = rows.map((item) => item.first + (item.second || item.third ? "|" + item.second : "") +
    (item.third ? "|" + item.third : ""));
  listOpen.value = false;
};

watch(canEdit, (allowed) => { if (!allowed) listOpen.value = false; });
watch(isAdmin, () => { listOpen.value = false; });
watch(() => [props.instanceId, props.daemonId], () => {
  draft.value = undefined;
  original.value = undefined;
  activeTab.value = "basic";
  networkModes.value = [];
  images.value = [];
  void load();
}, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>

<template>
  <div class="dis">
    <header class="dis__header">
      <span class="dis__name">{{ original?.nickname || t("TXT_CODE_4f34fc28") }}</span>
      <div class="dis__actions">
        <VBtn class="dis-btn dis-btn--primary" variant="text" size="small" :loading="isSaving"
          :disabled="!draft || !canEdit || isLoading || listOpen" @click="save">
          <VIcon icon="mdi-content-save-outline" start />{{ t("TXT_CODE_abfe9512") }}
        </VBtn>
        <VBtn class="dis-btn" variant="text" size="small" :loading="isLoading"
          :disabled="isSaving" @click="load">
          <VIcon icon="mdi-refresh" start />{{ t("TXT_CODE_b76d94e0") }}
        </VBtn>
      </div>
    </header>
    <nav v-if="draft && canEdit" class="dis__tabs" :aria-label="t('TXT_CODE_4f34fc28')">
      <VBtn v-for="tab in tabs" :key="tab.id" variant="text" size="small" class="dis-tab"
        :class="{ 'dis-tab--active': activeTab === tab.id }" :aria-pressed="activeTab === tab.id"
        @click="activeTab = tab.id">{{ tab.title }}</VBtn>
    </nav>
    <div class="dis__body">
      <VAlert v-if="loadError" type="error" variant="tonal" class="mb-4" :text="loadError" />
      <div v-if="isLoading && !draft" class="dis__empty"><VProgressCircular indeterminate color="primary" /></div>
      <VAlert v-else-if="draft && !canEdit" type="warning" variant="tonal" :text="t('TXT_CODE_permission.forbidden')" />
      <VForm v-else-if="draft" :disabled="isSaving || isLoading" class="dis__form" @submit.prevent="save">
        <section v-show="activeTab === 'basic'" class="dis__grid">
          <VTextField v-model="draft.nickname" :label="t('TXT_CODE_f70badb9')" :disabled="!isAdmin || isGlobalTerminal || isSaving" />
          <VSelect v-model="draft.type" :items="typeItems" :label="t('TXT_CODE_2f291d8b')" :disabled="!isAdmin || isGlobalTerminal || isSaving" />
          <VTextField v-model="endTimeText" :label="t('TXT_CODE_fa920c0')" placeholder="YYYY-MM-DD HH:mm:ss"
            :disabled="!isAdmin || isGlobalTerminal || isSaving" />
          <VSelect v-model="draft.fileCode" :items="TERMINAL_CODE" :label="t('TXT_CODE_f041de90')" />
          <p v-if="!isAdmin" class="dis__hint dis__wide">{{ t("TXT_CODE_66f38b2e") }}</p>
          <VTextarea v-model="draft.startCommand" class="dis__wide" :label="t('TXT_CODE_d12fa808')" rows="4"
            :placeholder="isDockerMode ? t('TXT_CODE_98e7c829') : t('TXT_CODE_f50cfe2')" />
          <VTextField v-if="isAdmin" v-model="draft.stopCommand" class="dis__wide" :label="t('TXT_CODE_11cfe3a1')" :placeholder="t('TXT_CODE_83053cd5')" />
          <template v-else>
            <VTextField v-model="draft.updateCommand" class="dis__wide" :label="t('TXT_CODE_bb0b9711')"
              :hint="updateCommandHint" :placeholder="updateCommandPlaceholder" persistent-hint />
            <VBtn class="dis-btn" variant="text" :disabled="isSaving" @click="openList('env')">
              {{ t("TXT_CODE_b916a8dc") }}: {{ t("TXT_CODE_ad207008") }}
            </VBtn>
          </template>
        </section>
        <section v-if="isAdmin && !isGlobalTerminal" v-show="activeTab === 'docker'" class="dis__grid">
          <VSwitch v-model="draft.processType" class="dis__wide" true-value="docker" false-value="general"
            color="primary" :label="t('TXT_CODE_61a8296e')" />
          <template v-if="isDockerMode">
            <VCombobox v-model="draft.docker.image" :items="images" :return-object="false" :loading="imagesLoading"
              class="dis__wide" :label="t('TXT_CODE_44b585c7')" @focus="loadImages" />
            <VSwitch v-model="draft.docker.changeWorkdir" color="primary" :label="t('TXT_CODE_5484094a')" />
            <VTextField v-model="draft.docker.workingDir" :label="t('TXT_CODE_81979d0f')" :placeholder="t('TXT_CODE_2082f659')" />
            <div class="dis__list-buttons dis__wide">
              <VBtn v-for="(definition, kind) in listDefinitions" :key="kind" class="dis-btn" variant="text"
                :disabled="isSaving" @click="openList(kind)">
                {{ t(definition.title) }}: {{ t("TXT_CODE_ad207008") }}
              </VBtn>
            </div>
            <VTextField v-model.number="draft.basePort" type="number" min="0" max="65535" :label="t('TXT_CODE_15f5fb07')" />
            <VCombobox v-model="draft.docker.networkMode" :items="networkModes.map((mode) => mode.Name)"
              :return-object="false" :loading="networkLoading" :label="t('TXT_CODE_efcef926')" @focus="loadNetworks" />
            <VTextField v-model="aliasesText" :label="t('TXT_CODE_10194e6a')" />
            <VTextField v-model="draft.docker.containerName" :label="t('TXT_CODE_c3a3b6b1')" />
            <VSwitch v-model="draft.docker.privileged" color="primary" :label="t('TXT_CODE_dc47d2aa')" />
          </template>
        </section>
        <section v-if="isAdmin" v-show="activeTab === 'advanced'" class="dis__grid">
          <VTextField v-model="draft.cwd" class="dis__wide" :label="t('TXT_CODE_ee67e1a3')" />
          <VTextField v-model="draft.updateCommand" class="dis__wide" :label="t('TXT_CODE_bb0b9711')"
            :hint="updateCommandHint" :placeholder="updateCommandPlaceholder" persistent-hint :disabled="isGlobalTerminal || isSaving" />
          <VCombobox v-model="draft.docker.updateCommandImage" :items="images" :return-object="false"
            :loading="imagesLoading" :label="t('TXT_CODE_8aca7994')" @focus="loadImages" />
          <VTextField v-model="draft.runAs" :label="t('TXT_CODE_fffaeb17')" :disabled="isGlobalTerminal || isSaving" />
        </section>
        <section v-if="isAdmin && !isGlobalTerminal" v-show="activeTab === 'resources'" class="dis__grid">
          <VTextField v-model.number="draft.docker.cpuUsage" type="number" suffix="%" :label="t('TXT_CODE_53046822')" />
          <VTextField v-model="draft.docker.cpusetCpus" :label="t('TXT_CODE_b0c4e4ae')" />
          <VTextField v-model.number="draft.docker.memory" type="number" suffix="MB" :label="t('TXT_CODE_6fe24924')" />
          <VTextField v-model.number="draft.docker.memorySwap" type="number" :label="t('TXT_CODE_a68b3a9c')" />
          <VTextField v-model.number="draft.docker.maxSpace" type="number" suffix="GB" :label="t('TXT_CODE_ca61b504')" />
          <VTextField v-model.number="draft.docker.memorySwappiness" type="number" :label="t('TXT_CODE_5c43374f')" />
          <VTextField v-model.number="draft.docker.uploadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_network_upload_limit')" />
          <VTextField v-model.number="draft.docker.downloadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_network_download_limit')" />
          <h3 class="dis__section-title dis__wide">{{ t("TXT_CODE_gpu_section_title") }}</h3>
          <VSwitch v-model="draft.docker.gpuEnabled" color="primary" :label="t('TXT_CODE_gpu_enable')" />
          <template v-if="draft.docker.gpuEnabled">
            <VTextField v-model="draft.docker.gpuDriver" :label="t('TXT_CODE_gpu_driver')" />
            <VRadioGroup v-model="gpuMode" inline class="dis__wide" :label="t('TXT_CODE_gpu_alloc_mode')" @update:model-value="changeGpuMode">
              <VRadio value="all" :label="t('TXT_CODE_gpu_alloc_all')" />
              <VRadio value="count" :label="t('TXT_CODE_gpu_alloc_count')" />
              <VRadio value="devices" :label="t('TXT_CODE_gpu_alloc_device_ids')" />
            </VRadioGroup>
            <VTextField v-if="gpuMode === 'count'" v-model.number="draft.docker.gpuCount" type="number" min="1" max="128" :label="t('TXT_CODE_gpu_count')" />
            <VTextField v-if="gpuMode === 'devices'" v-model="gpuDevicesText" class="dis__wide" :label="t('TXT_CODE_gpu_device_ids')" />
          </template>
        </section>
      </VForm>
    </div>

    <DesktopDialog v-model="listOpen" :id="'instance-settings-' + daemonId + '-' + instanceId + '-' + listKind"
      class="dis-list-editor" :title="t(listDefinitions[listKind].title)" icon="mdi-format-list-bulleted" :width="900" :height="520">
      <div class="dis-list-editor__toolbar">
        <VBtn class="dis-btn" variant="text" @click="addRow">
          <VIcon icon="mdi-plus-circle-outline" start />{{ t("TXT_CODE_dfc17a0c") }}
        </VBtn>
      </div>
      <VAlert v-if="listError" type="error" variant="tonal" class="mb-4" :text="listError" />
      <div v-if="!listRows.length" class="dis__hint">{{ t("TXT_CODE_NO_DATA") }}</div>
      <div v-for="(item, index) in listRows" :key="item.id" class="dis-list-editor__row"
        :style="{ '--dis-list-columns': listFields.length }">
        <div v-for="field in listFields" :key="field.key">
          <VSelect v-if="field.options" v-model="item[field.key]" :items="field.options" :label="t(field.label)" hide-details />
          <VTextarea v-else-if="field.key === 'second' && (listKind === 'env' || listKind === 'labels')"
            v-model="item[field.key]" :label="t(field.label)" rows="1" auto-grow hide-details />
          <VTextField v-else v-model="item[field.key]" :label="t(field.label)" hide-details
            :disabled="listKind === 'ports' && assignedPort(item[field.key])" />
          <VCheckbox v-if="listKind === 'ports' && field.key !== 'third'" density="compact" hide-details
            :model-value="assignedPort(item[field.key])" :label="t('TXT_CODE_6f1129fb')"
            @update:model-value="toggleAssignedPort(item, field.key)" />
        </div>
        <VBtn icon="mdi-minus-circle-outline" variant="text" color="error" size="small"
          :aria-label="t('TXT_CODE_fe731dfc')" @click="listRows.splice(index, 1)" />
      </div>
      <template #footer>
        <VBtn class="dis-btn" variant="text" @click="listOpen = false">{{ t("TXT_CODE_a0451c97") }}</VBtn>
        <VBtn class="dis-btn dis-btn--primary" variant="text" @click="applyList">{{ t("TXT_CODE_d507abff") }}</VBtn>
      </template>
    </DesktopDialog>
  </div>
</template>

<style lang="scss" scoped>
.dis {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--desktop-window-text);
  font-size: 13px;

  &__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--desktop-window-border);
  }
  &__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  &__actions, &__list-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
  &__tabs { display: flex; flex: 0 0 auto; gap: 4px; padding: 8px 12px; overflow-x: auto; border-bottom: 1px solid var(--desktop-window-border); }
  &__body { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
  &__empty { display: flex; height: 100%; min-height: 120px; align-items: center; justify-content: center; }
  &__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; align-items: start; }
  &__wide { grid-column: 1 / -1; }
  &__hint { color: var(--desktop-window-text-muted); line-height: 1.6; margin: 0; }
  &__section-title { font-size: 14px; font-weight: 500; margin: 0; padding-top: 8px; }
}
.dis-tab { color: var(--desktop-window-text-secondary); flex-shrink: 0; }
.dis-tab--active { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.1); }
.dis-btn {
  color: var(--desktop-window-text);
  background: var(--desktop-window-titlebar-bg);
  border: 1px solid var(--desktop-window-border);
  font-size: 12px;
  text-transform: none;
  &:hover { background: var(--desktop-window-control-hover); }
  &--primary { color: rgb(var(--v-theme-primary)); border-color: rgba(var(--v-theme-primary), 0.3); background: rgba(var(--v-theme-primary), 0.1); }
}
.dis-list-editor__toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
.dis-list-editor__row {
  display: grid;
  grid-template-columns: repeat(var(--dis-list-columns, 2), minmax(0, 1fr)) auto;
  align-items: start;
  gap: 10px;
  margin-bottom: 12px;
}
@media (max-width: 640px) {
  .dis-list-editor__row { grid-template-columns: minmax(0, 1fr); padding-bottom: 12px; border-bottom: 1px solid var(--desktop-window-border); }
}
</style>
