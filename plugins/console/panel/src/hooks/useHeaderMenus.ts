import { router, type RouterMetaInfo } from "@/config/router";
import { ctx } from "@/plugin/context";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useUiStore } from "@/stores/useUiStore";
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

export function useHeaderMenus() {
  const { toPage } = useAppRouters();
  const { uiState } = useUiStore();
  const { state: appState, isAdmin, isLogged } = useAppStateStore();

  const handleToPage = (url: string) => {
    uiState.showPhoneMenu = false;
    toPage({ path: url });
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

  return { menus, sidebarItems, handleToPage };
}
