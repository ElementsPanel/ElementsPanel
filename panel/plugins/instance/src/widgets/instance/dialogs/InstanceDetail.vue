<script setup lang="ts">
import {
  useDockerCapabilityEditDialog,
  useDockerDeviceEditDialog,
  useDockerEnvEditDialog,
  useDockerLabelEditDialog,
  usePortEditDialog,
  useVolumeEditDialog
} from "@/components/fc";
import AppDialog from "@/components/AppDialog.vue";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { INSTANCE_TYPE_TRANSLATION } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { isCN, t } from "@/lang/i18n";
import { getNetworkModeList } from "@/services/apis/envImage";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { dockerPortsArray } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { DockerNetworkModes, FilterOption, InstanceDetail, QuickStartPackages } from "@/types";
import { defaultQuickStartPackages, SEARCH_ALL_KEY, TERMINAL_CODE } from "@/types/const";
import { message } from "@/tools/vuetifyToast";
import dayjs, { type Dayjs } from "dayjs";
import _ from "lodash";
import { computed, ref, unref } from "vue";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { dayjsToTimestamp, timestampToDayjs } from "@/tools/time";
import {
  VBtn,
  VCombobox,
  VCol,
  VDivider,
  VForm,
  VIcon,
  VImg,
  VRadio,
  VRadioGroup,
  VRow,
  VSelect,
  VSwitch,
  VTab,
  VTabs,
  VTextarea,
  VTextField,
  VTabsWindow,
  VTabsWindowItem
} from "vuetify/components";
import DockerImageSelect from "./components/DockerImageSelect.vue";

interface FormDetail extends InstanceDetail {
  dayjsEndTime?: Dayjs;
  networkAliasesText: string;
  imageSelectMethod: "SELECT" | "EDIT";
}

interface CombinedFormData {
  instance: Partial<FormDetail>;
  template: QuickStartPackages;
}

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
  gameTypeList?: FilterOption[];
  platformList?: FilterOption[];
  categoryList?: FilterOption[];
}>();

const emit = defineEmits(["update", "save-template"]);
const open = ref(false);

enum TabSettings {
  Template,
  Basic,
  Docker,
  Advanced,
  ResLimit
}
const activeKey = ref<TabSettings>(TabSettings.Basic);
const UPDATE_CMD_DESCRIPTION = t("TXT_CODE_fa487a47");
const UPDATE_CMD_TEMPLATE =
  t("TXT_CODE_61ca492b") +
  '"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit';

const formType = ref<"template" | "normal">("normal");
const isEditMode = ref(false);
const isTemplateMode = computed(() => formType.value === "template");
const title = computed(() =>
  isTemplateMode.value
    ? isEditMode.value
      ? t("TXT_CODE_921206fc")
      : t("TXT_CODE_3d45d8d")
    : t("TXT_CODE_aac98b2a")
);
const { isPhone } = useScreen();

const formRef = ref<any>();
const formData = ref<CombinedFormData>({
  instance: {},
  template: _.cloneDeep(defaultQuickStartPackages)
});

const templateIndex = ref(-1);
const languageOptions: FilterOption[] = [
  { label: "Chinese", value: "zh_cn" },
  { label: "English", value: "en_us" }
];
const selectOptions = ref({
  appGameTypeList: props.gameTypeList ?? [],
  appPlatformList: props.platformList ?? [],
  appCategoryList: props.categoryList ?? []
});
const searchFormData = ref({ appGameTypeList: "", appPlatformList: "", appCategoryList: "" });
const addOption = (item: string, category: keyof typeof selectOptions.value) => {
  if (!item || selectOptions.value[category].some((option) => option.value === item)) return;
  selectOptions.value[category].push({ label: item, value: item });
  searchFormData.value[category] = "";
};

const networkModes = ref<DockerNetworkModes[]>([]);
const { execute: executeGetNetworkModeList } = getNetworkModeList();
const { execute, isLoading } = updateAnyInstanceConfig();
const isGlobalTerminal = computed(() => props.instanceInfo?.config.nickname === GLOBAL_INSTANCE_NAME);
const isDockerMode = computed(() => formData.value.instance?.config?.processType === "docker");
const docker = computed(() => formData.value.instance?.config?.docker);

const gpuAllocMode = ref<"all" | "count" | "deviceIds">("all");
const gpuDeviceIdsText = ref("");
const initGpuAllocMode = () => {
  const cfg = docker.value;
  if (!cfg) return;
  if (cfg.gpuDeviceIds?.length) gpuAllocMode.value = "deviceIds";
  else if (typeof cfg.gpuCount === "number" && cfg.gpuCount >= 1) gpuAllocMode.value = "count";
  else gpuAllocMode.value = "all";
};
const initGpuDeviceIdsText = () => {
  gpuDeviceIdsText.value = docker.value?.gpuDeviceIds?.join(",") || "";
};
const onGpuAllocModeChange = () => {
  const cfg = docker.value;
  if (!cfg) return;
  if (gpuAllocMode.value === "all") {
    cfg.gpuCount = -1;
    cfg.gpuDeviceIds = [];
    gpuDeviceIdsText.value = "";
  } else if (gpuAllocMode.value === "count") {
    cfg.gpuCount = 1;
    cfg.gpuDeviceIds = [];
    gpuDeviceIdsText.value = "";
  } else {
    cfg.gpuCount = 0;
  }
};

const loadNetworkModes = async () => {
  try {
    const modes = await executeGetNetworkModeList({ params: { daemonId: props.daemonId ?? "" } });
    if (modes.value) networkModes.value = modes.value;
  } catch {
    // The network list is optional; leave the select usable when the daemon is offline.
  }
};

const initFormDetail = () => {
  if (props.instanceInfo) {
    formData.value.instance = {
      ...props.instanceInfo,
      dayjsEndTime: timestampToDayjs(props.instanceInfo.config?.endTime),
      networkAliasesText: props.instanceInfo.config?.docker?.networkAliases?.join(",") || "",
      imageSelectMethod: "SELECT"
    };
  } else {
    selectOptions.value.appGameTypeList = props.gameTypeList ?? [];
    selectOptions.value.appPlatformList = props.platformList ?? [];
    selectOptions.value.appCategoryList = props.categoryList ?? [];
    const setupInfo = formData.value.template.setupInfo;
    formData.value.instance = {
      config: setupInfo,
      dayjsEndTime: timestampToDayjs(setupInfo?.endTime),
      networkAliasesText: setupInfo?.docker?.networkAliases?.join(",") || "",
      imageSelectMethod: "SELECT"
    };
  }
  initGpuAllocMode();
  initGpuDeviceIdsText();
};

const openDialog = async ({ item, i }: { item?: QuickStartPackages; i?: number } = {}) => {
  if (item) {
    formData.value.template = _.cloneDeep(item);
    if (!formData.value.template.setupInfo?.docker)
      formData.value.template.setupInfo!.docker = _.cloneDeep(defaultQuickStartPackages.setupInfo!.docker);
    isEditMode.value = true;
    templateIndex.value = Number(i);
    formType.value = "template";
    activeKey.value = TabSettings.Template;
  } else if (Number(i) < 0) {
    formData.value.template = _.cloneDeep(defaultQuickStartPackages);
    formData.value.template.language = isCN() ? "zh_cn" : "en_us";
    isEditMode.value = false;
    formType.value = "template";
    activeKey.value = TabSettings.Template;
  } else {
    formType.value = "normal";
    activeKey.value = TabSettings.Basic;
    await loadNetworkModes();
  }
  initFormDetail();
  open.value = true;
};

const endTimeText = computed({
  get: () => (formData.value.instance.dayjsEndTime ? dayjs(formData.value.instance.dayjsEndTime).format("YYYY-MM-DD HH:mm:ss") : ""),
  set: (value: string) => {
    formData.value.instance.dayjsEndTime = value ? dayjs(value) : undefined;
  }
});

const validateForm = async () => {
  const result = await formRef.value?.validate();
  if (result && !result.valid) throw new Error(t("TXT_CODE_9911ac11"));
  if (isTemplateMode.value) {
    const template = formData.value.template;
    if (!template.title?.trim()) throw new Error(t("TXT_CODE_6b5509c7"));
    if (!template.description?.trim()) throw new Error(t("TXT_CODE_8d6c8ae7"));
    if (!template.language) throw new Error(t("TXT_CODE_60752a40"));
    if (!template.platform) throw new Error(t("TXT_CODE_46039f9b"));
    if (!template.gameType) throw new Error(t("TXT_CODE_f0694685"));
    if (!template.category) throw new Error(t("TXT_CODE_b2391fca"));
    if (!template.image) throw new Error(t("TXT_CODE_c11ac499"));
    if (!template.author?.trim()) throw new Error(t("TXT_CODE_f6d73056"));
    if (!template.runtime?.trim()) throw new Error(t("TXT_CODE_8717ed9d"));
    if (!template.hardware?.trim()) throw new Error(t("TXT_CODE_f7909939"));
    if (!template.setupInfo?.type) throw new Error(t("TXT_CODE_9f4eaa41"));
  } else if (formData.value.instance.config) {
    const config = formData.value.instance.config;
    if (!config.nickname?.trim()) throw new Error(t("TXT_CODE_68a504b3"));
    if (!config.startCommand?.trim()) throw new Error(t("TXT_CODE_9911ac11"));
    if (config.startCommand.includes("\n")) throw new Error(t("TXT_CODE_bbbda29"));
    if (!config.cwd?.trim()) throw new Error(t("TXT_CODE_71c948a9"));
    if (isDockerMode.value && !config.docker.image?.trim()) throw new Error(t("TXT_CODE_be6484f7"));
    if (isDockerMode.value && !config.docker.networkMode?.trim()) throw new Error(t("TXT_CODE_b52cb76c"));
  }
};

const encodeFormData = () => {
  const postData = _.cloneDeep(unref(formData.value.instance));
  if (!postData?.config) throw new Error("Ref Options is null");
  postData.config.endTime = dayjsToTimestamp(postData.dayjsEndTime);
  postData.config.docker.networkAliases = postData.networkAliasesText
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (gpuAllocMode.value === "deviceIds") {
    postData.config.docker.gpuDeviceIds = gpuDeviceIdsText.value.split(",").map((v) => v.trim()).filter(Boolean);
    postData.config.docker.gpuCount = 0;
  } else if (gpuAllocMode.value === "all") {
    postData.config.docker.gpuCount = -1;
    postData.config.docker.gpuDeviceIds = [];
  } else postData.config.docker.gpuDeviceIds = [];
  if (!postData.config.docker.gpuEnabled) {
    postData.config.docker.gpuCount = -1;
    postData.config.docker.gpuDeviceIds = [];
  }
  return postData;
};

const submit = async () => {
  try {
    await validateForm();
    if (isTemplateMode.value) {
      emit("save-template", _.cloneDeep(formData.value.template), templateIndex.value);
      open.value = false;
      message.success(isEditMode.value ? t("TXT_CODE_a7907771") : t("TXT_CODE_d28c05df"));
      formData.value.template = _.cloneDeep(defaultQuickStartPackages);
      return;
    }
    const postData = encodeFormData();
    await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: postData.config! });
    emit("update");
    open.value = false;
    message.success(t("TXT_CODE_d3de39b4"));
  } catch (error: any) {
    console.error(error);
    reportErrorMsg(error?.message ?? t("TXT_CODE_9911ac11"));
  }
};

const handleEditDockerConfig = async (type: "port" | "volume" | "env" | "label" | "device" | "capability") => {
  const cfg = docker.value;
  if (!cfg) return;
  if (type === "port") {
    const result = await usePortEditDialog(dockerPortsArray(cfg.ports || []));
    cfg.ports = result.map((v) => `${v.host}:${v.container}/${v.protocol}`);
  } else if (type === "volume") {
    const result = await useVolumeEditDialog((cfg.extraVolumes || []).map((v) => { const [host, container] = v.split("|"); return { host: host || "", container: container || "" }; }));
    cfg.extraVolumes = result.map((v) => `${v.host}|${v.container}`);
  } else if (type === "env") {
    const result = await useDockerEnvEditDialog((cfg.env || []).map((v) => { const [label, ...rest] = v.split("="); return { label: label || "", value: rest.join("=") }; }));
    cfg.env = result.map((v) => `${v.label}=${v.value}`);
  } else if (type === "label") {
    const result = await useDockerLabelEditDialog((cfg.labels || []).map((v) => { const [label, ...rest] = v.split("="); return { label: label || "", value: rest.join("=") }; }));
    cfg.labels = result.map((v) => `${v.label}=${v.value}`);
  } else if (type === "capability") {
    const all = [...new Set([...(cfg.capAdd || []), ...(cfg.capDrop || [])])];
    const result = await useDockerCapabilityEditDialog(all.map((label) => ({ label, value: cfg.capAdd?.includes(label) ? "add" : "drop" })));
    cfg.capAdd = result.filter((v) => v.value === "add").map((v) => v.label);
    cfg.capDrop = result.filter((v) => v.value === "drop").map((v) => v.label);
  } else {
    const result = await useDockerDeviceEditDialog((cfg.devices || []).map((v) => { const [PathOnHost, PathInContainer, CgroupPermissions] = v.split("|"); return { PathOnHost: PathOnHost || "", PathInContainer: PathInContainer || "", CgroupPermissions: CgroupPermissions || "" }; }));
    cfg.devices = result.map((v) => !v.PathOnHost ? "" : !v.PathInContainer && !v.CgroupPermissions ? v.PathOnHost : !v.CgroupPermissions ? `${v.PathOnHost}|${v.PathInContainer}` : `${v.PathOnHost}|${v.PathInContainer}|${v.CgroupPermissions}`).filter(Boolean);
  }
};

const handleUploadImg = async () => {
  const pick = usePluginService<FrontendFileManagerService>("file");
  const url = (await pick?.useUploadFileDialog()) ?? "";
  if (url) formData.value.template.image = url;
};

const setDockerImage = (value: string) => {
  if (formData.value.instance.config?.docker) formData.value.instance.config.docker.image = value;
};
const setUpdateDockerImage = (value: string) => {
  if (formData.value.instance.config?.docker) formData.value.instance.config.docker.updateCommandImage = value;
};

defineExpose({ openDialog });
</script>

<template>
  <AppDialog v-model:open="open" :title="title" :max-width="isPhone ? '100%' : '1200px'" :mask-closable="false" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_abfe9512')" @ok="submit">
    <div v-if="!formData.instance.config" class="text-medium-emphasis">{{ t("TXT_CODE_2dae1294") }}</div>
    <VForm v-else ref="formRef" @submit.prevent="submit">
      <VTabs v-model="activeKey" color="primary" show-arrows>
        <VTab v-if="isTemplateMode" :value="TabSettings.Template">{{ t("TXT_CODE_d9c63fdd") }}</VTab>
        <VTab :value="TabSettings.Basic">{{ t("TXT_CODE_cc7b54b9") }}</VTab>
        <VTab v-if="!isGlobalTerminal" :value="TabSettings.Docker">{{ t("TXT_CODE_afb12200") }}</VTab>
        <VTab :value="TabSettings.Advanced">{{ t("TXT_CODE_31a1d824") }}</VTab>
        <VTab v-if="!isGlobalTerminal" :value="TabSettings.ResLimit">{{ t("TXT_CODE_604d8d63") }}</VTab>
      </VTabs>
      <VTabsWindow v-model="activeKey" class="pt-4">
        <VTabsWindowItem v-if="isTemplateMode" :value="TabSettings.Template">
          <VRow>
            <VCol cols="12" md="6">
              <div class="field-title">{{ t("TXT_CODE_80c5409f") }}</div>
              <div class="template-cover cursor-pointer" @click="handleUploadImg">
                <VImg v-if="formData.template.image" :src="formData.template.image" height="180" cover class="rounded-lg" />
                <div v-else class="template-cover-placeholder"><VIcon icon="mdi-image-plus-outline" size="42" /></div>
              </div>
              <VTextField v-model="formData.template.image" class="mt-3" :placeholder="t('TXT_CODE_99a42341')" variant="solo-filled" hide-details />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="formData.template.title" :label="t('TXT_CODE_f4fba0cd')" variant="solo-filled" />
              <VTextarea v-model="formData.template.description" :label="t('TXT_CODE_59cdbec3')" variant="solo-filled" rows="2" />
              <VRow>
                <VCol cols="12" sm="6"><VSelect v-model="formData.template.language" :items="languageOptions" item-title="label" item-value="value" :label="t('TXT_CODE_2a34c50a')" /></VCol>
                <VCol cols="12" sm="6"><VTextField v-model="formData.template.author" :label="t('TXT_CODE_3d56da34')" variant="solo-filled" /></VCol>
              </VRow>
            </VCol>
            <VCol cols="12" sm="6" lg="3"><VSelect v-if="formData.template.setupInfo" v-model="formData.template.setupInfo.type" :items="Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title }))" :label="t('TXT_CODE_c5ace40b')" /></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.gameType" :items="selectOptions.appGameTypeList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_ebfb4831')" /></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.platform" :items="selectOptions.appPlatformList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_1ce1d1d1')" /></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.category" :items="selectOptions.appCategoryList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_2d8a400')" /></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.runtime" :label="t('TXT_CODE_80c85070')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.hardware" :label="t('TXT_CODE_683e3033')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.size" :label="t('TXT_CODE_8dbcf565')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.template.targetLink" :label="t('TXT_CODE_13eac7e1')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VCombobox v-model="formData.template.tags" :label="t('TXT_CODE_9901af98')" :placeholder="t('TXT_CODE_7d839745')" multiple chips closable-chips /></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem :value="TabSettings.Basic">
          <VRow>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VTextField v-model="formData.instance.config.nickname" :label="t('TXT_CODE_f70badb9')" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VSelect v-model="formData.instance.config.type" :items="Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title }))" :label="t('TXT_CODE_2f291d8b')" :disabled="isGlobalTerminal" /></VCol>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VTextField v-model="endTimeText" :label="t('TXT_CODE_fa920c0')" placeholder="YYYY-MM-DD HH:mm:ss" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextarea v-model="formData.instance.config.startCommand" :label="t('TXT_CODE_d12fa808')" :placeholder="isDockerMode ? t('TXT_CODE_98e7c829') : t('TXT_CODE_f50cfe2')" rows="4" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.instance.config.stopCommand" :label="t('TXT_CODE_11cfe3a1')" :placeholder="t('TXT_CODE_83053cd5')" variant="solo-filled" /></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem v-if="!isGlobalTerminal" :value="TabSettings.Docker">
          <VRow>
            <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.processType" :true-value="'docker'" :false-value="'general'" :label="t('TXT_CODE_61a8296e')" :disabled="isGlobalTerminal" color="primary" /></VCol>
            <VCol v-if="isDockerMode" cols="12" lg="8"><DockerImageSelect :model-value="formData.instance.config?.docker?.image ?? ''" :image-select-method="formData.instance.imageSelectMethod ?? 'SELECT'" :daemon-id="daemonId ?? ''" @update:model-value="setDockerImage" @update:image-select-method="(v) => (formData.instance.imageSelectMethod = v)" /></VCol>
            <template v-if="isDockerMode">
              <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.docker.changeWorkdir" :label="t('TXT_CODE_5484094a')" color="primary" /></VCol>
              <VCol cols="12" lg="8"><VTextField v-model="formData.instance.config.docker.workingDir" :label="t('TXT_CODE_81979d0f')" :placeholder="t('TXT_CODE_2082f659')" variant="solo-filled" /></VCol>
              <VCol v-for="item in [
                { key: 'volume', label: 'TXT_CODE_d9c73520' }, { key: 'port', label: 'TXT_CODE_cf88c936' }, { key: 'env', label: 'TXT_CODE_b916a8dc' },
                { key: 'label', label: 'TXT_CODE_g1c43s2h' }, { key: 'capability', label: 'TXT_CODE_bbbd4133' }, { key: 'device', label: 'TXT_CODE_b3a60c78' }
              ]" :key="item.key" cols="12" sm="6" lg="4"><VBtn variant="tonal" block @click="handleEditDockerConfig(item.key as any)">{{ t(item.label) }}: {{ t('TXT_CODE_ad207008') }}</VBtn></VCol>
              <VCol v-if="!isTemplateMode" cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.basePort" type="number" min="0" max="65535" :label="t('TXT_CODE_15f5fb07')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VSelect v-model="formData.instance.config.docker.networkMode" :items="networkModes" item-title="Name" item-value="Name" :label="t('TXT_CODE_efcef926')" @focus="loadNetworkModes" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.networkAliasesText" :label="t('TXT_CODE_10194e6a')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.config.docker.containerName" :label="t('TXT_CODE_c3a3b6b1')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VSwitch v-model="formData.instance.config.docker.privileged" :label="t('TXT_CODE_dc47d2aa')" color="primary" /></VCol>
            </template>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem :value="TabSettings.Advanced">
          <VRow>
            <VCol v-if="!isTemplateMode" cols="12"><VTextField v-model="formData.instance.config.cwd" :label="t('TXT_CODE_ee67e1a3')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.instance.config.updateCommand" :label="t('TXT_CODE_bb0b9711')" :placeholder="UPDATE_CMD_TEMPLATE" :hint="UPDATE_CMD_DESCRIPTION" persistent-hint :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol cols="12" lg="6"><DockerImageSelect :is-allow-empty="true" :is-allow-text="t('TXT_CODE_8aca7994')" :model-value="formData.instance.config?.docker?.updateCommandImage ?? ''" :image-select-method="formData.instance.imageSelectMethod ?? 'SELECT'" :daemon-id="daemonId ?? ''" @update:model-value="setUpdateDockerImage" @update:image-select-method="(v) => (formData.instance.imageSelectMethod = v)" /></VCol>
            <VCol cols="12" lg="3"><VSelect v-model="formData.instance.config.fileCode" :items="TERMINAL_CODE" :label="t('TXT_CODE_f041de90')" /></VCol>
            <VCol cols="12" lg="3"><VTextField v-model="formData.instance.config.runAs" :label="t('TXT_CODE_fffaeb17')" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem v-if="!isGlobalTerminal" :value="TabSettings.ResLimit">
          <VRow>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.cpuUsage" type="number" suffix="%" :label="t('TXT_CODE_53046822')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.config.docker.cpusetCpus" :label="t('TXT_CODE_b0c4e4ae')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memory" type="number" suffix="MB" :label="t('TXT_CODE_6fe24924')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memorySwap" type="number" :label="t('TXT_CODE_a68b3a9c')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.maxSpace" type="number" suffix="GB" :label="t('TXT_CODE_ca61b504')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memorySwappiness" type="number" :label="t('TXT_CODE_5c43374f')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.uploadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_network_upload_limit')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.downloadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_network_download_limit')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VDivider class="my-2" /><div class="section-title">{{ t('TXT_CODE_gpu_section_title') }}</div></VCol>
            <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.docker.gpuEnabled" :label="t('TXT_CODE_gpu_enable')" color="primary" /></VCol>
            <template v-if="formData.instance.config.docker.gpuEnabled">
              <VCol cols="12" lg="4"><VTextField v-model="formData.instance.config.docker.gpuDriver" :label="t('TXT_CODE_gpu_driver')" variant="solo-filled" /></VCol>
              <VCol cols="12" lg="4"><VRadioGroup v-model="gpuAllocMode" inline :label="t('TXT_CODE_gpu_alloc_mode')" @update:model-value="onGpuAllocModeChange"><VRadio value="all" :label="t('TXT_CODE_gpu_alloc_all')" /><VRadio value="count" :label="t('TXT_CODE_gpu_alloc_count')" /><VRadio value="deviceIds" :label="t('TXT_CODE_gpu_alloc_device_ids')" /></VRadioGroup></VCol>
              <VCol v-if="gpuAllocMode === 'count'" cols="12" lg="4"><VTextField v-model.number="formData.instance.config.docker.gpuCount" type="number" min="1" max="128" :label="t('TXT_CODE_gpu_count')" variant="solo-filled" /></VCol>
              <VCol v-if="gpuAllocMode === 'deviceIds'" cols="12" lg="8"><VTextField v-model="gpuDeviceIdsText" :label="t('TXT_CODE_gpu_device_ids')" variant="solo-filled" /></VCol>
            </template>
          </VRow>
        </VTabsWindowItem>
      </VTabsWindow>
    </VForm>
  </AppDialog>
</template>

<style scoped>
.field-title,
.section-title { color: var(--text-color); font-size: 15px; font-weight: 600; margin-bottom: 8px; }
.cursor-pointer { cursor: pointer; }
.template-cover { height: 180px; overflow: hidden; border-radius: 12px; background: rgb(var(--v-theme-surface-variant)); }
.template-cover-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(var(--v-theme-on-surface-variant), 0.5); }
</style>
