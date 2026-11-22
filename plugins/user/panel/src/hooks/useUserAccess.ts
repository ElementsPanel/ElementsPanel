import { onMounted, ref } from "vue";
import type { UserInstance } from "@elementspanel/epanel-plugin-console/types/user";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useSelectInstances } from "@elementspanel/epanel-plugin-console/components/fc";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import WarningDialog from "@elementspanel/epanel-plugin-console/components/fc/WarningDialog";
import { useMountComponent } from "@elementspanel/epanel-plugin-console/hooks/useMountComponent";
import { useUserGrants } from "./useUserGrants";

interface Options {
  userUuid: string;
}

export function useUserAccess(options: Options) {
  const { userUuid } = options;

  const grants = useUserGrants();
  const dataSource = grants.instances;
  const deleteDialog = ref<{ open: boolean; item: UserInstance | null }>({
    open: false,
    item: null
  });

  const refreshTableData = async () => {
    if (userUuid == null) return;
    try {
      await grants.load(String(userUuid), { forceRequest: true });
    } catch (err: any) {
      reportErrorMsg(err.message);
    }
  };

  const saveData = async () => {
    try {
      await grants.save(String(userUuid));
      message.success(t("TXT_CODE_COMMON_UPDATE_SUCCESSFUL"));
      await refreshTableData();
    } catch (err: any) {
      reportErrorMsg(err.message);
    }
  };

  const handleDelete = async () => {
    const deletedInstance = deleteDialog.value.item;
    deleteDialog.value.open = false;
    if (!deletedInstance) return;
    dataSource.value = dataSource.value.filter(
      (instance) =>
        !(
          instance.daemonId === deletedInstance.daemonId &&
          instance.instanceUuid === deletedInstance.instanceUuid
        )
    );
    await saveData();
  };

  const assignApp = async () => {
    try {
      const selectedInstances = await useSelectInstances(dataSource.value);
      const warningInstances = (selectedInstances || [])
        .filter(
          (instance) =>
            typeof instance.config?.docker?.image === "string" && !instance.config.docker.image
        )
        .map((instance) => instance.nickname);
      if (warningInstances.length > 0) {
        const component = (
          await useMountComponent({
            title: t("TXT_CODE_COMMON_SAFETY_WARNING"),
            subTitle:
              t("TXT_CODE_USER_UNPROTECTED_INSTANCES_WARNING") + warningInstances.join(", "),
            checkText: t(
              "TXT_CODE_COMMON_I_M_AWARE_THAT_MALICIOUS_PROGRAMS_AND_OR_PERSONELL_CAN_GAIN_ACCESS_TO_MY_MACHINE_AS"
            )
          })
        ).load<InstanceType<typeof WarningDialog>>(WarningDialog);
        await component.openDialog();
      }
      if (selectedInstances) {
        dataSource.value = selectedInstances;
        await saveData();
      }
    } catch (err: any) {
      reportErrorMsg(err.message);
    }
  };

  onMounted(refreshTableData);

  return { grants, dataSource, deleteDialog, refreshTableData, saveData, handleDelete, assignApp };
}
