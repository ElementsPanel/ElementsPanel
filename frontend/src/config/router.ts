import { $t as t } from "@/lang/i18n";
import { topProgressBar } from "@/services/TopProgressBar";
import { useAppStateStore } from "@/stores/useAppStateStore";
import type { LoginUserInfo } from "@/types/user";
import LayoutContainer from "@/views/LayoutContainer.vue";
import type { Component } from "vue";
import {
  createRouter,
  createWebHashHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw
} from "vue-router";

export interface RouterMetaInfo {
  icon?: Component | string;
  mainMenu?: boolean;
  permission?: number;
  redirect?:
  | string
  | ((userInfo: LoginUserInfo | undefined,
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ) => string);
  onlyDisplayEditMode?: boolean;
  customClass?: string[];
  condition?: () => boolean;
  public?: boolean;
  immersive?: boolean;
  breadcrumbs?: Array<{
    name: string;
    path: string;
    mainMenu?: boolean;
    permission: number;
  }>;
}

export interface RouterConfig {
  path: string;
  name: string;
  component?: any;
  children?: RouterConfig[];
  meta: RouterMetaInfo;
  redirect?:
  | string
  | ((
    userInfo: LoginUserInfo,
    to: RouteLocationNormalized,
    from: RouteLocationNormalized
  ) => string);
}

export enum ROLE {
  // eslint-disable-next-line no-unused-vars
  ADMIN = 10,
  // eslint-disable-next-line no-unused-vars
  USER = 1,
  // eslint-disable-next-line no-unused-vars
  GUEST = 0
}

const originRouterConfig: RouterConfig[] = [
  {
    path: "/",
    name: "",
    component: LayoutContainer,
    meta: {
      mainMenu: true,
      redirect: (user) => {
        if (user?.permission === ROLE.ADMIN) {
          return "/instances";
        }
        if (user?.permission && user.permission >= ROLE.USER) {
          return "/customer";
        }
        return "/login";
      },
      permission: ROLE.USER
    }
  },
  {
    path: "/settings",
    name: t("TXT_CODE_b5c7b82d"),
    component: LayoutContainer,
    meta: {
      permission: ROLE.ADMIN,
      mainMenu: true,
      customClass: ["nav-button-success"]
    }
  },
  {
    path: "/404",
    name: t("TXT_CODE_393c816c"),
    component: LayoutContainer,
    meta: {
      permission: ROLE.GUEST,
      mainMenu: false
    }
  },
  {
    path: "/customer",
    name: t("TXT_CODE_ec299306"),
    component: LayoutContainer,
    meta: {
      permission: ROLE.USER,
      mainMenu: true,
      onlyDisplayEditMode: true
    }
  },
  {
    path: "/_open_page",
    name: t("TXT_CODE_2cf59872"),
    component: LayoutContainer,
    meta: {
      permission: ROLE.ADMIN, // open page without permission
      mainMenu: true,
      onlyDisplayEditMode: true,
      customClass: ["nav-button-warning"]
    }
  }
];

function routersConfigOptimize(
  config: RouterConfig[],
  list: Array<{ name: string; path: string; permission: number }> = []
) {
  for (const r of config) {
    r.meta.breadcrumbs ??= list;
    if (r.children && r.children instanceof Array) {
      const newList = JSON.parse(JSON.stringify(list));
      newList.push({
        name: r.name,
        path: r.path,
        mainMenu: r.meta.mainMenu,
        permission: r.meta.permission
      });
      routersConfigOptimize(r.children, newList);
    }
  }
  return config;
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: routersConfigOptimize(originRouterConfig) as RouteRecordRaw[]
});

router.beforeEach(async (to, from, next) => {
  topProgressBar.start();
  const { state, updateUserInfo, isAdmin, authEnabled } = useAppStateStore();

  // Without the user plugin every visitor is an anonymous administrator.
  const requiresLogin = authEnabled.value;
  const userPermission = state.userInfo?.permission ?? 0;
  const toPagePermission = Number(to.meta.permission ?? 0);
  const fromRoutePath = router.currentRoute.value.path.trim();
  const toRoutePath = to.path.trim();
  console.info(
    "Router Changed:",
    fromRoutePath,
    "->",
    toRoutePath,
    "\nMyPermission:",
    userPermission,
    "toPagePermission:",
    toPagePermission
  );

  if (to.meta?.redirect) {
    if (typeof to.meta.redirect === "function") {
      const userInfo = state.userInfo;
      return next(to.meta.redirect(userInfo, to, from));
    }
    return next(to.meta.redirect as string);
  }

  if (toRoutePath === "/sso/callback") {
    try {
      await updateUserInfo();
      return next(isAdmin.value ? "/" : "/customer");
    } catch {
      return next("/login");
    }
  }

  if (
    toRoutePath.includes("_open_page") ||
    toRoutePath.startsWith("/sso/") ||
    to.meta.public === true ||
    ["/login", "/404"].includes(toRoutePath)
  ) {
    return next();
  }

  if (!to.name) return next("/404");

  if (requiresLogin && !state.userInfo?.token) return next("/login");

  if (toPagePermission > userPermission && userPermission !== ROLE.ADMIN) {
    return next("/customer");
  }

  if (toPagePermission <= userPermission) {
    next();
  } else {
    next("/404");
  }
});

router.afterEach(() => {
  topProgressBar.done();
});

export { originRouterConfig, router };
