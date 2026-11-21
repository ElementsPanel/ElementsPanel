<script setup lang="ts">
import { t } from "@elementspanel/epanel-plugin-i18n";
import { getDesktopLayoutConfig, getDesktopSettings, setDesktopLayoutConfig } from "./api";
import { DesktopSettings, normalizeDesktopSettings } from "./settings";
import { useAppConfigStore } from "@elementspanel/epanel-plugin-console/stores/useAppConfigStore";
import {
    ctx,
    usePluginService,
    INSTANCE_SHORTCUT_DROP_EVENT,
    getInstanceShortcutId,
    parseDesktopInstanceShortcut,
    type DesktopInstanceShortcut,
    type PanelFrontendDesktopApp,
    type PanelFrontendInstanceAction,
    type PanelFrontendDesktopWindowRequest
} from "@elements-panel/sdk";
import type { FrontendFileManagerService, FrontendUserService } from "@elements-panel/sdk";
import { logoutUser } from "@elementspanel/epanel-plugin-console/services/apis";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import {
    getAppearance,
    resolveBackgroundImage,
    type PanelAppearance
} from "@elementspanel/epanel-plugin-console/services/apis/appearance";
import DesktopContextMenu from "./widgets/desktop/DesktopContextMenu.vue";
import type { ContextMenuItem } from "./widgets/desktop/DesktopContextMenu.vue";
import DesktopIcon from "./widgets/desktop/DesktopIcon.vue";
import type { TaskbarWindow } from "./widgets/desktop/DesktopTaskbar.vue";
import DesktopTaskbar from "./widgets/desktop/DesktopTaskbar.vue";
import DesktopWindowHost from "./widgets/desktop/DesktopWindowHost.vue";
import { desktopWindowContextKey, type WindowState } from "./windowContext";
import { migrateLegacyInstanceWindow } from "./legacyWindows";
import { arrangeDesktopIcons, createIconGrid, findIconCell, findIconGroupCell, getIconCell, getIconPosition } from "./iconLayout";
import { VIcon } from "vuetify/components";
import { computed, markRaw, nextTick, onMounted, onUnmounted, provide, reactive, ref, shallowRef, watch, type Component, type CSSProperties } from "vue";
import { useRouter } from "vue-router";

const CloseOutlined = "mdi-close";
const CloseSquareOutlined = "mdi-close-box-outline";
const DeleteOutlined = "mdi-delete-outline";
const DesktopOutlined = "mdi-monitor";
const EditOutlined = "mdi-pencil-outline";
const FullscreenExitOutlined = "mdi-fullscreen-exit";
const FullscreenOutlined = "mdi-fullscreen";
const MinusOutlined = "mdi-minus";
const PictureOutlined = "mdi-image-outline";
const TeamOutlined = "mdi-account-group-outline";
const UserOutlined = "mdi-account-outline";

// Map legacy component icons to MDI glyphs at the desktop shell boundary.
const DESKTOP_ICON_MAP: Record<string, string> = {
    overview: "mdi-chart-line",
    config: "mdi-cog-outline",
    market: "mdi-storefront-outline",
    nodes: "mdi-sitemap-outline",
    "operation-log": "mdi-file-document-outline",
    backup: "mdi-cloud-outline",
    "java-manager": "mdi-hammer-wrench",
    "terminal-config": "mdi-code-tags",
    "file-manager": "mdi-folder-open-outline"
};

const getDesktopIcon = (id: string, icon?: Component | string): string | Component =>
    DESKTOP_ICON_MAP[id] || (typeof icon === "string" && icon.startsWith("mdi-") ? icon : "mdi-application-outline");

const router = useRouter();
const { state: appState, isAdmin, isLogged, authEnabled } = useAppStateStore();

const user = computed(() => usePluginService<FrontendUserService>("user"));
const desktopLoginWindow = computed(() => user.value?.desktopLoginWindow);
const desktopUsersWindow = computed(() => user.value?.desktopUsers);
const desktopUserInfoWindow = computed(() => user.value?.desktopUserInfo);
const desktopStartMenuAvatar = computed(() => user.value?.desktopStartMenuAvatar);

const fileManager = computed(() => usePluginService<FrontendFileManagerService>("file"));
const desktopFileEditorWindow = computed(() => fileManager.value?.DesktopFileEditor);
const desktopImageViewerWindow = computed(() => fileManager.value?.DesktopImageViewer);
const { isDarkTheme } = useAppConfigStore();

const appearance = ref<PanelAppearance>();
const backgroundImageUrl = computed(() => resolveBackgroundImage(appearance.value, isDarkTheme.value));
const backgroundImageBlur = ref(5);
const desktopSettings = ref(new DesktopSettings());

const startButtonIcon = computed(() => {
    const settings = desktopSettings.value;
    if (!settings.startButtonIconPerTheme) return settings.startButtonIcon;
    const icon = isDarkTheme.value ? settings.startButtonIconDark : settings.startButtonIconLight;
    return icon ?? settings.startButtonIcon;
});

const customWallpaperImage = computed(() => {
    const settings = desktopSettings.value;
    if (!settings.wallpaperImagePerTheme) return settings.wallpaperImage;
    const image = isDarkTheme.value ? settings.wallpaperImageDark : settings.wallpaperImageLight;
    return image ?? settings.wallpaperImage;
});

const wallpaperStyle = computed<CSSProperties>(() => {
    const settings = desktopSettings.value;
    const image = settings.wallpaperMode === "image"
        ? customWallpaperImage.value
        : backgroundImageUrl.value;
    if (!image) {
        // Match the active theme while waiting for the desktop stylesheet to load.
        const fallback = isDarkTheme.value ? "#232429" : "#f5f5f5";
        return { backgroundColor: `var(--desktop-bg-color, ${fallback})` };
    }
    const overlay = isDarkTheme.value
        ? "rgba(0,0,0,0.65)"
        : "rgba(255,255,255,0.2)";
    const blur = settings.wallpaperBlurFollowConsole ? backgroundImageBlur.value : settings.wallpaperBlur;
    return {
        backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${JSON.stringify(image)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        filter: `blur(${blur}px)`,
        inset: `${-3 * blur}px`
    };
});

let appearanceRequest = 0;
const loadDesktopAppearance = async () => {
    const request = ++appearanceRequest;
    const [settingsResult, appearanceResult] = await Promise.allSettled([
        getDesktopSettings().execute(),
        getAppearance().execute()
    ]);
    if (request !== appearanceRequest) return;
    if (settingsResult.status === "fulfilled") {
        desktopSettings.value = normalizeDesktopSettings(settingsResult.value.value);
    }
    if (appearanceResult.status === "fulfilled") {
        appearance.value = appearanceResult.value.value;
        const blur = appearanceResult.value.value?.backgroundImageBlur ?? 5;
        backgroundImageBlur.value = Number.isFinite(blur) ? Math.min(50, Math.max(0, blur)) : 5;
    }
};

const onPluginSettingsChanged = (event: Event) => {
    const id = (event as CustomEvent<{ id: string }>).detail?.id;
    if (id === "desktop" || id === "console") void loadDesktopAppearance();
};

onMounted(() => {
    window.addEventListener("elementspanel:plugin-settings-changed", onPluginSettingsChanged);
    void loadDesktopAppearance();
});
onUnmounted(() => {
    appearanceRequest++;
    window.removeEventListener("elementspanel:plugin-settings-changed", onPluginSettingsChanged);
});

const showLoginOverlay = ref(authEnabled.value && !isLogged.value);

const handleLoginSuccess = () => {
    showLoginOverlay.value = false;
};

watch(isLogged, (logged) => {
    if (logged) {
        loadDesktopLayout();
    } else if (authEnabled.value) {
        showLoginOverlay.value = true;
    }
});

interface DesktopApp {
    id: string;
    label: string;
    icon: Component | string;
    color: string;
    route?: string;
    windowContent?: string;
    component?: Component;
    initialWidth?: number;
    initialHeight?: number;
}

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

const selectedIconIds = reactive(new Set<string>());
let suppressDesktopClick = false;

const selectIcon = (id: string, event?: MouseEvent) => {
    if (suppressDesktopClick && event?.detail) {
        suppressDesktopClick = false;
        return;
    }
    if (event?.ctrlKey || event?.metaKey) {
        if (!selectedIconIds.delete(id)) selectedIconIds.add(id);
    } else {
        selectedIconIds.clear();
        selectedIconIds.add(id);
    }
};

const iconPositions = reactive<Map<string, { x: number; y: number }>>(new Map());
const desktopIconsRef = ref<HTMLElement | null>(null);

const desktopSize = ref({
    width: window.innerWidth || 1024,
    height: Math.max(1, (window.innerHeight || 768) - 48)
});
const iconGrid = computed(() => createIconGrid(desktopSize.value.width, desktopSize.value.height, desktopApps.value.length));

const normalizeIconPositions = () => {
    let changed = false;
    const ids = desktopApps.value.map((app) => app.id);
    const arranged = arrangeDesktopIcons(ids, iconPositions, iconGrid.value);
    for (const [id, point] of arranged) {
        const previous = iconPositions.get(id);
        if (previous?.x === point.x && previous?.y === point.y) continue;
        iconPositions.set(id, point);
        changed = true;
    }
    for (const id of selectedIconIds) {
        if (!ids.includes(id)) selectedIconIds.delete(id);
    }
    return changed;
};

function getDefaultPosition(index: number): { x: number; y: number } {
    const grid = iconGrid.value;
    return getIconPosition({ col: index % grid.columns, row: Math.floor(index / grid.columns) }, grid);
}

function getDefaultPositionForApp(id: string): { x: number; y: number } {
    const ids = desktopApps.value.map((app) => app.id);
    const index = ids.indexOf(id);
    return getDefaultPosition(index >= 0 ? index : 0);
}

function getIconGridX(id: string): number {
    const pos = iconPositions.get(id);
    if (pos && Number.isFinite(pos.x)) return Math.max(iconGrid.value.startX, Math.min(iconGrid.value.width - iconGrid.value.startX - iconGrid.value.iconWidth, pos.x));
    return getDefaultPositionForApp(id).x;
}

function getIconGridY(id: string): number {
    const pos = iconPositions.get(id);
    if (pos && Number.isFinite(pos.y)) return Math.max(iconGrid.value.startY, Math.min(iconGrid.value.height - iconGrid.value.startY - iconGrid.value.iconHeight, pos.y));
    return getDefaultPositionForApp(id).y;
}

function getOccupiedGrid(excludeIds: ReadonlySet<string>): Set<string> {
    const occupied = new Set<string>();
    for (const app of desktopApps.value) {
        if (excludeIds.has(app.id)) continue;
        const gx = getIconGridX(app.id);
        const gy = getIconGridY(app.id);
        const { col, row } = getIconCell({ x: gx, y: gy }, iconGrid.value);
        occupied.add(`${col},${row}`);
    }
    return occupied;
}

function findEmptyCell(col: number, row: number, excludeId: string): { col: number; row: number } {
    return findIconCell({ col, row }, getOccupiedGrid(new Set([excludeId])), iconGrid.value);
}

const DRAG_THRESHOLD = 5;

const isDragging = ref(false);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);
interface DraggedIcon {
    id: string;
    label: string;
    icon: Component | string;
    offsetX: number;
    offsetY: number;
    col: number;
    row: number;
}
const draggedIcons = shallowRef<DraggedIcon[]>([]);
let dragSurfaceOrigin: { left: number; top: number } | undefined;
let dragBounds: { left: number; top: number; right: number; bottom: number } | undefined;
let dragOccupied = new Set<string>();

// Wait for the drag threshold after mousedown.
const pendingDragId = ref<string | null>(null);
const pendingStartX = ref(0);
const pendingStartY = ref(0);

const ghostX = ref(0);
const ghostY = ref(0);

const dropX = ref(0);
const dropY = ref(0);
const dropValid = ref(false);
const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);
let selectionStart: { x: number; y: number } | null = null;
let selectionPoint = { x: 0, y: 0 };
let selectionBaseline = new Set<string>();
let selectionFrame = 0;

const preventDesktopTextSelection = (event: Event) => event.preventDefault();

const getDesktopPoint = (clientX: number, clientY: number) => {
    const rect = dragSurfaceOrigin ?? desktopIconsRef.value?.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(iconGrid.value.width, clientX - (rect?.left || 0))),
        y: Math.max(0, Math.min(iconGrid.value.height, clientY - (rect?.top || 0)))
    };
};

const cancelIconInteraction = () => {
    pendingDragId.value = null;
    droppingIconId.value = null;
    isDragging.value = false;
    draggedIcons.value = [];
    dragSurfaceOrigin = undefined;
    dragBounds = undefined;
    dragOccupied.clear();
    selectionStart = null;
    selectionRect.value = null;
    if (selectionFrame) cancelAnimationFrame(selectionFrame);
    selectionFrame = 0;
    document.removeEventListener("selectstart", preventDesktopTextSelection, true);
};

const updateDragSelection = () => {
    selectionFrame = 0;
    if (!selectionStart) return;
    if (Math.hypot(selectionPoint.x - selectionStart.x, selectionPoint.y - selectionStart.y) < DRAG_THRESHOLD) return;
    suppressDesktopClick = true;
    const rect = {
        x: Math.min(selectionStart.x, selectionPoint.x),
        y: Math.min(selectionStart.y, selectionPoint.y),
        width: Math.abs(selectionPoint.x - selectionStart.x),
        height: Math.abs(selectionPoint.y - selectionStart.y)
    };
    selectionRect.value = rect;
    const selected = new Set(selectionBaseline);
    for (const app of desktopApps.value) {
        const x = getIconGridX(app.id);
        const y = getIconGridY(app.id);
        if (x < rect.x + rect.width && x + iconGrid.value.iconWidth > rect.x &&
            y < rect.y + rect.height && y + iconGrid.value.iconHeight > rect.y) selected.add(app.id);
    }
    selectedIconIds.clear();
    for (const id of selected) selectedIconIds.add(id);
};

const handleDesktopMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !desktopIconsRef.value?.contains(event.target as Node)) return;
    if ((event.target as Element).closest(".desktop-icon")) return;
    event.preventDefault();
    event.stopPropagation();
    cancelIconInteraction();
    closeContextMenu();
    desktopIconsRef.value?.focus?.({ preventScroll: true });
    suppressDesktopClick = false;
    selectionBaseline = event.ctrlKey || event.metaKey || event.shiftKey ? new Set(selectedIconIds) : new Set();
    selectedIconIds.clear();
    for (const id of selectionBaseline) selectedIconIds.add(id);
    selectionStart = getDesktopPoint(event.clientX, event.clientY);
    selectionPoint = selectionStart;
    selectionRect.value = { ...selectionStart, width: 0, height: 0 };
    window.getSelection()?.removeAllRanges();
    document.addEventListener("selectstart", preventDesktopTextSelection, true);
};

function commitDragStart(id: string, clientX: number, clientY: number) {
    if (!selectedIconIds.has(id)) {
        selectedIconIds.clear();
        selectedIconIds.add(id);
    }
    originX.value = getIconGridX(id);
    originY.value = getIconGridY(id);
    const grid = iconGrid.value;
    const originCell = getIconCell({ x: originX.value, y: originY.value }, grid);
    draggedIcons.value = desktopApps.value.filter(app => selectedIconIds.has(app.id)).map(app => {
        const x = getIconGridX(app.id);
        const y = getIconGridY(app.id);
        const cell = getIconCell({ x, y }, grid);
        return {
            id: app.id, label: app.label, icon: app.icon,
            offsetX: x - originX.value, offsetY: y - originY.value,
            col: cell.col - originCell.col, row: cell.row - originCell.row
        };
    });
    if (!draggedIcons.value.length) return cancelIconInteraction();
    const rect = desktopIconsRef.value?.getBoundingClientRect();
    dragSurfaceOrigin = { left: rect?.left || 0, top: rect?.top || 0 };
    dragOccupied = getOccupiedGrid(selectedIconIds);
    dragBounds = {
        left: grid.startX - Math.min(...draggedIcons.value.map(icon => icon.offsetX)),
        top: grid.startY - Math.min(...draggedIcons.value.map(icon => icon.offsetY)),
        right: grid.width - grid.startX - grid.iconWidth - Math.max(...draggedIcons.value.map(icon => icon.offsetX)),
        bottom: grid.height - grid.startY - grid.iconHeight - Math.max(...draggedIcons.value.map(icon => icon.offsetY))
    };
    const point = getDesktopPoint(clientX, clientY);
    dragOffsetX.value = point.x - originX.value;
    dragOffsetY.value = point.y - originY.value;
    ghostX.value = originX.value;
    ghostY.value = originY.value;
    dropX.value = originX.value;
    dropY.value = originY.value;
    droppingIconId.value = id;
    isDragging.value = true;
    dropValid.value = true;
    pendingDragId.value = null;
    suppressDesktopClick = true;
    window.getSelection()?.removeAllRanges();
}

const droppingIconId = ref<string | null>(null);
const originX = ref(0);
const originY = ref(0);

const handleIconDragStart = (id: string, clientX: number, clientY: number) => {
    cancelIconInteraction();
    closeContextMenu();
    desktopIconsRef.value?.focus?.({ preventScroll: true });
    normalizeIconPositions();
    suppressDesktopClick = false;
    pendingDragId.value = id;
    pendingStartX.value = clientX;
    pendingStartY.value = clientY;
    document.addEventListener("selectstart", preventDesktopTextSelection, true);
};

const updateIconDrag = (event: MouseEvent) => {
    if (!droppingIconId.value || !dragBounds) return;
    const point = getDesktopPoint(event.clientX, event.clientY);
    const grid = iconGrid.value;
    ghostX.value = Math.max(dragBounds.left, Math.min(dragBounds.right, point.x - dragOffsetX.value));
    ghostY.value = Math.max(dragBounds.top, Math.min(dragBounds.bottom, point.y - dragOffsetY.value));
    const target = findIconGroupCell(getIconCell({ x: ghostX.value, y: ghostY.value }, grid), draggedIcons.value, dragOccupied, grid);
    dropValid.value = !!target;
    if (target) {
        const position = getIconPosition(target, grid);
        dropX.value = position.x;
        dropY.value = position.y;
    }
};

const handleDesktopMouseMove = (e: MouseEvent) => {
    if (!selectionStart && !pendingDragId.value && !isDragging.value) return;
    if (!(e.buttons & 1)) return cancelIconInteraction();
    e.preventDefault();
    if (selectionStart) {
        selectionPoint = getDesktopPoint(e.clientX, e.clientY);
        if (selectionFrame) cancelAnimationFrame(selectionFrame);
        selectionFrame = requestAnimationFrame(updateDragSelection);
        return;
    }
    if (pendingDragId.value && !isDragging.value) {
        const dx = e.clientX - pendingStartX.value;
        const dy = e.clientY - pendingStartY.value;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
            commitDragStart(pendingDragId.value, pendingStartX.value, pendingStartY.value);
        }
    }

    if (!isDragging.value || !droppingIconId.value) return;
    updateIconDrag(e);
};

const handleDesktopMouseUp = (event: MouseEvent) => {
    if (selectionStart) {
        if (selectionFrame) cancelAnimationFrame(selectionFrame);
        selectionFrame = 0;
        selectionPoint = getDesktopPoint(event.clientX, event.clientY);
        updateDragSelection();
        cancelIconInteraction();
        return;
    }
    if (pendingDragId.value && !isDragging.value) {
        cancelIconInteraction();
        return;
    }

    if (!isDragging.value || !droppingIconId.value) return;
    updateIconDrag(event);
    const { col, row } = getIconCell({ x: dropX.value, y: dropY.value }, iconGrid.value);
    if (dropValid.value) {
        for (const icon of draggedIcons.value) {
            iconPositions.set(icon.id, getIconPosition({ col: col + icon.col, row: row + icon.row }, iconGrid.value));
        }
    }
    cancelIconInteraction();
    normalizeIconPositions();
    saveDesktopLayout();
};

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
    const detail = (event as CustomEvent<{ shortcut: unknown; clientX: number; clientY: number }>).detail;
    const shortcut = parseDesktopInstanceShortcut(detail?.shortcut);
    const surface = desktopIconsRef.value;
    if (!shortcut || !surface || !Number.isFinite(detail.clientX) || !Number.isFinite(detail.clientY) || !findView("instance-console")) return;
    if (!surface.contains(document.elementFromPoint(detail.clientX, detail.clientY))) return;
    const id = getInstanceShortcutId(shortcut);
    if (!instanceShortcuts.has(id) && desktopShortcutIds.size + instanceShortcuts.size >= 100) return;
    const rect = surface.getBoundingClientRect();
    instanceShortcuts.set(id, shortcut);
    placeDesktopShortcutAt(id, detail.clientX - rect.left, detail.clientY - rect.top);
};

onMounted(() => window.addEventListener(INSTANCE_SHORTCUT_DROP_EVENT, handleInstanceShortcutDrop));
onUnmounted(() => window.removeEventListener(INSTANCE_SHORTCUT_DROP_EVENT, handleInstanceShortcutDrop));

const handleStartMenuAppDrop = (event: DragEvent) => {
    const appId = event.dataTransfer?.getData("application/x-elements-desktop-app")
        || event.dataTransfer?.getData("text/plain")
        || "";
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    addDesktopShortcutAt(appId, event.clientX - rect.left, event.clientY - rect.top);
};

const addDesktopShortcutAt = (appId: string, clientX: number, clientY: number) => {
    if (!appId || !availableDesktopApps.value.some((app) => app.id === appId)) return;
    if (!desktopShortcutIds.has(appId) && desktopShortcutIds.size + instanceShortcuts.size >= 100) return;
    desktopShortcutIds.add(appId);
    placeDesktopShortcutAt(appId, clientX, clientY);
};

const placeDesktopShortcutAt = (appId: string, clientX: number, clientY: number) => {
    normalizeIconPositions();
    const grid = iconGrid.value;
    const { col, row } = getIconCell({ x: clientX - grid.iconWidth / 2, y: clientY - grid.iconHeight / 2 }, grid);
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

const windows = reactive<Map<string, WindowState>>(new Map());
let nextZIndex = 100;
let windowOffset = 0;

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
        } catch (e) {
        }
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

const pluginViews = computed(() => ctx.desktop.views.filter((view) => !view.condition || view.condition()));
const viewsById = computed(() => new Map(pluginViews.value.map((view) => [view.id, view])));
const findView = (id: string) => viewsById.value.get(id);
const savedViewProps = (win: WindowState) => win.props ?? {
    instanceId: win.instanceId, daemonId: win.daemonId, type: win.type
};

let registeredViewIds = new Set(pluginViews.value.map((view) => view.id));
watch(pluginViews, (views) => {
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
}, { flush: "sync" });

const ICON_MAP: Record<string, Component | string> = {
    "users": TeamOutlined, "file-editor": EditOutlined,
    "image-viewer": PictureOutlined, "user-info": UserOutlined
};

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
            windows.clear();
            for (const savedWindow of layout.windows) {
                const win = migrateLegacyInstanceWindow(savedWindow);
                const content = win.content;
                if (typeof content !== "string") continue;
                const view = findView(content);
                const props = savedViewProps(win);
                if (view?.accepts && !view.accepts(props)) continue;
                if (!view && !content.startsWith("panel-plugin:") && !content.startsWith("instance-action:") &&
                    !["backup", "java-manager", "file-manager", "term-config"].includes(content) && !ICON_MAP[content]) continue;
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
                    view?.icon || desktopApp?.icon ||
                    (instanceActionId ? getDesktopIcon(instanceActionId, instanceAction?.mdiIcon || instanceAction?.icon) : undefined) ||
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
                    content:
                        instanceActionId
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
                        view?.component || desktopApp?.component ||
                        (instanceAction?.desktopComponent
                            ? markRaw(instanceAction.desktopComponent)
                            : undefined)
                });
            }
        }
        if (layout && Array.isArray(layout.icons)) {
            for (const icon of layout.icons) {
                if ((desktopShortcutIds.has(icon.id) || instanceShortcuts.has(icon.id)) && typeof icon.x === "number" && typeof icon.y === "number") {
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

const openWindow = (appId: string) => {
    const shortcut = instanceShortcuts.get(appId);
    if (shortcut) {
        openInstanceConsole({ instanceUuid: shortcut.instanceId, config: { nickname: shortcut.name } }, shortcut.daemonId);
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

const openFileEditorWindow = (instanceId: string, daemonId: string, filePath: string, fileName: string) => {
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

const openImageViewerWindow = (instanceId: string, daemonId: string, filePath: string, fileName: string) => {
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
        ? pluginInstanceActions.value.find((item) => item.id === request.view.slice("instance-action:".length))
        : undefined;
    const props = request.props ?? {};
    if ((!view && !action?.desktopComponent) || (view?.accepts && !view.accepts(props))) return false;
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
        visible: true, minimized: false, maximized: false, zIndex: ++nextZIndex,
        initialX: 120 + windowOffset * 30, initialY: 80 + windowOffset * 30,
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

const handleWindowResized = (id: string, newX: number, newY: number, newWidth: number, newHeight: number) => {
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

    newOrder.forEach(id => {
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
    target: { windowId?: string; shortcutId?: string; titlebar?: boolean; desktopSelection?: boolean } = {}
) => {
    event.preventDefault();
    const request = ++contextMenuRequest;
    ctxMenu.visible = false;
    ctxMenu.x = event.clientX;
    ctxMenu.y = event.clientY;
    ctxMenu.targetWindowId = target.windowId ?? null;
    ctxMenu.targetShortcutIds = target.shortcutId || target.desktopSelection ? [...selectedIconIds] : [];
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
                    label: win.maximized ? (t("TXT_CODE_DESKTOP_RESTORE")) : (t("TXT_CODE_DESKTOP_MAXIMIZE")),
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
    void openContextMenu(e, { desktopSelection: desktopIconsRef.value?.contains(e.target as Node) });
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

let desktopResizeObserver: ResizeObserver | undefined;
const updateDesktopSize = () => {
    const surface = desktopIconsRef.value;
    const rect = surface?.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = Math.max(1, (window.innerHeight || 768) - 48);
    const width = Math.min(surface?.clientWidth || rect?.width || viewportWidth, viewportWidth);
    const height = Math.min(surface?.clientHeight || rect?.height || viewportHeight, viewportHeight);
    if (width > 0 && height > 0 && (width !== desktopSize.value.width || height !== desktopSize.value.height)) {
        desktopSize.value = { width, height };
    }
};

watch(desktopIconsRef, (surface) => {
    cancelIconInteraction();
    desktopResizeObserver?.disconnect();
    if (surface && typeof ResizeObserver !== "undefined") {
        desktopResizeObserver = new ResizeObserver(updateDesktopSize);
        desktopResizeObserver.observe(surface);
    }
    updateDesktopSize();
}, { flush: "post" });

watch([iconGrid, desktopApps], ([grid, apps], [previousGrid]) => {
    if (grid !== previousGrid || (droppingIconId.value && !apps.some((app) => app.id === droppingIconId.value))) cancelIconInteraction();
    if (normalizeIconPositions()) saveDesktopLayout();
}, { flush: "post" });

onMounted(() => {
    document.body.classList.add("desktop-mode-active");
    document.addEventListener("keydown", onDesktopKeyDown);
    document.addEventListener("mousemove", handleDesktopMouseMove);
    document.addEventListener("mouseup", handleDesktopMouseUp);
    window.addEventListener("resize", updateDesktopSize);
    window.addEventListener("blur", cancelIconInteraction);
    updateDesktopSize();
});
onUnmounted(() => {
    document.removeEventListener("keydown", onDesktopKeyDown);
    document.body.classList.remove("desktop-mode-active");
    document.removeEventListener("mousemove", handleDesktopMouseMove);
    document.removeEventListener("mouseup", handleDesktopMouseUp);
    window.removeEventListener("resize", updateDesktopSize);
    window.removeEventListener("blur", cancelIconInteraction);
    desktopResizeObserver?.disconnect();
    cancelIconInteraction();
    if (saveLayoutTimer) clearTimeout(saveLayoutTimer);
});

const onDesktopClick = (event: MouseEvent) => {
    if (suppressDesktopClick && event.detail) {
        suppressDesktopClick = false;
        return;
    }
    if (desktopIconsRef.value?.contains(event.target as Node) && !event.ctrlKey && !event.metaKey && !event.shiftKey) selectedIconIds.clear();
    closeContextMenu();
};

const exitDesktop = () => {
    Modal.confirm({
        title: t("TXT_CODE_COMMON_LOGOUT"),
        content: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_LOG_OUT_THIS_USER"),
        async onOk() {
            if (authEnabled.value) await logoutUser().execute();
            window.location.reload();
        }
    });
};

const username = computed(() => appState.userInfo?.userName || "User");
provide(desktopWindowContextKey, {
    activeWindowId, views: viewsById, fileEditor: desktopFileEditorWindow, imageViewer: desktopImageViewerWindow,
    users: desktopUsersWindow, userInfo: desktopUserInfoWindow,
    close: closeWindow, closed: removeClosedWindow, minimize: minimizeWindow, maximize: maximizeWindow, focus: focusWindow,
    moved: handleWindowMoved, resized: handleWindowResized, contextMenu: onTitlebarContextMenu,
    openConsole: openInstanceConsole, openFileEditor: openFileEditorWindow, openImageViewer: openImageViewerWindow
});
const isMdiIcon = (icon: Component | string): icon is `mdi-${string}` => typeof icon === "string" && icon.startsWith("mdi-");
</script>

<template>
    <div class="desktop-container" @click="onDesktopClick" @contextmenu="onDesktopContextMenu">
        <div class="desktop-wallpaper" :style="wallpaperStyle" aria-hidden="true"></div>
        <Transition name="desktop-fade">
            <div v-if="!showLoginOverlay" class="desktop-content-wrapper">
                <div ref="desktopIconsRef" class="desktop-icons" tabindex="-1" @mousedown="handleDesktopMouseDown" @dragover.prevent @drop.prevent="handleStartMenuAppDrop">
                    <DesktopIcon v-for="app in desktopApps" :key="app.id" :id="app.id" :label="app.label"
                        :icon="app.icon" :color="app.color" :selected="selectedIconIds.has(app.id)" :scale="iconGrid.scale"
                        :x="getIconGridX(app.id)"
                        :y="getIconGridY(app.id)" @select="selectIcon"
                        @open="openWindow" @dragstart="handleIconDragStart" @contextmenu="onIconContextMenu" />

                    <div v-if="selectionRect && (selectionRect.width > 0 || selectionRect.height > 0)" class="desktop-drag-select-rect"
                        :style="{ left: selectionRect.x + 'px', top: selectionRect.y + 'px', width: selectionRect.width + 'px', height: selectionRect.height + 'px' }"></div>

                    <template v-if="isDragging && dropValid">
                        <div v-for="item in draggedIcons" :key="item.id" class="drop-indicator"
                            :style="{ left: dropX + item.offsetX + 'px', top: dropY + item.offsetY + 'px', transform: `scale(${iconGrid.scale})` }">
                            <div class="drop-indicator__highlight"></div>
                        </div>
                    </template>

                    <template v-if="isDragging">
                        <div v-for="item in draggedIcons" :key="item.id" class="drag-ghost"
                            :style="{ left: ghostX + item.offsetX + 'px', top: ghostY + item.offsetY + 'px', transform: `scale(${iconGrid.scale})`, transformOrigin: 'top left' }">
                            <div class="drag-ghost__inner">
                                <component :is="item.icon" v-if="typeof item.icon !== 'string'"
                                    class="drag-ghost__icon" />
                                <VIcon v-else-if="isMdiIcon(item.icon)" :icon="item.icon" size="42"
                                    class="drag-ghost__icon" />
                                <span v-else class="drag-ghost__emoji">{{ item.icon }}</span>
                                <span class="drag-ghost__label">{{ item.label }}</span>
                            </div>
                        </div>
                    </template>
                </div>

                <DesktopWindowHost v-for="[id, win] in windows" :key="id" :window="win" />
                <DesktopTaskbar :windows="taskbarWindows" :apps="availableDesktopApps" :username="username"
                    :user-avatar="desktopStartMenuAvatar"
                    :start-button-icon="startButtonIcon"
                    @toggle-window="toggleWindow" @open-app="openWindow"
                    @add-shortcut="handleTaskbarAppDrop"
                    @exit-desktop="exitDesktop" @open-user-info="openUserInfoWindow"
                    @reorder-windows="handleReorderWindows" @contextmenu-window="onTaskbarContextMenu" />
                <DesktopContextMenu :visible="ctxMenu.visible" :x="ctxMenu.x" :y="ctxMenu.y" :items="ctxMenuItems"
                    @close="closeContextMenu" />
            </div>
        </Transition>
        <Transition name="login-fade">
            <component :is="desktopLoginWindow" v-if="showLoginOverlay && desktopLoginWindow"
                @login-success="handleLoginSuccess" />
        </Transition>
    </div>
</template>

<style lang="scss" scoped>
.desktop-container {
    position: fixed;
    inset: 0;
    overflow: hidden;
    z-index: 100;
}

.desktop-wallpaper {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
}

.desktop-icons {
    position: relative;
    z-index: 1;
    width: 100%;
    height: calc(100vh - 48px);
    overflow: hidden;
    user-select: none;
    outline: none;
}

.desktop-drag-select-rect {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    border-radius: 3px;
    background: rgba(22, 119, 255, 0.12);
    border: 1px solid rgba(22, 119, 255, 0.4);
}

.drag-ghost {
    position: absolute;
    z-index: 9999;
    pointer-events: none;
    user-select: none;
}

.drag-ghost__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 90px;
    padding: 8px 4px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    opacity: 0.65;
    transform: scale(1.05);
}

.drag-ghost__icon {
    font-size: 42px;
    color: #fff;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4));
    margin-bottom: 6px;
}

.drag-ghost__emoji {
    font-size: 42px;
    line-height: 1;
    margin-bottom: 6px;
}

.drag-ghost__label {
    font-size: 11px;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    text-align: center;
    line-height: 1.3;
    max-width: 84px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.drop-indicator {
    position: absolute;
    z-index: 9998;
    pointer-events: none;
    width: 90px;
    height: 104px;
    transform-origin: top left;
    display: flex;
    align-items: center;
    justify-content: center;
}

.drop-indicator__highlight {
    width: 74px;
    height: 74px;
    border-radius: 12px;
    border: 0;
    background: rgba(255, 255, 255, 0.06);
}

.desktop-content-wrapper {
    position: absolute;
    inset: 0;
    z-index: 1;
}

.desktop-fade-enter-active {
    transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.desktop-fade-leave-active {
    transition: all 0.3s ease;
}

.desktop-fade-enter-from {
    opacity: 0;
    transform: scale(1.05);
}

.desktop-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.login-fade-enter-active,
.login-fade-leave-active {
    transition: opacity 0.6s ease;
}

.login-fade-enter-from,
.login-fade-leave-to {
    opacity: 0;
}
</style>
