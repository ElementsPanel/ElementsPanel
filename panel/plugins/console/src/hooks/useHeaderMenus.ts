import { router, type RouterMetaInfo } from "@/config/router";
import { ctx } from "@/plugin/context";
import { useAppRouters } from "@/hooks/useAppRouters";
import { t } from "@/lang/i18n";
import { logoutUser } from "@/services/apis/index";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { useUiStore } from "@/stores/useUiStore";
import { AppTheme } from "@/types/const";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import type { Component } from "vue";
import { computed } from "vue";

/** Sidebar item: route link */
export type SidebarRouteEntry = {
  type: "route";
  path: string;
  name: string | symbol | undefined;
  icon?: Component | string;
  customClass?: string[];
};

const mdiIconMap: Record<string, string> = {
  BgColorsOutlined: "mdi-palette-outline",
  DesktopOutlined: "mdi-monitor",
  GithubFilled: "mdi-github",
  LogoutOutlined: "mdi-logout",
  UserOutlined: "mdi-account-outline"
};

const getMdiIcon = (icon: unknown, title?: string): string => {
  if (typeof icon === "string" && icon.startsWith("mdi-")) return icon;
  const component = icon as
    | { name?: string; displayName?: string; __name?: string; type?: { name?: string; __name?: string } }
    | undefined;
  const iconName =
    component?.name ??
    component?.displayName ??
    component?.__name ??
    component?.type?.name ??
    component?.type?.__name;
  return (iconName && mdiIconMap[iconName]) || (title === "GitHub" ? "mdi-github" : "mdi-help-circle-outline");
};

export function useHeaderMenus() {
  const { toPage } = useAppRouters();
  const { setTheme } = useAppConfigStore();
  const { uiState } = useUiStore();
  const { state: appTools } = useAppToolsStore();
  const { state: appState, isAdmin, isLogged, authEnabled } = useAppStateStore();

  const handleToPage = (url: string) => {
    uiState.showPhoneMenu = false;
    toPage({ path: url });
  };

  const onClickIcon = () => {
    window.open("https://github.com/MCSManager/MCSManager", "_blank");
  };

  const menus = computed(() => {
    void ctx.routes.revision;
    return router
      .getRoutes()
      .filter((v) => {
        if (v.path === "/" || !v.name) return false;
        const metaInfo = v.meta as RouterMetaInfo;
        if (metaInfo.condition && !metaInfo.condition()) {
          return false;
        }
        if (isAdmin.value) {
          return metaInfo.mainMenu === true;
        }
        return (
          metaInfo.mainMenu === true &&
          isLogged.value &&
          Number(appState.userInfo?.permission) >= Number(metaInfo.permission)
        );
      })
      .map((r) => ({
        name: r.name,
        path: r.path,
        meta: r.meta,
        customClass: r.meta.customClass ?? []
      }));
  });

  const appMenuGroups = computed(() => {
    const coreMenus = [
      {
        iconText: "",
        title: "GitHub",
        icon: "mdi-github",
        mdiIcon: "mdi-github",
        onlyPC: true,
        onlyHeader: true,
        click: onClickIcon
      },
      {
        title: t("TXT_CODE_5d88a9b"),
        leftSideTitle: t("TXT_CODE_ee01c10c"),
        icon: "mdi-palette-outline",
        mdiIcon: "mdi-palette-outline",
        click: (key: string) => {
          setTheme(Number(key) as AppTheme);
        },
        onlyPC: false,
        menus: [
          { value: AppTheme.AUTO, title: t("TXT_CODE_dc8de4ff") },
          { value: AppTheme.LIGHT, title: t("TXT_CODE_673eac8e") },
          { value: AppTheme.DARK, title: t("TXT_CODE_5e4a370d") }
        ]
      },
      {
        title: t("TXT_CODE_8c3164c9"),
        icon: "mdi-account-outline",
        mdiIcon: "mdi-account-outline",
        click: () => {
          appTools.showUserInfoDialog = true;
        },
        conditions: authEnabled.value && isLogged.value,
        onlyPC: false
      },
      {
        title: t("TXT_CODE_2c69ab15"),
        icon: "mdi-logout",
        mdiIcon: "mdi-logout",
        click: async () => {
          Modal.confirm({
            title: t("TXT_CODE_9654b91c"),
            async onOk() {
              await logoutUser().execute();
              message.success(t("TXT_CODE_11673d8c"));
              setTimeout(() => (window.location.href = "/"), 400);
            }
          });
        },
        customClass: ["nav-button-danger"],
        // Nothing to log out of when the "user" plugin is absent.
        conditions: authEnabled.value && isLogged.value,
        onlyPC: false
      }
    ];
    const pluginMenus = ctx.menus.appMenus.map((item) => ({
      ...item,
      title: typeof item.title === "function" ? item.title() : item.title,
      mdiIcon:
        item.mdiIcon ??
        getMdiIcon(item.icon, typeof item.title === "function" ? item.title() : item.title),
      leftSideTitle:
        typeof item.leftSideTitle === "function" ? item.leftSideTitle() : item.leftSideTitle,
      conditions:
        typeof item.conditions === "function"
          ? item.conditions()
          : item.conditions === undefined
          ? true
          : item.conditions,
      menus: item.menus?.map((menu) => ({
        value: menu.value,
        title: typeof menu.title === "function" ? menu.title() : menu.title
      }))
    }));
    return { coreMenus, pluginMenus };
  });

  const appMenus = computed<any[]>(() => {
    const { coreMenus, pluginMenus } = appMenuGroups.value;
    return [...coreMenus, ...pluginMenus];
  });

  /** The sidebar owns route navigation; application actions live in the header. */
  const sidebarItems = computed((): SidebarRouteEntry[] =>
    menus.value.map((r) => ({
      type: "route",
      path: r.path,
      name: r.name,
      icon: (r.meta as RouterMetaInfo).icon,
      customClass: Array.isArray(r.customClass) ? r.customClass : []
    }))
  );

  return { menus, appMenus, sidebarItems, handleToPage };
}
