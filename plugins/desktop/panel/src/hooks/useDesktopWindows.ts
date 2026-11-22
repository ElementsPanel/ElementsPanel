import { computed, markRaw, onUnmounted, reactive, type Component, type Ref } from "vue";
import { useRouter } from "vue-router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  ctx,
  type DesktopInstanceShortcut,
  type PanelFrontendDesktopView,
  type PanelFrontendDesktopWindowRequest,
  type PanelFrontendInstanceAction
} from "@elements-panel/sdk";
import { migrateLegacyInstanceWindow } from "../legacyWindows";
import {
  getDesktopIcon,
  DesktopOutlined,
  TeamOutlined,
  EditOutlined,
  PictureOutlined,
  UserOutlined
} from "../icons";
import type { TaskbarWindow } from "../widgets/desktop/DesktopTaskbar.vue";
import type { DesktopApp, DesktopWindowProps, SavedDesktopWindow } from "../types";
import type { WindowState } from "../windowContext";

const ICON_MAP: Record<string, Component | string> = {
  users: TeamOutlined,
  "file-editor": EditOutlined,
  "image-viewer": PictureOutlined,
  "user-info": UserOutlined
};

interface Options {
  availableDesktopApps: Ref<DesktopApp[]>;
  pluginInstanceActions: Ref<PanelFrontendInstanceAction[]>;
  instanceShortcuts: Map<string, DesktopInstanceShortcut>;
  desktopUserInfoWindow: Ref<Component | undefined>;
  findView: (id: string) => PanelFrontendDesktopView | undefined;
  savedViewProps: (win: DesktopWindowProps) => Record<string, unknown>;
  saveDesktopLayout: () => void;
}

export function useDesktopWindows(options: Options) {
  const {
    availableDesktopApps,
    pluginInstanceActions,
    instanceShortcuts,
    desktopUserInfoWindow,
    findView,
    savedViewProps,
    saveDesktopLayout
  } = options;

  const router = useRouter();
  const windows = reactive<Map<string, WindowState>>(new Map());
  let nextZIndex = 100;
  let windowOffset = 0;

  const restoreWindows = (savedWindows: SavedDesktopWindow[]) => {
    windows.clear();
    for (const savedWindow of savedWindows) {
      const win = migrateLegacyInstanceWindow(savedWindow);
      const content = win.content;
      if (typeof content !== "string") continue;
      const view = findView(content);
      const props = savedViewProps(win);
      if (view?.accepts && !view.accepts(props)) continue;
      if (
        !view &&
        !content.startsWith("panel-plugin:") &&
        !content.startsWith("instance-action:") &&
        !["backup", "java-manager", "file-manager", "term-config"].includes(content) &&
        !ICON_MAP[content]
      )
        continue;
      const desktopApp = availableDesktopApps.value.find(
        (app) => app.windowContent === content || app.id === content
      );
      const instanceActionId =
        content === "backup"
          ? "backup"
          : content === "java-manager"
          ? "java-manager"
          : content === "file-manager"
          ? "file-manager"
          : content === "term-config"
          ? "terminal-config"
          : typeof content === "string" && content.startsWith("instance-action:")
          ? content.slice("instance-action:".length)
          : undefined;
      const instanceAction = instanceActionId
        ? pluginInstanceActions.value.find((action) => action.id === instanceActionId)
        : undefined;
      if (content.startsWith("panel-plugin:") && !desktopApp?.component) continue;
      if (instanceActionId && !instanceAction?.desktopComponent) continue;
      const icon =
        view?.icon ||
        desktopApp?.icon ||
        (instanceActionId
          ? getDesktopIcon(instanceActionId, instanceAction?.mdiIcon || instanceAction?.icon)
          : undefined) ||
        ICON_MAP[content] ||
        DesktopOutlined;
      const zIndex = typeof win.zIndex === "number" ? win.zIndex : ++nextZIndex;
      if (zIndex > nextZIndex) nextZIndex = zIndex;
      windows.set(win.id, {
        id: win.id,
        title: win.title || win.id,
        icon,
        visible: true,
        minimized: false,
        maximized: win.maximized || false,
        zIndex,
        content: instanceActionId
          ? `instance-action:${instanceActionId}`
          : desktopApp?.windowContent || content,
        initialX: win.x ?? 100,
        initialY: win.y ?? 60,
        initialWidth: win.width ?? 800,
        initialHeight: win.height ?? 500,
        instanceId: win.instanceId,
        daemonId: win.daemonId,
        type: win.type,
        filePath: win.filePath,
        fileName: win.fileName,
        props,
        component:
          view?.component ||
          desktopApp?.component ||
          (instanceAction?.desktopComponent ? markRaw(instanceAction.desktopComponent) : undefined)
      });
    }
  };

  const openWindow = (appId: string) => {
    const shortcut = instanceShortcuts.get(appId);
    if (shortcut) {
      openInstanceConsole(
        { instanceUuid: shortcut.instanceId, config: { nickname: shortcut.name } },
        shortcut.daemonId
      );
      return;
    }
    const app = availableDesktopApps.value.find((a) => a.id === appId);
    if (!app) return;

    if (app.windowContent && findView(app.windowContent)) {
      openPluginWindow({ id: app.id, view: app.windowContent, title: app.label });
      return;
    }

    if (!app.component && app.windowContent?.startsWith("panel-plugin:") && app.route) {
      void router.push(app.route);
      return;
    }

    const existing = windows.get(appId);
    if (existing) {
      existing.minimized = false;
      existing.visible = true;
      focusWindow(appId);
      return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 80 + windowOffset * 30;
    const offsetY = 40 + windowOffset * 30;

    windows.set(appId, {
      id: appId,
      title: app.label,
      icon: app.icon,
      visible: true,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex,
      content: app.windowContent || "default",
      initialX: offsetX,
      initialY: offsetY,
      initialWidth: app.initialWidth || 980,
      initialHeight: app.initialHeight || 580,
      component: app.component
    });
    saveDesktopLayout();
  };

  const openInstanceConsole = (instance: unknown, daemonId: string) =>
    ctx.get("instance")?.openConsole(instance, daemonId);

  const openFileEditorWindow = (
    instanceId: string,
    daemonId: string,
    filePath: string,
    fileName: string
  ) => {
    const windowId = `file-editor-${instanceId}-${Date.now()}`;

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 140 + windowOffset * 30;
    const offsetY = 100 + windowOffset * 30;

    windows.set(windowId, {
      id: windowId,
      title: fileName,
      icon: EditOutlined,
      visible: true,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex,
      content: "file-editor",
      initialX: offsetX,
      initialY: offsetY,
      initialWidth: 900,
      initialHeight: 600,
      instanceId: instanceId,
      daemonId: daemonId,
      filePath: filePath,
      fileName: fileName
    });
    saveDesktopLayout();
  };

  const openImageViewerWindow = (
    instanceId: string,
    daemonId: string,
    filePath: string,
    fileName: string
  ) => {
    const windowId = `image-viewer-${instanceId}-${Date.now()}`;

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 140 + windowOffset * 30;
    const offsetY = 100 + windowOffset * 30;

    windows.set(windowId, {
      id: windowId,
      title: fileName,
      icon: PictureOutlined,
      visible: true,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex,
      content: "image-viewer",
      initialX: offsetX,
      initialY: offsetY,
      initialWidth: 800,
      initialHeight: 600,
      instanceId: instanceId,
      daemonId: daemonId,
      filePath: filePath,
      fileName: fileName
    });
    saveDesktopLayout();
  };

  const openPluginWindow = (request: PanelFrontendDesktopWindowRequest): boolean => {
    const view = findView(request.view);
    const action = request.view.startsWith("instance-action:")
      ? pluginInstanceActions.value.find(
          (item) => item.id === request.view.slice("instance-action:".length)
        )
      : undefined;
    const props = request.props ?? {};
    if ((!view && !action?.desktopComponent) || (view?.accepts && !view.accepts(props)))
      return false;
    if (action && (!props.instanceId || !props.daemonId)) return false;
    const existing = windows.get(request.id);
    if (existing) {
      existing.minimized = false;
      existing.visible = true;
      focusWindow(request.id);
      return true;
    }
    windowOffset = (windowOffset + 1) % 8;
    const title = view?.title ?? action!.title;
    windows.set(request.id, {
      id: request.id,
      content: request.view,
      title: request.title || (typeof title === "function" ? title() : title),
      icon: view?.icon || getDesktopIcon(action!.id, action!.mdiIcon || action!.icon),
      visible: true,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex,
      initialX: 120 + windowOffset * 30,
      initialY: 80 + windowOffset * 30,
      initialWidth: view?.initialWidth || action?.desktopInitialWidth || 800,
      initialHeight: view?.initialHeight || action?.desktopInitialHeight || 500,
      component: markRaw(view?.component || action!.desktopComponent!),
      props,
      instanceId: typeof props.instanceId === "string" ? props.instanceId : undefined,
      daemonId: typeof props.daemonId === "string" ? props.daemonId : undefined
    });
    saveDesktopLayout();
    return true;
  };
  const releaseOpener = ctx.desktop.provideOpener(openPluginWindow);
  onUnmounted(releaseOpener);

  const openUserInfoWindow = () => {
    if (!desktopUserInfoWindow.value) return;
    const windowId = "user-info";
    const existing = windows.get(windowId);

    if (existing) {
      existing.minimized = false;
      existing.visible = true;
      focusWindow(windowId);
      return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 140 + windowOffset * 30;
    const offsetY = 100 + windowOffset * 30;

    windows.set(windowId, {
      id: windowId,
      title: t("TXT_CODE_COMMON_USER_PROFILE"),
      icon: UserOutlined,
      visible: true,
      minimized: false,
      maximized: false,
      zIndex: ++nextZIndex,
      content: "user-info",
      initialX: offsetX,
      initialY: offsetY,
      initialWidth: 600,
      initialHeight: 500
    });
    saveDesktopLayout();
  };

  const closeWindow = (id: string) => {
    const win = windows.get(id);
    if (win) win.visible = false;
    saveDesktopLayout();
  };

  const removeClosedWindow = (id: string) => {
    if (windows.get(id)?.visible === false) windows.delete(id);
  };

  const minimizeWindow = (id: string) => {
    const win = windows.get(id);
    if (win) win.minimized = true;
  };

  const maximizeWindow = (id: string) => {
    const win = windows.get(id);
    if (win) {
      win.maximized = !win.maximized;
      saveDesktopLayout();
    }
  };

  const focusWindow = (id: string) => {
    const win = windows.get(id);
    if (win && win.zIndex !== nextZIndex) {
      win.zIndex = ++nextZIndex;
    }
  };

  const toggleWindow = (id: string) => {
    const win = windows.get(id);
    if (!win) return;
    if (win.minimized) {
      win.minimized = false;
      focusWindow(id);
    } else if (win.zIndex === nextZIndex) {
      win.minimized = true;
    } else {
      focusWindow(id);
    }
  };

  const handleWindowMoved = (id: string, newX: number, newY: number) => {
    const win = windows.get(id);
    if (win) {
      win.initialX = newX;
      win.initialY = newY;
      saveDesktopLayout();
    }
  };

  const handleWindowResized = (
    id: string,
    newX: number,
    newY: number,
    newWidth: number,
    newHeight: number
  ) => {
    const win = windows.get(id);
    if (win) {
      win.initialX = newX;
      win.initialY = newY;
      win.initialWidth = newWidth;
      win.initialHeight = newHeight;
      saveDesktopLayout();
    }
  };

  const activeWindowId = computed(() => {
    let maxZ = -1;
    let activeId = "";
    windows.forEach((win) => {
      if (!win.minimized && win.visible && win.zIndex > maxZ) {
        maxZ = win.zIndex;
        activeId = win.id;
      }
    });
    return activeId;
  });

  const taskbarWindows = computed<TaskbarWindow[]>(() => {
    const list: TaskbarWindow[] = [];
    windows.forEach((win) => {
      if (!win.visible) return;
      list.push({
        id: win.id,
        title: win.title,
        icon: win.icon,
        minimized: win.minimized,
        active: win.id === activeWindowId.value
      });
    });
    return list;
  });

  const handleReorderWindows = (newOrder: string[]) => {
    const newWindowsMap = new Map<string, WindowState>();

    newOrder.forEach((id) => {
      const win = windows.get(id);
      if (win) {
        newWindowsMap.set(id, win);
      }
    });

    windows.forEach((win, id) => {
      if (!newWindowsMap.has(id)) {
        newWindowsMap.set(id, win);
      }
    });

    windows.clear();
    newWindowsMap.forEach((win, id) => {
      windows.set(id, win);
    });
    saveDesktopLayout();
  };

  const navigateToRoute = (appId: string) => {
    const app = availableDesktopApps.value.find((a) => a.id === appId);
    if (app?.route) {
      router.push(app.route);
    }
  };

  return {
    windows,
    restoreWindows,
    openWindow,
    openInstanceConsole,
    openFileEditorWindow,
    openImageViewerWindow,
    openPluginWindow,
    releaseOpener,
    openUserInfoWindow,
    closeWindow,
    removeClosedWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    toggleWindow,
    handleWindowMoved,
    handleWindowResized,
    activeWindowId,
    taskbarWindows,
    handleReorderWindows,
    navigateToRoute
  };
}
