import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/randId";
import type { LayoutCard } from "@/types";
import DefaultCard from "@/widgets/DefaultCard.vue";
import EmptyCard from "@/widgets/EmptyCard.vue";
import InstanceBaseInfo from "@/widgets/instance/BaseInfo.vue";
import InstanceCommandHistory from "@/widgets/instance/CommandHistory.vue";
import InstanceFileManager from "@/widgets/instance/FileManager.vue";
import InstanceManagerBtns from "@/widgets/instance/ManagerBtns.vue";
import InstanceModManager from "@/widgets/instance/ModManager.vue";
import InstancePerformance from "@/widgets/instance/Performance.vue";
import Schedule from "@/widgets/instance/Schedule.vue";
import InstanceServerConfigFile from "@/widgets/instance/ServerConfigFile.vue";
import InstanceServerConfigOverview from "@/widgets/instance/ServerConfigOverview.vue";
import InstanceShortcut from "@/widgets/instance/Shortcut.vue";
import Terminal from "@/widgets/instance/Terminal.vue";
import InstanceList from "@/widgets/InstanceList.vue";
import Carousel from "@/widgets/others/Carousel.vue";
import ClockCard from "@/widgets/others/ClockCard.vue";
import IframeCard from "@/widgets/others/IframeCard.vue";
import ImageBox from "@/widgets/others/ImageBox.vue";
import LinkCard from "@/widgets/others/LinkCard.vue";
import MusicCard from "@/widgets/others/MusicCard.vue";
import PluginCard from "@/widgets/others/PluginCard.vue";
import TextCard from "@/widgets/others/TextCard.vue";
import Page404 from "@/widgets/Page404.vue";
import QuickStart from "@/widgets/QuickStart.vue";
import Settings from "@/widgets/Settings.vue";
import QuickStartFlow from "@/widgets/setupApp/QuickStartFlow.vue";
import ShelvesCard from "@/widgets/ShelvesCard.vue";
import TitleCard from "@/widgets/TitleCard.vue";

import { NEW_CARD_TYPE } from "../types/index";
import { LayoutCardHeight } from "./originLayoutConfig";
import { ROLE } from "./router";
import { shallowReactive } from "vue";

// Register specified Vue components for each card.
export const LAYOUT_CARD_TYPES: { [key: string]: any } = shallowReactive({
  Page404,
  TitleCard,
  EmptyCard,
  QuickStart,
  InstanceList,
  Settings,
  Terminal,
  InstanceManagerBtns,
  InstanceBaseInfo,
  InstancePerformance,
  InstanceCommandHistory,
  InstanceServerConfigOverview,
  InstanceServerConfigFile,
  InstanceFileManager,
  InstanceModManager,
  ImageBox,
  QuickStartFlow,
  IframeCard,
  TextCard,
  LinkCard,
  ClockCard,
  Schedule,
  InstanceShortcut,
  DefaultCard,
  Carousel,
  PluginCard,
  MusicCard,
  ShelvesCard
});

export interface NewCardItem extends LayoutCard {
  category: NEW_CARD_TYPE;
  permission: ROLE;
}

export type LayoutCardPoolItemFactory = () => NewCardItem;

export const PLUGIN_LAYOUT_CARD_POOL_FACTORIES = shallowReactive<LayoutCardPoolItemFactory[]>([]);

export function getLayoutCardPool() {
  const LAYOUT_CARD_POOL: NewCardItem[] = [
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "EmptyCard",
      title: t("TXT_CODE_b23e2bab"),
      width: 2,
      description: t("TXT_CODE_b3e2f83e"),
      height: LayoutCardHeight.MINI,
      category: NEW_CARD_TYPE.COMMON
    },
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "TitleCard",
      title: t("TXT_CODE_8981d724"),
      width: 12,
      description: t("TXT_CODE_9466852b"),
      height: LayoutCardHeight.AUTO,
      category: NEW_CARD_TYPE.COMMON
    },

    {
      id: getRandomId(),
      permission: ROLE.USER,
      type: "Terminal",
      title: t("TXT_CODE_71a51d19"),
      width: 6,
      description: t("TXT_CODE_10a6d36f"),
      height: LayoutCardHeight.BIG,
      category: NEW_CARD_TYPE.INSTANCE,
      meta: {
        viewType: "card"
      },
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },



    {
      id: getRandomId(),
      permission: ROLE.ADMIN,
      meta: {},
      type: "Settings",
      title: t("TXT_CODE_b5c7b82d"),
      width: 8,
      description: t("TXT_CODE_e78047a5"),
      height: LayoutCardHeight.MEDIUM,
      category: NEW_CARD_TYPE.OTHER
    },

    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "ImageBox",
      title: t("TXT_CODE_4d993ca4"),
      width: 4,
      description: t("TXT_CODE_6ef5195f"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },

    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "Carousel",
      title: t("TXT_CODE_5a196078"),
      width: 4,
      description: t("TXT_CODE_6ef5195f"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },

    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "IframeCard",
      title: t("TXT_CODE_3ed96265"),
      width: 4,
      description: t("TXT_CODE_db9375a5"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },

    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "TextCard",
      title: t("TXT_CODE_ddcca0b9"),
      width: 4,
      description: t("TXT_CODE_2ca42b39"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },

    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "LinkCard",
      title: t("TXT_CODE_745d8a03"),
      width: 4,
      description: t("TXT_CODE_d6a96ea4"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "ClockCard",
      title: t("TXT_CODE_af143e18"),
      width: 4,
      description: t("TXT_CODE_cf9e259c"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "MusicCard",
      title: t("TXT_CODE_660e2341"),
      width: 4,
      description: t("TXT_CODE_903a9ec9"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstanceShortcut",
      title: t("TXT_CODE_ea0840c9"),
      width: 3,
      description: t("TXT_CODE_3fce7ccb"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstanceFileManager",
      title: t("TXT_CODE_72cce10b"),
      width: 12,
      description: t("TXT_CODE_f49b2787"),
      height: LayoutCardHeight.MEDIUM,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstancePerformance",
      title: t("TXT_CODE_5476e012"),
      width: 4,
      description: t("TXT_CODE_5476e012"),
      height: LayoutCardHeight.MINI,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstanceCommandHistory",
      title: t("TXT_CODE_cmd_history"), // "历史命令"
      width: 4,
      description: t("TXT_CODE_cmd_history"),
      height: LayoutCardHeight.MINI,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstanceBaseInfo",
      title: t("TXT_CODE_eadb4f60"),
      width: 4,
      description: t("TXT_CODE_97e5eccb"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.ADMIN,
      type: "QuickStart",
      title: t("TXT_CODE_e01539f1"),
      meta: {},
      width: 4,
      description: t("TXT_CODE_d628e631"),
      height: LayoutCardHeight.MEDIUM,
      category: NEW_CARD_TYPE.INSTANCE
    },
    {
      id: getRandomId(),
      permission: ROLE.USER,
      meta: {},
      type: "InstanceManagerBtns",
      title: t("TXT_CODE_d2bbb2f1"),
      width: 8,
      description: t("TXT_CODE_1934114b"),
      height: LayoutCardHeight.MEDIUM,
      category: NEW_CARD_TYPE.INSTANCE,
      params: [
        {
          field: "instanceId",
          label: t("TXT_CODE_e6a5c12b"),
          type: "string"
        },
        {
          field: "daemonId",
          label: t("TXT_CODE_72cfab69"),
          type: "string"
        },
        {
          field: "instance",
          label: t("TXT_CODE_cb043d10"),
          type: "instance"
        }
      ]
    },
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "PluginCard",
      title: t("TXT_CODE_5ebec0db"),
      width: 4,
      description: t("TXT_CODE_cb84b22"),
      height: LayoutCardHeight.SMALL,
      category: NEW_CARD_TYPE.COMMON
    },
    {
      id: getRandomId(),
      permission: ROLE.GUEST,
      meta: {},
      type: "ShelvesCard",
      title: t("TXT_CODE_b99cae18"),
      width: 8,
      description: t("TXT_CODE_163e2d0a"),
      height: LayoutCardHeight.MEDIUM,
      category: NEW_CARD_TYPE.COMMON
    }
  ];
  return [...LAYOUT_CARD_POOL, ...PLUGIN_LAYOUT_CARD_POOL_FACTORIES.map((createItem) => createItem())];
}
