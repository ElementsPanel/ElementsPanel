import { useMountComponent } from "@/hooks/useMountComponent";
import { usePluginService, type FrontendInstanceService } from "@elements-panel/sdk";
import type { UserInstance } from "@/types/user";

import KvOptionsDialogVue from "@/components/fc/KvOptionsDialog.vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import TaskLoadingDialog from "./TaskLoadingDialog.vue";

// The file manager's own dialogs — upload, download-from-URL and the image
// viewer — moved to `plugins/file`, which owns the components they mount.

interface DockerConfigItem {
  host: string;
  container: string;
}
interface PortConfigItem extends DockerConfigItem {
  protocol: string;
}

interface DockerEnvItem {
  label: string;
  value: string;
}

interface DockerLabelItem {
  label: string;
  value: string;
}

interface DockerCapabilityItem {
  label: string;
  value: string;
}

interface DockerDeviceItem {
  PathOnHost: string;
  PathInContainer: string;
  CgroupPermissions: string;
}

function instanceComponents() {
  const instance = usePluginService<FrontendInstanceService>("instance");
  if (!instance) throw new Error('Panel frontend plugin "instance" is not loaded.');
  return instance.components;
}

export async function useSelectInstances(data: UserInstance[] = []) {
  return useMountComponent({ data }).mount<UserInstance[]>(instanceComponents().SelectInstances);
}

export async function useCmdAssistantDialog() {
  return await useMountComponent().mount<string>(instanceComponents().CmdAssistantDialog);
}

export async function usePortEditDialog(data: PortConfigItem[] = []) {
  return useMountComponent({ data }).mount<PortConfigItem[]>(instanceComponents().DockerPortDialog);
}

export async function useVolumeEditDialog(data: DockerConfigItem[] = []) {
  return useMountComponent({
    data,
    subTitle: t("TXT_CODE_DOCKER_EXTRA_VOLUMES_VARIABLE_HINT"),
    title: t("TXT_CODE_COMMON_MOUNT_DIRECTORY_INTO_CONTAINER"),
    columns: [
      {
        align: "center",
        dataIndex: "host",
        title: t("TXT_CODE_COMMON_HOST_DIRECTORY")
      },
      {
        align: "center",
        dataIndex: "container",
        title: t("TXT_CODE_COMMON_CONTAINER_DIRECTORY")
      }
    ],
    textarea: true
  }).mount<DockerConfigItem[]>(KvOptionsDialogVue);
}

export async function useDockerEnvEditDialog(data: DockerEnvItem[] = []) {
  return useMountComponent({
    data,
    title: t("TXT_CODE_COMMON_CONTAINER_ENVIRONMENT_VARIABLES"),
    columns: [
      {
        align: "center",
        dataIndex: "label",
        title: t("TXT_CODE_COMMON_VARIABLE_NAME")
      },
      {
        align: "center",
        dataIndex: "value",
        title: t("TXT_CODE_COMMON_VARIABLE_VALUE")
      }
    ],
    textarea: true
  }).mount<DockerEnvItem[]>(KvOptionsDialogVue);
}

export async function useDockerLabelEditDialog(data: DockerLabelItem[] = []) {
  return useMountComponent({
    data,
    title: t("TXT_CODE_DOCKER_CONTAINER_LABELS"),
    subTitle: t("TXT_CODE_MIM_BB1_EA"),
    columns: [
      {
        align: "center",
        dataIndex: "label",
        title: t("TXT_CODE_COMMON_VARIABLE_NAME")
      },
      {
        align: "center",
        dataIndex: "value",
        title: t("TXT_CODE_COMMON_VARIABLE_VALUE")
      }
    ],
    textarea: true
  }).mount<DockerLabelItem[]>(KvOptionsDialogVue);
}

export async function useDockerCapabilityEditDialog(data: DockerCapabilityItem[] = []) {
  return useMountComponent({
    data,
    title: t("TXT_CODE_COMMON_CAPABILITIES"),
    subTitle: t("TXT_CODE_COMMON_MANAGE_CONTAINER_CAPABILITIES"),
    textarea: false
  }).mount<DockerCapabilityItem[]>(instanceComponents().DockerCapabilityDialog);
}

export async function useDockerDeviceEditDialog(data: DockerDeviceItem[] = []) {
  return useMountComponent({
    data,
    title: t("TXT_CODE_COMMON_DEVICES"),
    subTitle: t("TXT_CODE_COMMON_ALLOWS_A_CONTAINER_TO_ACCESS_SPECIFIC_HOST_HARDWARE_DEVICES"),
    textarea: false
  }).mount<DockerDeviceItem[]>(instanceComponents().DockerDeviceDialog);
}

export async function openLoadingDialog(title: string, text: string, subTitle?: string) {
  const component = useMountComponent({
    title,
    text,
    subTitle
  }).load<InstanceType<typeof TaskLoadingDialog>>(TaskLoadingDialog);
  return component;
}

export async function openInstanceTagsEditor(
  instanceId: string,
  daemonId: string,
  tags: string[],
  tagsTips?: string[]
) {
  return await useMountComponent({
    instanceId,
    daemonId,
    tagsTips,
    tags
  })
    .load<any>(instanceComponents().TagsDialog)
    .openDialog();
}

export async function useDeleteInstanceDialog(instanceId: string, daemonId: string) {
  return await useMountComponent({ instanceId, daemonId }).mount<boolean>(
    instanceComponents().DeleteInstanceDialog
  );
}

export async function openNodeSelectDialog(targetPlatforms?: string[]) {
  const dialog = useMountComponent({ targetPlatforms }).load<any>(
    instanceComponents().NodeSelectDialog
  );
  return dialog!.openDialog();
}

export async function openDockerVersionSelectDialog() {
  const dialog = useMountComponent().load<any>(instanceComponents().DockerVersionSelectDialog);
  return dialog!.openDialog();
}
