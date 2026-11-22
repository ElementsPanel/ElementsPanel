import { computed, nextTick, reactive, type Ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import {
  CloseOutlined,
  CloseSquareOutlined,
  DeleteOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  MinusOutlined
} from "../icons";
import type { ContextMenuItem } from "../widgets/desktop/DesktopContextMenu.vue";
import type { useDesktopIcons } from "./useDesktopIcons";
import type { useDesktopWindows } from "./useDesktopWindows";

interface Options {
  showLoginOverlay: Ref<boolean>;
  icons: ReturnType<typeof useDesktopIcons>;
  windowManager: ReturnType<typeof useDesktopWindows>;
  saveDesktopLayout: () => void;
}

export function useDesktopContextMenu(options: Options) {
  const { showLoginOverlay, icons, windowManager, saveDesktopLayout } = options;

  const { selectedIconIds, desktopIconsRef, removeDesktopShortcuts } = icons;
  const { windows, closeWindow, minimizeWindow, maximizeWindow } = windowManager;
  const ctxMenu = reactive({
    visible: false,
    x: 0,
    y: 0,
    targetWindowId: null as string | null,
    targetShortcutIds: [] as string[],
    isTitlebar: false
  });
  let contextMenuRequest = 0;

  const closeContextMenu = () => {
    contextMenuRequest++;
    ctxMenu.visible = false;
  };

  const openContextMenu = async (
    event: MouseEvent,
    target: {
      windowId?: string;
      shortcutId?: string;
      titlebar?: boolean;
      desktopSelection?: boolean;
    } = {}
  ) => {
    event.preventDefault();
    const request = ++contextMenuRequest;
    ctxMenu.visible = false;
    ctxMenu.x = event.clientX;
    ctxMenu.y = event.clientY;
    ctxMenu.targetWindowId = target.windowId ?? null;
    ctxMenu.targetShortcutIds =
      target.shortcutId || target.desktopSelection ? [...selectedIconIds] : [];
    ctxMenu.isTitlebar = target.titlebar ?? false;
    await nextTick();
    if (request === contextMenuRequest && !showLoginOverlay.value) ctxMenu.visible = true;
  };

  const ctxMenuItems = computed<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (ctxMenu.targetShortcutIds.length) {
      const shortcutIds = [...ctxMenu.targetShortcutIds];
      items.push({
        label: t("TXT_CODE_DESKTOP_REMOVE_SHORTCUT"),
        icon: DeleteOutlined,
        action: () => removeDesktopShortcuts(shortcutIds)
      });
      return items;
    }

    if (ctxMenu.targetWindowId) {
      if (ctxMenu.isTitlebar) {
        const win = windows.get(ctxMenu.targetWindowId);
        if (win) {
          items.push({
            label: t("TXT_CODE_DESKTOP_MINIMIZE"),
            icon: MinusOutlined,
            action: () => {
              if (ctxMenu.targetWindowId) {
                minimizeWindow(ctxMenu.targetWindowId);
              }
            }
          });
          items.push({
            label: win.maximized ? t("TXT_CODE_DESKTOP_RESTORE") : t("TXT_CODE_DESKTOP_MAXIMIZE"),
            icon: win.maximized ? FullscreenExitOutlined : FullscreenOutlined,
            action: () => {
              if (ctxMenu.targetWindowId) {
                maximizeWindow(ctxMenu.targetWindowId);
              }
            }
          });
        }
      }

      items.push({
        label: t("TXT_CODE_COMMON_CLOSE"),
        icon: CloseOutlined,
        action: () => {
          if (ctxMenu.targetWindowId) {
            closeWindow(ctxMenu.targetWindowId);
          }
        }
      });
    }

    items.push({
      label: t("TXT_CODE_DESKTOP_CLOSE_ALL"),
      icon: CloseSquareOutlined,
      action: () => {
        windows.clear();
        saveDesktopLayout();
      }
    });

    return items;
  });

  const onDesktopContextMenu = (e: MouseEvent) => {
    if (showLoginOverlay.value) return;
    void openContextMenu(e, {
      desktopSelection: desktopIconsRef.value?.contains(e.target as Node)
    });
  };

  const onTaskbarContextMenu = (e: MouseEvent, id: string) => {
    void openContextMenu(e, { windowId: id });
  };

  const onTitlebarContextMenu = (e: MouseEvent, id: string) => {
    void openContextMenu(e, { windowId: id, titlebar: true });
  };

  const onIconContextMenu = (e: MouseEvent, id: string) => {
    if (!selectedIconIds.has(id)) {
      selectedIconIds.clear();
      selectedIconIds.add(id);
    }
    void openContextMenu(e, { shortcutId: id });
  };

  const onDesktopKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Delete" || !selectedIconIds.size) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;

    event.preventDefault();
    removeDesktopShortcuts(selectedIconIds);
    closeContextMenu();
  };

  return {
    ctxMenu,
    closeContextMenu,
    openContextMenu,
    ctxMenuItems,
    onDesktopContextMenu,
    onTaskbarContextMenu,
    onTitlebarContextMenu,
    onIconContextMenu,
    onDesktopKeyDown
  };
}
