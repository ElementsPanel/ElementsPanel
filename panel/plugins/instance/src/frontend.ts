import { ROLE } from "@/config/router";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import * as api from "./api";
import CmdAssistantDialog from "./components/CmdAssistantDialog/index.vue";
import DockerCapabilityDialog from "./components/DockerCapabilityDialog.vue";
import DockerDeviceDialog from "./components/DockerDeviceDialog.vue";
import DockerPortDialog from "./components/DockerPortDialog.vue";
import DockerVersionSelectDialog from "./components/DockerVersionSelectDialog.vue";
import NodeSelectDialog from "./components/NodeSelectDialog.vue";
import SelectInstances from "./components/SelectInstances.vue";
import TagsDialog from "./components/TagsDialog.vue";
import * as quickStart from "./hooks/quickStartFlow";
import * as instanceHooks from "./hooks/useInstance";
import * as instanceTagHooks from "./hooks/useInstanceTag";
import { useSchedule } from "./hooks/useSchedule";
import { useServerConfig } from "./hooks/useServerConfig";
import { useStartCmdBuilder } from "./hooks/useGenerateStartCmd";
import CreateInstancePage from "./views/CreateInstance.vue";
import InstanceListPage from "./views/InstanceListPage.vue";
import InstanceConsolePage from "./views/InstanceConsolePage.vue";
import Schedule from "./widgets/instance/Schedule.vue";
import InstanceServerConfigFile from "./widgets/instance/ServerConfigFile.vue";
import InstanceServerConfigOverview from "./widgets/instance/ServerConfigOverview.vue";
import DeleteInstanceDialog from "./widgets/instance/dialogs/DeleteInstanceDialog.vue";
import QuickStartFlow from "./widgets/setupApp/QuickStartFlow.vue";
import CreateInstanceForm from "./widgets/setupApp/CreateInstanceForm.vue";
import InstanceDetail from "./widgets/instance/dialogs/InstanceDetail.vue";
import { openInstanceConsole, registerDesktop } from "./desktop";
import { localeMessages } from "./i18n";

export const inject = ["console", "i18n", "routes", "ui", "actions", "desktop"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.set("instance", {
    api,
    openConsole: (instance, daemonId) => openInstanceConsole(ctx, instance, daemonId),
    hooks: {
      ...instanceHooks,
      ...instanceTagHooks,
      ...quickStart,
      useSchedule,
      useServerConfig,
      useStartCmdBuilder
    },
    components: {
      CmdAssistantDialog,
      CreateInstanceForm,
      InstanceDetail,
      DeleteInstanceDialog,
      DockerCapabilityDialog,
      DockerDeviceDialog,
      DockerPortDialog,
      DockerVersionSelectDialog,
      NodeSelectDialog,
      SelectInstances,
      TagsDialog
    }
  });
  registerDesktop(ctx);

  ctx.routes.add({
    path: "/quickstart",
    name: t("TXT_CODE_2799a1dd"),
    component: QuickStartFlow,
    meta: { permission: ROLE.ADMIN, mainMenu: false }
  });

  ctx.routes.add({
    path: "/instances",
    name: t("TXT_CODE_e21473bc"),
    component: InstanceListPage,
    meta: { mainMenu: true, permission: ROLE.ADMIN }
  });

  ctx.routes.add({
    path: "/instances/terminal",
    name: t("TXT_CODE_524e3036"),
    component: InstanceConsolePage,
    meta: {
      permission: ROLE.USER,
      breadcrumbs: [
        {
          name: t("TXT_CODE_e21473bc"),
          path: "/instances",
          mainMenu: true,
          permission: ROLE.ADMIN
        }
      ]
    }
  });

  ctx.routes.add({
    path: "/instances/terminal/serverConfig",
    name: t("TXT_CODE_d07742fe"),
    component: InstanceServerConfigOverview,
    meta: { permission: ROLE.USER }
  });

  ctx.routes.add({
    path: "/instances/terminal/serverConfig/fileEdit",
    name: t("TXT_CODE_78019c60"),
    component: InstanceServerConfigFile,
    meta: { permission: ROLE.USER }
  });

  ctx.routes.add({
    path: "/instances/schedule",
    name: t("TXT_CODE_b7d026f8"),
    component: Schedule,
    meta: {
      permission: ROLE.USER,
      breadcrumbs: [
        {
          name: t("TXT_CODE_e21473bc"),
          path: "/instances",
          mainMenu: true,
          permission: ROLE.ADMIN
        }
      ]
    }
  });

  ctx.routes.add({
    path: "/instances/create",
    name: t("TXT_CODE_5a74975b"),
    component: CreateInstancePage,
    meta: {
      permission: ROLE.ADMIN,
      mainMenu: false,
      breadcrumbs: [
        {
          name: t("TXT_CODE_e21473bc"),
          path: "/instances",
          mainMenu: true,
          permission: ROLE.ADMIN
        }
      ]
    }
  });
}
