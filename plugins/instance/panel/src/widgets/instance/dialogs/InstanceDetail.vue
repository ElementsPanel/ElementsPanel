<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import {
  useDockerCapabilityEditDialog,
  useDockerDeviceEditDialog,
  useDockerEnvEditDialog,
  useDockerLabelEditDialog,
  usePortEditDialog,
  useVolumeEditDialog
} from "@elementspanel/epanel-plugin-console/components/fc";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import type { FrontendFileManagerService } from "@elements-panel/sdk";
import { usePluginService } from "@elements-panel/sdk";
import { INSTANCE_TYPE_TRANSLATION } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { isCN, t } from "@elementspanel/epanel-plugin-i18n";
import { getNetworkModeList } from "@elementspanel/epanel-plugin-console/services/apis/envImage";
import { updateAnyInstanceConfig } from "@elementspanel/epanel-plugin-console/services/apis/instance";
import { dockerPortsArray } from "@elementspanel/epanel-plugin-console/tools/common";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import type { DockerNetworkModes, FilterOption, InstanceDetail, QuickStartPackages } from "@elementspanel/epanel-plugin-console/types";
import { defaultQuickStartPackages, SEARCH_ALL_KEY, TERMINAL_CODE } from "@elementspanel/epanel-plugin-console/types/const";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import dayjs, { type Dayjs } from "dayjs";
import _ from "lodash";
import { computed, nextTick, ref, unref, useId } from "vue";
import { GLOBAL_INSTANCE_NAME } from "@elementspanel/epanel-plugin-console/config/const";
import { dayjsToTimestamp, timestampToDayjs } from "@elementspanel/epanel-plugin-console/tools/time";
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
const UPDATE_CMD_DESCRIPTION = t("TXT_CODE_COMMON_PROVIDE_THE_FOLLOWING_VARIABLE_STRINGS_INSTANCE_ID_INSTANCE_INSTALLATION_DIRECTORY");
const UPDATE_CMD_TEMPLATE =
  t("TXT_CODE_COMMON_FOR_EXAMPLE") +
  '"C:/SteamCMD/steamcmd.exe" +login anonymous +force_install_dir "{mcsm_workspace}" "+app_update 380870 validate" +quit';

const formType = ref<"template" | "normal">("normal");
const isEditMode = ref(false);
const isTemplateMode = computed(() => formType.value === "template");
const title = computed(() =>
  isTemplateMode.value
    ? isEditMode.value
      ? t("TXT_CODE_COMMON_EDIT_TEMPLATE")
      : t("TXT_CODE_COMMON_ADD_TEMPLATE")
    : t("TXT_CODE_INSTANCE_SETTINGS_TITLE")
);
const { isPhone } = useScreen();

const formRef = ref<InstanceType<typeof VForm>>();
const formId = useId();
const requiredRule = (message: string) => (value: unknown) =>
  !!String(value ?? "").trim() || t(message);
const commandRules = [
  (value: unknown) => isDockerMode.value || requiredRule("TXT_CODE_COMMON_ENTER_STARTUP_COMMAND")(value),
  (value: unknown) => !String(value ?? "").includes("\n") || t("TXT_CODE_COMMON_YOU_CANNOT_INCLUDE_MULTIPLE_LINES_IN_YOUR_STARTUP_PROGRAM_THIS_HAS_TO_BE_A_ONE_LINER")
];
const fieldTabs: Record<string, TabSettings> = {
  nickname: TabSettings.Basic, startCommand: TabSettings.Basic,
  [`${formId}-image`]: TabSettings.Docker, [`${formId}-networkMode`]: TabSettings.Docker,
  cwd: TabSettings.Advanced
};
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
  await nextTick();
  formRef.value?.resetValidation();
};

const endTimeText = computed({
  get: () => (formData.value.instance.dayjsEndTime ? dayjs(formData.value.instance.dayjsEndTime).format("YYYY-MM-DD HH:mm:ss") : ""),
  set: (value: string) => {
    formData.value.instance.dayjsEndTime = value ? dayjs(value) : undefined;
  }
});

const validateForm = async () => {
  const result = await formRef.value?.validate();
  if (!result?.valid) {
    activeKey.value = fieldTabs[String(result?.errors[0]?.id)] ?? activeKey.value;
    return false;
  }
  if (isTemplateMode.value) {
    const template = formData.value.template;
    if (!template.title?.trim()) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_A_TEMPLATE_NAME"));
    if (!template.description?.trim()) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_A_TEMPLATE_DESCRIPTION"));
    if (!template.language) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_A_LANGUAGE"));
    if (!template.platform) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_A_RUNTIME_PLATFORM"));
    if (!template.gameType) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_A_PRIMARY_CATEGORY"));
    if (!template.category) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_A_SECONDARY_CATEGORY"));
    if (!template.image) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_A_COVER_IMAGE_URL"));
    if (!template.author?.trim()) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_THE_TEMPLATE_AUTHOR"));
    if (!template.runtime?.trim()) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_ENVIRONMENT_REQUIREMENTS"));
    if (!template.hardware?.trim()) throw new Error(t("TXT_CODE_COMMON_PLEASE_ENTER_HARDWARE_REQUIREMENTS"));
    if (!template.setupInfo?.type) throw new Error(t("TXT_CODE_COMMON_PLEASE_SELECT_A_GAME_TYPE"));
  }
  return true;
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
    if (!await validateForm()) return;
    if (isTemplateMode.value) {
      emit("save-template", _.cloneDeep(formData.value.template), templateIndex.value);
      open.value = false;
      message.success(isEditMode.value ? t("TXT_CODE_COMMON_SAVED") : t("TXT_CODE_COMMON_CREATE_SUCCESS"));
      formData.value.template = _.cloneDeep(defaultQuickStartPackages);
      return;
    }
    const postData = encodeFormData();
    await execute({ params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" }, data: postData.config! });
    emit("update");
    open.value = false;
    message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
  } catch (error: any) {
    console.error(error);
    reportErrorMsg(error?.message ?? t("TXT_CODE_COMMON_FAILED_TO_SAVE_PLEASE_CHECK_THE_CONFIGURATION"));
  }
};

const handleEditDockerConfig = async (type: "port" | "volume" | "env" | "label" | "device" | "capability") => {
  const cfg = docker.value;
  if (!cfg) return;
  if (type === "port") {
    const result = await usePortEditDialog(dockerPortsArray(cfg.ports || []));
    if (!result) return;
    cfg.ports = result.map((v) => `${v.host}:${v.container}/${v.protocol}`);
  } else if (type === "volume") {
    const result = await useVolumeEditDialog((cfg.extraVolumes || []).map((v) => { const [host, container] = v.split("|"); return { host: host || "", container: container || "" }; }));
    if (!result) return;
    cfg.extraVolumes = result.map((v) => `${v.host}|${v.container}`);
  } else if (type === "env") {
    const result = await useDockerEnvEditDialog((cfg.env || []).map((v) => { const [label, ...rest] = v.split("="); return { label: label || "", value: rest.join("=") }; }));
    if (!result) return;
    cfg.env = result.map((v) => `${v.label}=${v.value}`);
  } else if (type === "label") {
    const result = await useDockerLabelEditDialog((cfg.labels || []).map((v) => { const [label, ...rest] = v.split("="); return { label: label || "", value: rest.join("=") }; }));
    if (!result) return;
    cfg.labels = result.map((v) => `${v.label}=${v.value}`);
  } else if (type === "capability") {
    const all = [...new Set([...(cfg.capAdd || []), ...(cfg.capDrop || [])])];
    const result = await useDockerCapabilityEditDialog(all.map((label) => ({ label, value: cfg.capAdd?.includes(label) ? "add" : "drop" })));
    if (!result) return;
    cfg.capAdd = result.filter((v) => v.value === "add").map((v) => v.label);
    cfg.capDrop = result.filter((v) => v.value === "drop").map((v) => v.label);
  } else {
    const result = await useDockerDeviceEditDialog((cfg.devices || []).map((v) => { const [PathOnHost, PathInContainer, CgroupPermissions] = v.split("|"); return { PathOnHost: PathOnHost || "", PathInContainer: PathInContainer || "", CgroupPermissions: CgroupPermissions || "" }; }));
    if (!result) return;
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
  <AppDialog v-model:open="open" :title="title" :max-width="isPhone ? '100%' : '1200px'" :mask-closable="false" :confirm-loading="isLoading" :ok-text="t('TXT_CODE_COMMON_SAVE')" @ok="submit">
    <div v-if="!formData.instance.config" class="text-medium-emphasis">{{ t("TXT_CODE_INSTANCE_CONFIG_INVALID_HINT") }}</div>
    <VForm v-else ref="formRef" validate-on="input lazy" @submit.prevent="submit">
      <VTabs v-model="activeKey" color="primary" show-arrows>
        <VTab v-if="isTemplateMode" :value="TabSettings.Template">{{ t("TXT_CODE_COMMON_TEMPLATE_INFORMATION") }}</VTab>
        <VTab :value="TabSettings.Basic">{{ t("TXT_CODE_COMMON_BASIC_SETTINGS") }}</VTab>
        <VTab v-if="!isGlobalTerminal" :value="TabSettings.Docker">{{ t("TXT_CODE_COMMON_CONTAINERIZATION") }}</VTab>
        <VTab :value="TabSettings.Advanced">{{ t("TXT_CODE_COMMON_ADVANCED_SETTINGS") }}</VTab>
        <VTab v-if="!isGlobalTerminal" :value="TabSettings.ResLimit">{{ t("TXT_CODE_COMMON_CONTAINER_LIMITS") }}</VTab>
      </VTabs>
      <VTabsWindow v-model="activeKey" class="pt-4">
        <VTabsWindowItem v-if="isTemplateMode" :value="TabSettings.Template">
          <VRow>
            <VCol cols="12" md="6">
              <div class="field-title">{{ t("TXT_CODE_COMMON_COVER_IMAGE") }}</div>
              <div class="template-cover cursor-pointer" @click="handleUploadImg">
                <VImg v-if="formData.template.image" :src="formData.template.image" height="180" cover class="rounded-lg" />
                <div v-else class="template-cover-placeholder"><VIcon icon="mdi-image-plus-outline" size="42" /></div>
              </div>
              <VTextField v-model="formData.template.image" class="mt-3" :placeholder="t('TXT_CODE_COMMON_IE_HTTPS_EXAMPLE_COM_IMAGE_PNG')" variant="solo-filled" hide-details />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField v-model="formData.template.title" :label="t('TXT_CODE_COMMON_TEMPLATE_NAME')" variant="solo-filled" />
              <VTextarea v-model="formData.template.description" :label="t('TXT_CODE_COMMON_DESCRIPTION')" variant="solo-filled" rows="2" />
              <VRow>
                <VCol cols="12" sm="6"><VSelect v-model="formData.template.language" :items="languageOptions" item-title="label" item-value="value" :label="t('TXT_CODE_COMMON_LANGUAGE')">
                  <template #no-data><Empty :icon="false" compact /></template>
                </VSelect></VCol>
                <VCol cols="12" sm="6"><VTextField v-model="formData.template.author" :label="t('TXT_CODE_COMMON_TEMPLATE_AUTHOR_PROVIDER')" variant="solo-filled" /></VCol>
              </VRow>
            </VCol>
            <VCol cols="12" sm="6" lg="3"><VSelect v-if="formData.template.setupInfo" v-model="formData.template.setupInfo.type" :items="Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title }))" :label="t('TXT_CODE_COMMON_GAME_TYPE')">
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.gameType" :items="selectOptions.appGameTypeList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_COMMON_PRIMARY_CATEGORY_GAME_NAME')">
              <template #no-data><Empty :icon="false" compact /></template>
            </VCombobox></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.platform" :items="selectOptions.appPlatformList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_COMMON_RUNTIME_PLATFORM')">
              <template #no-data><Empty :icon="false" compact /></template>
            </VCombobox></VCol>
            <VCol cols="12" sm="6" lg="3"><VCombobox v-model="formData.template.category" :items="selectOptions.appCategoryList?.filter((item) => item.value !== SEARCH_ALL_KEY)" item-title="label" item-value="value" :label="t('TXT_CODE_COMMON_SECONDARY_CATEGORY_VERSION_TYPE')">
              <template #no-data><Empty :icon="false" compact /></template>
            </VCombobox></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.runtime" :label="t('TXT_CODE_COMMON_ENVIRONMENT_REQUIREMENTS')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.hardware" :label="t('TXT_CODE_COMMON_HARDWARE_REQUIREMENTS')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="4"><VTextField v-model="formData.template.size" :label="t('TXT_CODE_COMMON_PACKAGE_SIZE_OPTIONAL')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.template.targetLink" :label="t('TXT_CODE_COMMON_PACKAGE_DOWNLOAD_URL_OPTIONAL')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VCombobox v-model="formData.template.tags" :label="t('TXT_CODE_COMMON_TAGS_OPTIONAL')" :placeholder="t('TXT_CODE_COMMON_EG_APPLE_BANANA_CHERRY')" multiple chips closable-chips>
              <template #no-data><Empty :icon="false" compact /></template>
            </VCombobox></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem :value="TabSettings.Basic" eager>
          <VRow>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VTextField v-model="formData.instance.config.nickname" name="nickname" :rules="isGlobalTerminal ? [] : [requiredRule('TXT_CODE_COMMON_PLEASE_ENTER_THE_INSTANCE_NAME')]" :label="t('TXT_CODE_COMMON_INSTANCE_NAME')" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VSelect v-model="formData.instance.config.type" :items="Object.entries(INSTANCE_TYPE_TRANSLATION).map(([value, title]) => ({ value, title }))" :label="t('TXT_CODE_COMMON_INSTANCE_TYPE')" :disabled="isGlobalTerminal">
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect></VCol>
            <VCol v-if="!isTemplateMode" cols="12" lg="4"><VTextField v-model="endTimeText" :label="t('TXT_CODE_COMMON_EXPIRE')" placeholder="YYYY-MM-DD HH:mm:ss" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextarea v-model="formData.instance.config.startCommand" name="startCommand" :rules="isTemplateMode ? [] : commandRules" :label="t('TXT_CODE_COMMON_STARTUP_COMMAND')" :placeholder="isDockerMode ? t('TXT_CODE_COMMON_LEAVE_EMPTY_TO_USE_DEFAULT_DOCKER_IMAGE_COMMAND') : t('TXT_CODE_COMMON_ENTER_STARTUP_COMMAND')" rows="4" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.instance.config.stopCommand" :label="t('TXT_CODE_COMMON_INSTANCE_SHUTDOWN_COMMAND')" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_AN_INSTANCE_SHUTDOWN_COMMAND_SUCH_AS_STOP_EXIT_C_ETC')" variant="solo-filled" /></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem v-if="!isGlobalTerminal" :value="TabSettings.Docker" eager>
          <VRow>
            <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.processType" :true-value="'docker'" :false-value="'general'" :label="t('TXT_CODE_COMMON_ENABLE_DOCKER_CONTAINER')" :disabled="isGlobalTerminal" color="primary" /></VCol>
            <VCol v-if="isDockerMode" cols="12" lg="8"><DockerImageSelect :id="`${formId}-image`" :rules="isTemplateMode ? [] : [requiredRule('TXT_CODE_COMMON_PLEASE_SELECT_AN_INSTANCE_IMAGE')]" :model-value="formData.instance.config?.docker?.image ?? ''" :image-select-method="formData.instance.imageSelectMethod ?? 'SELECT'" :daemon-id="daemonId ?? ''" @update:model-value="setDockerImage" @update:image-select-method="(v) => (formData.instance.imageSelectMethod = v)" /></VCol>
            <template v-if="isDockerMode">
              <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.docker.changeWorkdir" :label="t('TXT_CODE_COMMON_CHANGE_CONTAINER_WORKING_DIRECTORY')" color="primary" /></VCol>
              <VCol cols="12" lg="8"><VTextField v-model="formData.instance.config.docker.workingDir" :label="t('TXT_CODE_COMMON_WORKING_DIRECTORY_IN_CONTAINER')" :placeholder="t('TXT_CODE_COMMON_NOTE_IF_THIS_IS_EMPTY_THE_FILES_IN_THE_FILE_MANAGEMENT_WILL_NOT_BE_BOUND_TO')" variant="solo-filled" /></VCol>
              <VCol v-for="item in [
                { key: 'volume', label: 'TXT_CODE_COMMON_MOUNT_ADDITIONAL_DIRECTORIES' }, { key: 'port', label: 'TXT_CODE_COMMON_OPEN_PORTS' }, { key: 'env', label: 'TXT_CODE_COMMON_ENVIRONMENT_VARIABLES' },
                { key: 'label', label: 'TXT_CODE_DOCKER_CONTAINER_LABELS' }, { key: 'capability', label: 'TXT_CODE_COMMON_CAPABILITIES' }, { key: 'device', label: 'TXT_CODE_COMMON_DEVICES' }
              ]" :key="item.key" cols="12" sm="6" lg="4"><VBtn variant="tonal" block @click="handleEditDockerConfig(item.key as any)">{{ t(item.label) }}: {{ t('TXT_CODE_COMMON_EDIT') }}</VBtn></VCol>
              <VCol v-if="!isTemplateMode" cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.basePort" type="number" min="0" max="65535" :label="t('TXT_CODE_COMMON_ASSIGNED_STARTING_PORT')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VSelect v-model="formData.instance.config.docker.networkMode" :id="`${formId}-networkMode`" :rules="isTemplateMode ? [] : [requiredRule('TXT_CODE_COMMON_PLEASE_SELECT_NETWORK_MODE')]" :items="networkModes" item-title="Name" item-value="Name" :label="t('TXT_CODE_COMMON_NETWORK_MODE')" @focus="loadNetworkModes">
                <template #no-data><Empty :icon="false" compact /></template>
              </VSelect></VCol>
              <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.networkAliasesText" :label="t('TXT_CODE_COMMON_NETWORK_ALIASES')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.config.docker.containerName" :label="t('TXT_CODE_COMMON_CONTAINER_NAME')" variant="solo-filled" /></VCol>
              <VCol cols="12" sm="6" lg="4"><VSwitch v-model="formData.instance.config.docker.privileged" :label="t('TXT_CODE_COMMON_PRIVILEGED_MODE')" color="primary" /></VCol>
            </template>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem :value="TabSettings.Advanced" eager>
          <VRow>
            <VCol v-if="!isTemplateMode" cols="12"><VTextField v-model="formData.instance.config.cwd" name="cwd" :rules="[requiredRule('TXT_CODE_COMMON_PLEASE_ENTER_WORKING_DIRECTORY')]" :label="t('TXT_CODE_COMMON_WORKING_DIRECTORY')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VTextField v-model="formData.instance.config.updateCommand" :label="t('TXT_CODE_COMMON_UPDATE_OR_INSTALL_COMMAND')" :placeholder="UPDATE_CMD_TEMPLATE" :hint="UPDATE_CMD_DESCRIPTION" persistent-hint :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
            <VCol cols="12" lg="6"><DockerImageSelect :is-allow-empty="true" :is-allow-text="t('TXT_CODE_COMMON_INHERIT_RUNTIME_IMAGE')" :model-value="formData.instance.config?.docker?.updateCommandImage ?? ''" :image-select-method="formData.instance.imageSelectMethod ?? 'SELECT'" :daemon-id="daemonId ?? ''" @update:model-value="setUpdateDockerImage" @update:image-select-method="(v) => (formData.instance.imageSelectMethod = v)" /></VCol>
            <VCol cols="12" lg="3"><VSelect v-model="formData.instance.config.fileCode" :items="TERMINAL_CODE" :label="t('TXT_CODE_COMMON_FILE_ENCODING')">
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect></VCol>
            <VCol cols="12" lg="3"><VTextField v-model="formData.instance.config.runAs" :label="t('TXT_CODE_COMMON_RUN_START_COMMAND_AS_USER')" :disabled="isGlobalTerminal" variant="solo-filled" /></VCol>
          </VRow>
        </VTabsWindowItem>

        <VTabsWindowItem v-if="!isGlobalTerminal" :value="TabSettings.ResLimit">
          <VRow>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.cpuUsage" type="number" suffix="%" :label="t('TXT_CODE_COMMON_LIMIT_CPU_USAGE_PERCENTAGE')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model="formData.instance.config.docker.cpusetCpus" :label="t('TXT_CODE_COMMON_CPU_CORE_ASSIGNMENT')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memory" type="number" suffix="MB" :label="t('TXT_CODE_COMMON_MAXIMUM_MEMORY_IN_MB')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memorySwap" type="number" :label="t('TXT_CODE_COMMON_MAXIMUM_SPAWN_MEMORY')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.maxSpace" type="number" suffix="GB" :label="t('TXT_CODE_COMMON_MAXIMUM_STORAGE_SPACE')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.memorySwappiness" type="number" :label="t('TXT_CODE_COMMON_VIRTUAL_MEMORY_USAGE_PREFERENCE')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.uploadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_NETWORK_UPLOAD_LIMIT')" variant="solo-filled" /></VCol>
            <VCol cols="12" sm="6" lg="4"><VTextField v-model.number="formData.instance.config.docker.downloadSpeedLimit" type="number" suffix="KB/s" :label="t('TXT_CODE_NETWORK_DOWNLOAD_LIMIT')" variant="solo-filled" /></VCol>
            <VCol cols="12"><VDivider class="my-2" /><div class="section-title">{{ t('TXT_CODE_GPU_SECTION_TITLE') }}</div></VCol>
            <VCol cols="12" lg="4"><VSwitch v-model="formData.instance.config.docker.gpuEnabled" :label="t('TXT_CODE_GPU_ENABLE')" color="primary" /></VCol>
            <template v-if="formData.instance.config.docker.gpuEnabled">
              <VCol cols="12" lg="4"><VTextField v-model="formData.instance.config.docker.gpuDriver" :label="t('TXT_CODE_GPU_DRIVER')" variant="solo-filled" /></VCol>
              <VCol cols="12" lg="4"><VRadioGroup v-model="gpuAllocMode" inline :label="t('TXT_CODE_GPU_ALLOC_MODE')" @update:model-value="onGpuAllocModeChange"><VRadio value="all" :label="t('TXT_CODE_GPU_ALLOC_ALL')" /><VRadio value="count" :label="t('TXT_CODE_GPU_ALLOC_COUNT')" /><VRadio value="deviceIds" :label="t('TXT_CODE_GPU_ALLOC_DEVICE_IDS')" /></VRadioGroup></VCol>
              <VCol v-if="gpuAllocMode === 'count'" cols="12" lg="4"><VTextField v-model.number="formData.instance.config.docker.gpuCount" type="number" min="1" max="128" :label="t('TXT_CODE_GPU_COUNT')" variant="solo-filled" /></VCol>
              <VCol v-if="gpuAllocMode === 'deviceIds'" cols="12" lg="8"><VTextField v-model="gpuDeviceIdsText" :label="t('TXT_CODE_GPU_DEVICE_IDS')" variant="solo-filled" /></VCol>
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
