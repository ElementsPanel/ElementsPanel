import { computed, markRaw, type Ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  ctx,
  usePluginService,
  type FrontendFileManagerService,
  type FrontendUserService,
  type PanelFrontendDesktopApp,
  type PanelFrontendInstanceAction
} from "@elements-panel/sdk";
import { getDesktopIcon, TeamOutlined } from "../icons";
import type { DesktopApp, DesktopWindowProps } from "../types";

interface Options {
  isAdmin: Ref<boolean>;
}

export function useDesktopApplications(options: Options) {
  const { isAdmin } = options;

  const user = computed(() => usePluginService<FrontendUserService>("user"));
  const desktopLoginWindow = computed(() => user.value?.desktopLoginWindow);
  const desktopUsersWindow = computed(() => user.value?.desktopUsers);
  const desktopUserInfoWindow = computed(() => user.value?.desktopUserInfo);
  const desktopStartMenuAvatar = computed(() => user.value?.desktopStartMenuAvatar);

  const fileManager = computed(() => usePluginService<FrontendFileManagerService>("file"));
  const desktopFileEditorWindow = computed(() => fileManager.value?.DesktopFileEditor);
  const desktopImageViewerWindow = computed(() => fileManager.value?.DesktopImageViewer);
  const getDesktopAppLabel = (app: PanelFrontendDesktopApp) =>
    typeof app.label === "function" ? app.label() : app.label;

  const pluginDesktopApps = computed<DesktopApp[]>(() =>
    ctx.desktop.apps
      .filter((app) =>
        typeof app.condition === "function"
          ? app.condition()
          : app.condition === undefined || app.condition
      )
      .map((app) => ({
        id: app.id,
        label: getDesktopAppLabel(app),
        icon: getDesktopIcon(app.id, app.icon),
        color: app.color || "#1677ff",
        route: app.route,
        windowContent: app.view || `panel-plugin:${app.id}`,
        component: app.component ? markRaw(app.component) : undefined,
        initialWidth: app.initialWidth,
        initialHeight: app.initialHeight
      }))
  );

  const pluginInstanceActions = computed<PanelFrontendInstanceAction[]>(() => [
    ...ctx.actions.instances
  ]);

  const availableDesktopApps = computed<DesktopApp[]>(() => {
    const apps: DesktopApp[] = [];
    if (!isAdmin.value) return pluginDesktopApps.value;
    if (desktopUsersWindow.value) {
      apps.push({
        id: "users",
        label: t("TXT_CODE_COMMON_USERS"),
        icon: TeamOutlined,
        color: "#722ed1",
        route: "/users",
        windowContent: "users"
      });
    }
    return [...apps, ...pluginDesktopApps.value];
  });

  const pluginViews = computed(() =>
    ctx.desktop.views.filter((view) => !view.condition || view.condition())
  );
  const viewsById = computed(() => new Map(pluginViews.value.map((view) => [view.id, view])));
  const findView = (id: string) => viewsById.value.get(id);
  const savedViewProps = (win: DesktopWindowProps) =>
    win.props ?? {
      instanceId: win.instanceId,
      daemonId: win.daemonId,
      type: win.type
    };

  return {
    user,
    desktopLoginWindow,
    desktopUsersWindow,
    desktopUserInfoWindow,
    desktopStartMenuAvatar,
    fileManager,
    desktopFileEditorWindow,
    desktopImageViewerWindow,
    getDesktopAppLabel,
    pluginDesktopApps,
    pluginInstanceActions,
    availableDesktopApps,
    pluginViews,
    viewsById,
    findView,
    savedViewProps
  };
}
