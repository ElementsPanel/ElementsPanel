import { computed, onMounted, onUnmounted, reactive, ref, type Ref } from "vue";
import {
  INSTANCE_SHORTCUT_DROP_EVENT,
  getInstanceShortcutId,
  parseDesktopInstanceShortcut,
  type DesktopInstanceShortcut,
  type PanelFrontendDesktopView
} from "@elements-panel/sdk";
import { getIconCell, getIconPosition, type createIconGrid } from "../iconLayout";
import type { DesktopApp } from "../types";

interface Options {
  availableDesktopApps: Ref<DesktopApp[]>;
  findView: (id: string) => PanelFrontendDesktopView | undefined;
  iconPositions: Map<string, { x: number; y: number }>;
  selectedIconIds: Set<string>;
  desktopIconsRef: Ref<HTMLElement | null>;
  iconGrid: Ref<ReturnType<typeof createIconGrid>>;
  normalizeIconPositions: () => boolean;
  findEmptyCell: (col: number, row: number, excludeId: string) => { col: number; row: number };
  saveDesktopLayout: () => void;
}

export function useDesktopShortcuts(options: Options) {
  const {
    availableDesktopApps,
    findView,
    iconPositions,
    selectedIconIds,
    desktopIconsRef,
    iconGrid,
    normalizeIconPositions,
    findEmptyCell,
    saveDesktopLayout
  } = options;
  const desktopShortcutIds = reactive(new Set<string>());
  const instanceShortcuts = reactive(new Map<string, DesktopInstanceShortcut>());
  const shortcutsLoaded = ref(false);

  const desktopApps = computed<DesktopApp[]>(() => {
    if (!shortcutsLoaded.value) return [];
    const apps = availableDesktopApps.value.filter((app) => desktopShortcutIds.has(app.id));
    const consoleView = findView("instance-console");
    if (consoleView) {
      for (const [id, shortcut] of instanceShortcuts) {
        apps.push({ id, label: shortcut.name, icon: consoleView.icon, color: "#1677ff" });
      }
    }
    return apps;
  });

  const removeDesktopShortcuts = (ids: Iterable<string>) => {
    let changed = false;
    for (const id of [...ids]) {
      changed = desktopShortcutIds.delete(id) || changed;
      changed = instanceShortcuts.delete(id) || changed;
      iconPositions.delete(id);
      selectedIconIds.delete(id);
    }
    if (changed) {
      normalizeIconPositions();
      saveDesktopLayout();
    }
  };
  const removeDesktopShortcut = (id: string) => removeDesktopShortcuts([id]);

  const handleInstanceShortcutDrop = (event: Event) => {
    const detail = (event as CustomEvent<{ shortcut: unknown; clientX: number; clientY: number }>)
      .detail;
    const shortcut = parseDesktopInstanceShortcut(detail?.shortcut);
    const surface = desktopIconsRef.value;
    if (
      !shortcut ||
      !surface ||
      !Number.isFinite(detail.clientX) ||
      !Number.isFinite(detail.clientY) ||
      !findView("instance-console")
    )
      return;
    if (!surface.contains(document.elementFromPoint(detail.clientX, detail.clientY))) return;
    const id = getInstanceShortcutId(shortcut);
    if (!instanceShortcuts.has(id) && desktopShortcutIds.size + instanceShortcuts.size >= 100)
      return;
    const rect = surface.getBoundingClientRect();
    instanceShortcuts.set(id, shortcut);
    placeDesktopShortcutAt(id, detail.clientX - rect.left, detail.clientY - rect.top);
  };

  onMounted(() =>
    window.addEventListener(INSTANCE_SHORTCUT_DROP_EVENT, handleInstanceShortcutDrop)
  );
  onUnmounted(() =>
    window.removeEventListener(INSTANCE_SHORTCUT_DROP_EVENT, handleInstanceShortcutDrop)
  );

  const handleStartMenuAppDrop = (event: DragEvent) => {
    const appId =
      event.dataTransfer?.getData("application/x-elements-desktop-app") ||
      event.dataTransfer?.getData("text/plain") ||
      "";
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    addDesktopShortcutAt(appId, event.clientX - rect.left, event.clientY - rect.top);
  };

  const addDesktopShortcutAt = (appId: string, clientX: number, clientY: number) => {
    if (!appId || !availableDesktopApps.value.some((app) => app.id === appId)) return;
    if (!desktopShortcutIds.has(appId) && desktopShortcutIds.size + instanceShortcuts.size >= 100)
      return;
    desktopShortcutIds.add(appId);
    placeDesktopShortcutAt(appId, clientX, clientY);
  };

  const placeDesktopShortcutAt = (appId: string, clientX: number, clientY: number) => {
    normalizeIconPositions();
    const grid = iconGrid.value;
    const { col, row } = getIconCell(
      { x: clientX - grid.iconWidth / 2, y: clientY - grid.iconHeight / 2 },
      grid
    );
    const empty = findEmptyCell(col, row, appId);
    iconPositions.set(appId, getIconPosition(empty, grid));
    normalizeIconPositions();
    selectedIconIds.clear();
    selectedIconIds.add(appId);
    saveDesktopLayout();
  };

  const handleTaskbarAppDrop = (appId: string, clientX: number, clientY: number) => {
    const rect = desktopIconsRef.value?.getBoundingClientRect();
    addDesktopShortcutAt(appId, clientX - (rect?.left || 0), clientY - (rect?.top || 0));
  };
  return {
    desktopShortcutIds,
    instanceShortcuts,
    shortcutsLoaded,
    desktopApps,
    removeDesktopShortcuts,
    removeDesktopShortcut,
    handleInstanceShortcutDrop,
    handleStartMenuAppDrop,
    handleTaskbarAppDrop
  };
}
