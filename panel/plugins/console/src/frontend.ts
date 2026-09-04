import "ant-design-vue/dist/reset.css";
import "@/assets/base.scss";
import "@/assets/tools.scss";
import "@/assets/variables.scss";
import "@/assets/variables-dark.scss";
import "@/assets/global.scss";
import "@/assets/bg-extend-theme.scss";
import "@/initLib";

import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import { ROLE } from "@/config/router";
import { initLayoutConfig } from "@/services/layout";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import type { LoginUserInfo } from "@/types/user";
import LayoutContainer from "@/views/LayoutContainer.vue";
import Carousel from "./widgets/others/Carousel.vue";
import ClockCard from "./widgets/others/ClockCard.vue";
import IframeCard from "./widgets/others/IframeCard.vue";
import ImageBox from "./widgets/others/ImageBox.vue";
import LinkCard from "./widgets/others/LinkCard.vue";
import MusicCard from "./widgets/others/MusicCard.vue";
import PluginCard from "./widgets/others/PluginCard.vue";
import TextCard from "./widgets/others/TextCard.vue";
import DefaultCard from "./widgets/DefaultCard.vue";
import EmptyCard from "./widgets/EmptyCard.vue";
import Page404 from "./widgets/Page404.vue";
import TitleCard from "./widgets/TitleCard.vue";
import DesignModeActivator from "./widgets/DesignModeActivator.vue";
import ConsoleApp from "./ConsoleApp.vue";
import { setLoadingTitle } from "@/tools/dom";

const coreCards = [
  ["Page404", Page404],
  ["TitleCard", TitleCard],
  ["EmptyCard", EmptyCard],
  ["ImageBox", ImageBox],
  ["IframeCard", IframeCard],
  ["TextCard", TextCard],
  ["LinkCard", LinkCard],
  ["ClockCard", ClockCard],
  ["DefaultCard", DefaultCard],
  ["Carousel", Carousel],
  ["PluginCard", PluginCard],
  ["MusicCard", MusicCard]
] as const;

const commonCard = (
  type: string,
  title: () => string,
  description: () => string,
  width: number,
  height: LayoutCardHeight,
  category = NEW_CARD_TYPE.COMMON,
  permission = ROLE.GUEST
): LayoutCardPoolItemFactory => {
  return () => ({
    id: getRandomId(),
    permission,
    meta: {},
    type,
    title: title(),
    width,
    description: description(),
    height,
    category
  });
};

const cardPoolItems: LayoutCardPoolItemFactory[] = [
  commonCard(
    "EmptyCard",
    () => t("TXT_CODE_b23e2bab"),
    () => t("TXT_CODE_b3e2f83e"),
    2,
    LayoutCardHeight.MINI
  ),
  commonCard(
    "TitleCard",
    () => t("TXT_CODE_8981d724"),
    () => t("TXT_CODE_9466852b"),
    12,
    LayoutCardHeight.AUTO
  ),
  commonCard(
    "ImageBox",
    () => t("TXT_CODE_4d993ca4"),
    () => t("TXT_CODE_6ef5195f"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "Carousel",
    () => t("TXT_CODE_5a196078"),
    () => t("TXT_CODE_6ef5195f"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "IframeCard",
    () => t("TXT_CODE_3ed96265"),
    () => t("TXT_CODE_db9375a5"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "TextCard",
    () => t("TXT_CODE_ddcca0b9"),
    () => t("TXT_CODE_2ca42b39"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "LinkCard",
    () => t("TXT_CODE_745d8a03"),
    () => t("TXT_CODE_d6a96ea4"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "ClockCard",
    () => t("TXT_CODE_af143e18"),
    () => t("TXT_CODE_cf9e259c"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "MusicCard",
    () => t("TXT_CODE_660e2341"),
    () => t("TXT_CODE_903a9ec9"),
    4,
    LayoutCardHeight.SMALL
  ),
  commonCard(
    "PluginCard",
    () => t("TXT_CODE_5ebec0db"),
    () => t("TXT_CODE_cb84b22"),
    4,
    LayoutCardHeight.SMALL
  )
];

export const inject = ["i18n", "vue", "routes", "ui"];

export async function apply(ctx: PanelFrontendPluginContext) {
  ctx.set("console", { root: ConsoleApp });

  coreCards.forEach(([name, component]) => ctx.ui.layoutCard(name, component));
  cardPoolItems.forEach((createItem) => ctx.ui.layoutCardPoolItem(createItem));

  ctx.routes.add({
    path: "/",
    name: "",
    component: LayoutContainer,
    meta: {
      mainMenu: true,
      redirect: (user: LoginUserInfo | undefined) => {
        if (user?.permission === ROLE.ADMIN) return "/instances";
        if (user?.permission && user.permission >= ROLE.USER) return "/customer";
        return "/login";
      },
      permission: ROLE.USER
    }
  });

  ctx.routes.add({
    path: "/404",
    name: t("TXT_CODE_393c816c"),
    component: LayoutContainer,
    meta: { permission: ROLE.GUEST, mainMenu: false }
  });

  ctx.routes.add({
    path: "/console/design",
    name: "console-design",
    component: DesignModeActivator,
    meta: {
      permission: ROLE.ADMIN,
      mainMenu: false
    }
  });

  ctx.routes.add({
    path: "/customer",
    name: t("TXT_CODE_ec299306"),
    component: LayoutContainer,
    meta: { permission: ROLE.USER, mainMenu: true, onlyDisplayEditMode: true }
  });

  ctx.routes.add({
    path: "/_open_page",
    name: t("TXT_CODE_2cf59872"),
    component: LayoutContainer,
    meta: {
      permission: ROLE.ADMIN,
      mainMenu: true,
      onlyDisplayEditMode: true,
      customClass: ["nav-button-warning"]
    }
  });

  // Layout data belongs to the console shell. A temporary backend failure
  // should not prevent the shell and its routes from loading; the layout store
  // will simply render an empty page until the next reload.
  try {
    setLoadingTitle("Initializing Layout...");
    await initLayoutConfig();
  } catch (error) {
    console.error("Failed to initialize panel layout:", error);
  }
}
