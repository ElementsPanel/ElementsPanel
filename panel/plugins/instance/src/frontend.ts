import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import { ROLE } from "@/config/router";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import LayoutContainer from "@/views/LayoutContainer.vue";
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
import InstanceList from "./widgets/InstanceList.vue";
import QuickStart from "./widgets/QuickStart.vue";
import InstanceBaseInfo from "./widgets/instance/BaseInfo.vue";
import InstanceManagerBtns from "./widgets/instance/ManagerBtns.vue";
import InstanceModManager from "./widgets/instance/ModManager.vue";
import InstancePerformance from "./widgets/instance/Performance.vue";
import Schedule from "./widgets/instance/Schedule.vue";
import InstanceServerConfigFile from "./widgets/instance/ServerConfigFile.vue";
import InstanceServerConfigOverview from "./widgets/instance/ServerConfigOverview.vue";
import InstanceShortcut from "./widgets/instance/Shortcut.vue";
import DeleteInstanceDialog from "./widgets/instance/dialogs/DeleteInstanceDialog.vue";
import QuickStartFlow from "./widgets/setupApp/QuickStartFlow.vue";
import CreateInstanceForm from "./widgets/setupApp/CreateInstanceForm.vue";

const instanceParams: ILayoutCardParams[] = [
  { field: "instanceId", label: t("TXT_CODE_e6a5c12b"), type: "string" },
  { field: "daemonId", label: t("TXT_CODE_72cfab69"), type: "string" },
  { field: "instance", label: t("TXT_CODE_cb043d10"), type: "instance" }
];

const instanceCard = (
  type: string,
  title: () => string,
  description: () => string,
  width: number,
  height: LayoutCardHeight
): LayoutCardPoolItemFactory => {
  return () => ({
    id: getRandomId(),
    permission: ROLE.USER,
    meta: {},
    type,
    title: title(),
    width,
    description: description(),
    height,
    category: NEW_CARD_TYPE.INSTANCE,
    params: instanceParams
  });
};

const cardPoolItems: LayoutCardPoolItemFactory[] = [
  instanceCard(
    "InstanceShortcut",
    () => t("TXT_CODE_ea0840c9"),
    () => t("TXT_CODE_3fce7ccb"),
    3,
    LayoutCardHeight.SMALL
  ),
  instanceCard(
    "InstancePerformance",
    () => t("TXT_CODE_5476e012"),
    () => t("TXT_CODE_5476e012"),
    4,
    LayoutCardHeight.MINI
  ),
  instanceCard(
    "InstanceBaseInfo",
    () => t("TXT_CODE_eadb4f60"),
    () => t("TXT_CODE_97e5eccb"),
    4,
    LayoutCardHeight.SMALL
  ),
  () => ({
    id: getRandomId(),
    permission: ROLE.ADMIN,
    type: "QuickStart",
    title: t("TXT_CODE_e01539f1"),
    meta: {},
    width: 4,
    description: t("TXT_CODE_d628e631"),
    height: LayoutCardHeight.MEDIUM,
    category: NEW_CARD_TYPE.INSTANCE
  }),
  instanceCard(
    "InstanceManagerBtns",
    () => t("TXT_CODE_d2bbb2f1"),
    () => t("TXT_CODE_1934114b"),
    8,
    LayoutCardHeight.MEDIUM
  )
];

export const inject = ["routes", "ui", "actions"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.set("instance", {
    api,
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

  ctx.ui.layoutCard("InstanceList", InstanceList);
  ctx.ui.layoutCard("QuickStart", QuickStart);
  ctx.ui.layoutCard("QuickStartFlow", QuickStartFlow);
  ctx.ui.layoutCard("InstanceManagerBtns", InstanceManagerBtns);
  ctx.ui.layoutCard("InstanceBaseInfo", InstanceBaseInfo);
  ctx.ui.layoutCard("InstancePerformance", InstancePerformance);
  ctx.ui.layoutCard("InstanceServerConfigOverview", InstanceServerConfigOverview);
  ctx.ui.layoutCard("InstanceServerConfigFile", InstanceServerConfigFile);
  ctx.ui.layoutCard("InstanceModManager", InstanceModManager);
  ctx.ui.layoutCard("Schedule", Schedule);
  ctx.ui.layoutCard("InstanceShortcut", InstanceShortcut);
  cardPoolItems.forEach((createItem) => ctx.ui.layoutCardPoolItem(createItem));

  ctx.routes.add({
    path: "/quickstart",
    name: t("TXT_CODE_2799a1dd"),
    component: LayoutContainer,
    meta: { permission: ROLE.ADMIN, mainMenu: false },
    children: [
      {
        path: "/quickstart/minecraft",
        name: t("TXT_CODE_88249aee"),
        component: LayoutContainer,
        meta: { permission: ROLE.ADMIN }
      }
    ]
  });

  ctx.routes.add({
    path: "/instances",
    name: t("TXT_CODE_e21473bc"),
    component: LayoutContainer,
    meta: { mainMenu: true, permission: ROLE.ADMIN },
    children: [
      {
        path: "/instances/terminal",
        name: t("TXT_CODE_524e3036"),
        component: LayoutContainer,
        meta: { permission: ROLE.USER },
        children: [
          {
            path: "/instances/terminal/mods",
            name: t("TXT_CODE_MOD_MANAGER"),
            component: LayoutContainer,
            meta: { permission: ROLE.USER }
          },
          {
            path: "/instances/terminal/serverConfig",
            name: t("TXT_CODE_d07742fe"),
            component: LayoutContainer,
            meta: { permission: ROLE.USER },
            children: [
              {
                path: "/instances/terminal/serverConfig/fileEdit",
                name: t("TXT_CODE_78019c60"),
                component: LayoutContainer,
                meta: { permission: ROLE.USER }
              }
            ]
          },
          {
            path: "/instances/schedule",
            name: t("TXT_CODE_b7d026f8"),
            component: LayoutContainer,
            meta: { permission: ROLE.USER }
          }
        ]
      }
    ]
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
