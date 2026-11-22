import { onMounted, onUnmounted, watch, type Ref } from "vue";
import { getInstanceShortcutId, parseDesktopInstanceShortcut } from "@elements-panel/sdk";
import { getDesktopLayoutConfig, setDesktopLayoutConfig } from "../api";
import type { useDesktopIcons } from "./useDesktopIcons";
import type { useDesktopWindows } from "./useDesktopWindows";
import type { useDesktopApplications } from "./useDesktopApplications";

interface Options {
  isLogged: Ref<boolean>;
  icons: ReturnType<typeof useDesktopIcons>;
  windowManager: ReturnType<typeof useDesktopWindows>;
  applications: ReturnType<typeof useDesktopApplications>;
}

export function useDesktopLayout(options: Options) {
  const { isLogged, icons, windowManager, applications } = options;

  const {
    desktopShortcutIds,
    instanceShortcuts,
    iconPositions,
    selectedIconIds,
    shortcutsLoaded,
    cancelIconInteraction,
    normalizeIconPositions
  } = icons;
  const { windows, restoreWindows } = windowManager;
  const { pluginDesktopApps, pluginInstanceActions, availableDesktopApps, pluginViews } =
    applications;
  const { execute: executeGetLayout } = getDesktopLayoutConfig();
  const { execute: executeSaveLayout } = setDesktopLayoutConfig();

  let saveLayoutTimer: ReturnType<typeof setTimeout> | null = null;
  let layoutLoaded = false;

  const saveDesktopLayout = () => {
    if (!isLogged.value || !layoutLoaded) return;
    if (saveLayoutTimer) clearTimeout(saveLayoutTimer);
    saveLayoutTimer = setTimeout(async () => {
      try {
        const windowList: any[] = [];
        windows.forEach((win) => {
          if (!win.visible) return;
          windowList.push({
            id: win.id,
            content: win.content,
            title: win.title,
            x: win.initialX,
            y: win.initialY,
            width: win.initialWidth,
            height: win.initialHeight,
            maximized: win.maximized,
            zIndex: win.zIndex,
            instanceId: win.instanceId,
            daemonId: win.daemonId,
            type: win.type,
            filePath: win.filePath,
            fileName: win.fileName,
            props: win.props
          });
        });
        const iconList: any[] = [];
        iconPositions.forEach((pos, id) => {
          iconList.push({ id, x: pos.x, y: pos.y });
        });
        await executeSaveLayout({
          data: {
            windows: windowList,
            icons: iconList,
            shortcuts: [...desktopShortcutIds],
            instanceShortcuts: [...instanceShortcuts.values()],
            updatedAt: Date.now()
          }
        });
      } catch (e) {}
    }, 500);
  };

  let registeredPluginDesktopAppIds = new Set(pluginDesktopApps.value.map((app) => app.id));

  watch(
    pluginDesktopApps,
    (apps) => {
      const nextIds = new Set(apps.map((app) => app.id));
      let layoutChanged = false;

      for (const id of registeredPluginDesktopAppIds) {
        if (nextIds.has(id)) continue;
        layoutChanged = desktopShortcutIds.delete(id) || layoutChanged;
        layoutChanged = iconPositions.delete(id) || layoutChanged;
        selectedIconIds.delete(id);

        const content = `panel-plugin:${id}`;
        for (const [windowId, win] of windows) {
          if (win.content !== content) continue;
          windows.delete(windowId);
          layoutChanged = true;
        }
      }

      registeredPluginDesktopAppIds = nextIds;
      if (layoutChanged) saveDesktopLayout();
    },
    { flush: "sync" }
  );

  let registeredInstanceActionIds = new Set(pluginInstanceActions.value.map((action) => action.id));

  watch(
    pluginInstanceActions,
    (actions) => {
      const nextIds = new Set(actions.map((action) => action.id));
      let layoutChanged = false;
      for (const id of registeredInstanceActionIds) {
        if (nextIds.has(id)) continue;
        const content = `instance-action:${id}`;
        for (const [windowId, win] of windows) {
          if (win.content !== content) continue;
          windows.delete(windowId);
          layoutChanged = true;
        }
      }
      registeredInstanceActionIds = nextIds;
      if (layoutChanged) saveDesktopLayout();
    },
    { flush: "sync" }
  );

  let registeredViewIds = new Set(pluginViews.value.map((view) => view.id));
  watch(
    pluginViews,
    (views) => {
      const next = new Set(views.map((view) => view.id));
      let changed = false;
      for (const [id, win] of windows) {
        if (registeredViewIds.has(win.content) && !next.has(win.content)) {
          windows.delete(id);
          changed = true;
        }
      }
      if (registeredViewIds.has("instance-console") && !next.has("instance-console")) {
        for (const id of instanceShortcuts.keys()) {
          iconPositions.delete(id);
          selectedIconIds.delete(id);
        }
        instanceShortcuts.clear();
        changed = true;
      }
      registeredViewIds = next;
      if (changed) saveDesktopLayout();
    },
    { flush: "sync" }
  );

  const loadDesktopLayout = async () => {
    layoutLoaded = false;
    cancelIconInteraction();
    selectedIconIds.clear();
    try {
      const result = await executeGetLayout();
      const layout = result?.value;
      const availableAppIds = new Set(availableDesktopApps.value.map((app) => app.id));
      desktopShortcutIds.clear();
      instanceShortcuts.clear();
      iconPositions.clear();
      if (layout && Array.isArray(layout.shortcuts)) {
        for (const id of layout.shortcuts) {
          if (typeof id === "string" && availableAppIds.has(id)) {
            desktopShortcutIds.add(id);
          }
        }
      }
      if (layout && Array.isArray(layout.instanceShortcuts)) {
        for (const value of layout.instanceShortcuts.slice(0, 100 - desktopShortcutIds.size)) {
          const shortcut = parseDesktopInstanceShortcut(value);
          if (shortcut) instanceShortcuts.set(getInstanceShortcutId(shortcut), shortcut);
        }
      }
      shortcutsLoaded.value = true;

      if (layout && Array.isArray(layout.windows) && layout.windows.length > 0) {
        restoreWindows(layout.windows);
      }
      if (layout && Array.isArray(layout.icons)) {
        for (const icon of layout.icons) {
          if (
            (desktopShortcutIds.has(icon.id) || instanceShortcuts.has(icon.id)) &&
            typeof icon.x === "number" &&
            typeof icon.y === "number"
          ) {
            iconPositions.set(icon.id, { x: icon.x, y: icon.y });
          }
        }
      }
      layoutLoaded = true;
      if (normalizeIconPositions()) saveDesktopLayout();
    } catch (e) {
      desktopShortcutIds.clear();
      instanceShortcuts.clear();
      iconPositions.clear();
      shortcutsLoaded.value = true;
      layoutLoaded = true;
    }
  };

  onMounted(async () => {
    if (isLogged.value) {
      await loadDesktopLayout();
    }
  });

  onUnmounted(() => {
    if (saveLayoutTimer) clearTimeout(saveLayoutTimer);
  });

  return { saveDesktopLayout, loadDesktopLayout };
}
