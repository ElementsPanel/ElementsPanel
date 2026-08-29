<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getDesktopLayoutConfig, setDesktopLayoutConfig } from "./api";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { getPanelFrontendService } from "@/pluginServices";
import { logoutUser } from "@/services/apis/index";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutConfigStore } from "@/stores/useLayoutConfig";
import {
    getPanelFrontendDesktopApps,
    getPanelFrontendInstanceActions,
    type PanelFrontendDesktopApp,
    type PanelFrontendInstanceAction
} from "@/plugins";
import type { ContextMenuItem } from "./widgets/desktop/DesktopContextMenu.vue";
import DesktopContextMenu from "./widgets/desktop/DesktopContextMenu.vue";
import DesktopEventConfig from "./widgets/desktop/DesktopEventConfig.vue";
import DesktopFileEditor from "./widgets/desktop/DesktopFileEditor.vue";
import DesktopFileManager from "./widgets/desktop/DesktopFileManager.vue";
import DesktopIcon from "./widgets/desktop/DesktopIcon.vue";
import DesktopImageViewer from "./widgets/desktop/DesktopImageViewer.vue";
import DesktopInstanceConsole from "./widgets/desktop/DesktopInstanceConsole.vue";
import DesktopInstanceManager from "./widgets/desktop/DesktopInstanceManager.vue";
import DesktopJavaManager from "./widgets/desktop/DesktopJavaManager.vue";
import DesktopMarket from "./widgets/desktop/DesktopMarket.vue";
import DesktopMcPing from "./widgets/desktop/DesktopMcPing.vue";
import DesktopModManager from "./widgets/desktop/DesktopModManager.vue";
import DesktopMyApps from "./widgets/desktop/DesktopMyApps.vue";
import DesktopNewInstance from "./widgets/desktop/DesktopNewInstance.vue";
import DesktopOverview from "./widgets/desktop/DesktopOverview.vue";
import DesktopSchedule from "./widgets/desktop/DesktopSchedule.vue";
import DesktopServerConfig from "./widgets/desktop/DesktopServerConfig.vue";
import DesktopSettings from "./widgets/desktop/DesktopSettings.vue";
import type { TaskbarWindow } from "./widgets/desktop/DesktopTaskbar.vue";
import DesktopTaskbar from "./widgets/desktop/DesktopTaskbar.vue";
import DesktopTermConfig from "./widgets/desktop/DesktopTermConfig.vue";
import DesktopTerminalSelector from "./widgets/desktop/DesktopTerminalSelector.vue";
import DesktopWindow from "./widgets/desktop/DesktopWindow.vue";
import {
    AppstoreOutlined,
    BuildOutlined,
    CloseOutlined,
    CloseSquareOutlined,
    CodeOutlined,
    ControlOutlined,
    DashboardOutlined,
    DeleteOutlined,
    DesktopOutlined,
    EditOutlined,
    FieldTimeOutlined,
    FolderOpenOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    MinusOutlined,
    PictureOutlined,
    SettingOutlined,
    ShoppingOutlined,
    TeamOutlined,
    UsbOutlined,
    UsergroupDeleteOutlined,
    UserOutlined
} from "@ant-design/icons-vue";
import { computed, markRaw, onMounted, onUnmounted, reactive, ref, watch, type Component, type CSSProperties } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const { state: appState, isAdmin, isLogged, authEnabled } = useAppStateStore();

// Login, account and user-management windows are owned by the "user" plugin.
// Without it the panel has no authentication, so they simply do not exist.
const desktopLoginWindow = computed(() =>
    getPanelFrontendService<Component>("user.desktopLoginWindow")
);
const desktopUsersWindow = computed(() => getPanelFrontendService<Component>("user.desktopUsers"));
const desktopUserInfoWindow = computed(() =>
    getPanelFrontendService<Component>("user.desktopUserInfo")
);
const desktopStartMenuAvatar = computed(() =>
    getPanelFrontendService<Component>("user.desktopStartMenuAvatar")
);
const { getSettingsConfig } = useLayoutConfigStore();
const { isDarkTheme } = useAppConfigStore();

//─── Wallpaper ───
const backgroundImageUrl = ref<string>("");

const wallpaperStyle = computed<CSSProperties>(() => {
    if (!backgroundImageUrl.value) {
        return { backgroundColor: "var(--desktop-bg-color, #232429)" };
    }
    const overlay = isDarkTheme.value
        ? "rgba(0,0,0,0.65)"
        : "rgba(255,255,255,0.2)";
    return {
        backgroundImage: `${overlay}, url(${backgroundImageUrl.value})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat"
    };
});

onMounted(async () => {
    try {
        const settings = await getSettingsConfig();
        if (settings?.theme?.backgroundImage) {
            backgroundImageUrl.value = settings.theme.backgroundImage;
        }
    } catch (e) {
        // Silently ignore
    }
});

//─── Login ───
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

//─── Desktop Icons ───
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
    getPanelFrontendDesktopApps()
        .filter((app) =>
            typeof app.condition === "function"
                ? app.condition()
                : app.condition === undefined || app.condition
        )
        .map((app) => ({
            id: app.id,
            label: getDesktopAppLabel(app),
            icon: typeof app.icon === "string" ? app.icon : markRaw(app.icon),
            color: app.color || "#1677ff",
            route: app.route,
            windowContent: `panel-plugin:${app.id}`,
            component: app.component ? markRaw(app.component) : undefined,
            initialWidth: app.initialWidth,
            initialHeight: app.initialHeight
        }))
);

const pluginInstanceActions = computed<PanelFrontendInstanceAction[]>(() => [
    ...getPanelFrontendInstanceActions()
]);

const availableDesktopApps = computed<DesktopApp[]>(() => {
    const apps: DesktopApp[] = [
        {
            id: "instances",
            label: t("TXT_CODE_e21473bc"),
            icon: markRaw(DesktopOutlined),
            color: "#1677ff",
            route: "/instances", windowContent: "instances"
        },
        {
            id: "overview",
            label: t("TXT_CODE_84fbe277"),
            icon: markRaw(DashboardOutlined),
            color: "#52c41a",
            route: "/overview",
            windowContent: "overview"
        },
        {
            id: "market",
            label: t("TXT_CODE_27594db8"),
            icon: markRaw(ShoppingOutlined),
            color: "#eb2f96",
            route: "/market",
            windowContent: "market"
        },
        {
            id: "settings",
            label: t("TXT_CODE_3fe97dcc"),
            icon: markRaw(SettingOutlined),
            color: "#13c2c2",
            route: "/settings",
            windowContent: "settings"
        },
        {
            id: "terminal",
            label: t("TXT_CODE_524e3036"),
            icon: markRaw(CodeOutlined),
            color: "#434343",
            windowContent: "terminal"
        }
    ];

    if (!isAdmin.value) {
        return [
            {
                id: "my-apps",
                label: t("TXT_CODE_DESKTOP_MY_APPS"),
                icon: markRaw(AppstoreOutlined),
                color: "#1677ff",
                windowContent: "my-apps"
            },
            ...pluginDesktopApps.value
        ];
    }
    if (desktopUsersWindow.value) {
        apps.push({
            id: "users",
            label: t("TXT_CODE_1deaa2dd"),
            icon: markRaw(TeamOutlined),
            color: "#722ed1",
            route: "/users",
            windowContent: "users"
        });
    }
    return [...apps, ...pluginDesktopApps.value];
});

const desktopShortcutIds = reactive(new Set<string>());
const shortcutsLoaded = ref(false);

const desktopApps = computed<DesktopApp[]>(() => {
    if (!shortcutsLoaded.value) return [];
    return availableDesktopApps.value.filter((app) => desktopShortcutIds.has(app.id));
});

const selectedIconId = ref<string | null>(null);

const selectIcon = (id: string) => {
    selectedIconId.value = id;
};

//─── Icon Positions ───
const iconPositions = reactive<Map<string, { x: number; y: number }>>(new Map());
const desktopIconsRef = ref<HTMLElement | null>(null);

const DEFAULT_ICON_START_X = 16;
const DEFAULT_ICON_START_Y = 16;
const ICON_COL_WIDTH = 94;
const ICON_ROW_HEIGHT = 104;

function snapToGrid(x: number, y: number): { x: number; y: number } {
    const snappedX = Math.round((x - DEFAULT_ICON_START_X) / ICON_COL_WIDTH) * ICON_COL_WIDTH + DEFAULT_ICON_START_X;
    const snappedY = Math.round((y - DEFAULT_ICON_START_Y) / ICON_ROW_HEIGHT) * ICON_ROW_HEIGHT + DEFAULT_ICON_START_Y;
    return { x: Math.max(0, snappedX), y: Math.max(0, snappedY) };
}

function getDefaultPosition(index: number): { x: number; y: number } {
    return {
        x: DEFAULT_ICON_START_X + (index % 12) * ICON_COL_WIDTH,
        y: DEFAULT_ICON_START_Y + Math.floor(index / 12) * ICON_ROW_HEIGHT
    };
}

function getDefaultPositionForApp(id: string): { x: number; y: number } {
    const index = availableDesktopApps.value.findIndex((app) => app.id === id);
    return getDefaultPosition(index >= 0 ? index : 0);
}

function getIconGridX(id: string): number {
    const pos = iconPositions.get(id);
    if (pos) return pos.x;
    return getDefaultPositionForApp(id).x;
}

function getIconGridY(id: string): number {
    const pos = iconPositions.get(id);
    if (pos) return pos.y;
    return getDefaultPositionForApp(id).y;
}

function getOccupiedGrid(excludeId: string): Set<string> {
    const occupied = new Set<string>();
    for (const app of desktopApps.value) {
        if (app.id === excludeId) continue;
        const gx = getIconGridX(app.id);
        const gy = getIconGridY(app.id);
        const col = Math.round((gx - DEFAULT_ICON_START_X) / ICON_COL_WIDTH);
        const row = Math.round((gy - DEFAULT_ICON_START_Y) / ICON_ROW_HEIGHT);
        occupied.add(`${col},${row}`);
    }
    return occupied;
}

function findEmptyCell(col: number, row: number, excludeId: string): { col: number; row: number } {
    const occupied = getOccupiedGrid(excludeId);
    if (!occupied.has(`${col},${row}`)) return { col, row };
    for (let r = 0; r < 50; r++) {
        for (let c = 0; c < 12; c++) {
            if (!occupied.has(`${c},${r}`)) return { col: c, row: r };
        }
    }
    return { col, row };
}

//─── Drag State ───
const DRAG_THRESHOLD = 5;

const isDragging = ref(false);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

// Pending: mousedown happened but hasn't crossed threshold yet
const pendingDragId = ref<string | null>(null);
const pendingStartX = ref(0);
const pendingStartY = ref(0);

const ghostX = ref(0);
const ghostY = ref(0);

const dropX = ref(0);
const dropY = ref(0);
const dropValid = ref(false);

function commitDragStart(id: string, clientX: number, clientY: number) {
    selectedIconId.value = id;
    originX.value = getIconGridX(id);
    originY.value = getIconGridY(id);
    dragOffsetX.value = clientX - originX.value;
    dragOffsetY.value = clientY - originY.value;
    ghostX.value = clientX - dragOffsetX.value;
    ghostY.value = clientY - dragOffsetY.value;
    droppingIconId.value = id;
    isDragging.value = true;
    dropValid.value = true;
    pendingDragId.value = null;
}

const droppingIconId = ref<string | null>(null);
const originX = ref(0);
const originY = ref(0);

const handleIconDragStart = (id: string, clientX: number, clientY: number) => {
    selectedIconId.value = id;
    pendingDragId.value = id;
    pendingStartX.value = clientX;
    pendingStartY.value = clientY;
};

const handleDesktopMouseMove = (e: MouseEvent) => {
    if (pendingDragId.value && !isDragging.value) {
        const dx = e.clientX - pendingStartX.value;
        const dy = e.clientY - pendingStartY.value;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
            commitDragStart(pendingDragId.value, pendingStartX.value, pendingStartY.value);
        }
        return;
    }

    if (!isDragging.value || !droppingIconId.value) return;
    ghostX.value = e.clientX - dragOffsetX.value;
    ghostY.value = e.clientY - dragOffsetY.value;
    const snapped = snapToGrid(ghostX.value, ghostY.value);
    dropX.value = snapped.x;
    dropY.value = snapped.y;
    const targetCol = Math.round((snapped.x - DEFAULT_ICON_START_X) / ICON_COL_WIDTH);
    const targetRow = Math.round((snapped.y - DEFAULT_ICON_START_Y) / ICON_ROW_HEIGHT);
    const occupied = getOccupiedGrid(droppingIconId.value);
    dropValid.value = !occupied.has(`${targetCol},${targetRow}`);
};

const handleDesktopMouseUp = () => {
    if (pendingDragId.value && !isDragging.value) {
        pendingDragId.value = null;
        return;
    }

    if (!isDragging.value || !droppingIconId.value) return;
    isDragging.value = false;

    const targetCol = Math.round((dropX.value - DEFAULT_ICON_START_X) / ICON_COL_WIDTH);
    const targetRow = Math.round((dropY.value - DEFAULT_ICON_START_Y) / ICON_ROW_HEIGHT);
    const empty = findEmptyCell(targetCol, targetRow, droppingIconId.value);
    const finalX = DEFAULT_ICON_START_X + empty.col * ICON_COL_WIDTH;
    const finalY = DEFAULT_ICON_START_Y + empty.row * ICON_ROW_HEIGHT;

    iconPositions.set(droppingIconId.value, { x: finalX, y: finalY });
    droppingIconId.value = null;
    saveDesktopLayout();
};

const removeDesktopShortcut = (id: string) => {
    if (!desktopShortcutIds.has(id)) return;
    desktopShortcutIds.delete(id);
    iconPositions.delete(id);
    if (selectedIconId.value === id) {
        selectedIconId.value = null;
    }
    saveDesktopLayout();
};

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

    const snapped = snapToGrid(clientX - 45, clientY - 50);
    const targetCol = Math.max(0, Math.round((snapped.x - DEFAULT_ICON_START_X) / ICON_COL_WIDTH));
    const targetRow = Math.max(0, Math.round((snapped.y - DEFAULT_ICON_START_Y) / ICON_ROW_HEIGHT));
    const empty = findEmptyCell(targetCol, targetRow, appId);

    desktopShortcutIds.add(appId);
    iconPositions.set(appId, {
        x: DEFAULT_ICON_START_X + empty.col * ICON_COL_WIDTH,
        y: DEFAULT_ICON_START_Y + empty.row * ICON_ROW_HEIGHT
    });
    selectedIconId.value = appId;
    saveDesktopLayout();
};

const handleTaskbarAppDrop = (appId: string, clientX: number, clientY: number) => {
    const rect = desktopIconsRef.value?.getBoundingClientRect();
    addDesktopShortcutAt(appId, clientX - (rect?.left || 0), clientY - (rect?.top || 0));
};

//─── Window Management ───
interface WindowState {
    id: string;
    title: string;
    icon: Component | string;
    visible: boolean;
    minimized: boolean;
    maximized: boolean;
    zIndex: number;
    content: string;
    initialX: number;
    initialY: number;
    initialWidth: number;
    initialHeight: number;
    instanceId?: string;
    daemonId?: string;
    type?: string;
    filePath?: string;
    fileName?: string;
    component?: Component;
}

const windows = reactive<Map<string, WindowState>>(new Map());
let nextZIndex = 100;
let windowOffset = 0;

// ─── Layout Persistence ───
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
                    fileName: win.fileName
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
                    updatedAt: Date.now()
                }
            });
        } catch (e) {
            // Silently ignore
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
            if (selectedIconId.value === id) selectedIconId.value = null;

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

const ICON_MAP: Record<string, Component> = {
    "instances": markRaw(DesktopOutlined),
    "overview": markRaw(DashboardOutlined),
    "users": markRaw(TeamOutlined),
    "market": markRaw(ShoppingOutlined),
    "settings": markRaw(SettingOutlined),
    "terminal": markRaw(CodeOutlined),
    "my-apps": markRaw(AppstoreOutlined),
    "instance-console": markRaw(CodeOutlined),
    "file-manager": markRaw(FolderOpenOutlined),
    "file-editor": markRaw(EditOutlined),
    "image-viewer": markRaw(PictureOutlined),
    "server-config": markRaw(ControlOutlined),
    "schedule": markRaw(FieldTimeOutlined),
    "event-config": markRaw(DashboardOutlined),
    "term-config": markRaw(CodeOutlined),
    "java-manager": markRaw(BuildOutlined),
    "new-instance": markRaw(DesktopOutlined),
    "user-info": markRaw(UserOutlined),
    "mc-ping": markRaw(UsergroupDeleteOutlined),
    "mod-manager": markRaw(UsbOutlined)
};

const loadDesktopLayout = async () => {
    try {
        const result = await executeGetLayout();
        const layout = result?.value;
        const availableAppIds = new Set(availableDesktopApps.value.map((app) => app.id));
        desktopShortcutIds.clear();
        if (layout && Array.isArray(layout.shortcuts)) {
            for (const id of layout.shortcuts) {
                if (typeof id === "string" && availableAppIds.has(id)) {
                    desktopShortcutIds.add(id);
                }
            }
        } else {
            for (const id of availableAppIds) {
                desktopShortcutIds.add(id);
            }
        }
        shortcutsLoaded.value = true;

        if (layout && Array.isArray(layout.windows) && layout.windows.length > 0) {
            windows.clear();
            for (const win of layout.windows) {
                const desktopApp = availableDesktopApps.value.find(
                    (app) => app.windowContent === win.content || app.id === win.content
                );
                const instanceActionId =
                    win.content === "backup"
                        ? "backup"
                        : typeof win.content === "string" && win.content.startsWith("instance-action:")
                        ? win.content.slice("instance-action:".length)
                        : undefined;
                const instanceAction = instanceActionId
                    ? pluginInstanceActions.value.find((action) => action.id === instanceActionId)
                    : undefined;
                if (win.content.startsWith("panel-plugin:") && !desktopApp?.component) continue;
                if (instanceActionId && !instanceAction?.desktopComponent) continue;
                const icon =
                    desktopApp?.icon ||
                    (instanceAction?.icon ? markRaw(instanceAction.icon) : undefined) ||
                    ICON_MAP[win.content] ||
                    markRaw(DesktopOutlined);
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
                            : desktopApp?.windowContent || win.content,
                    initialX: win.x ?? 100,
                    initialY: win.y ?? 60,
                    initialWidth: win.width ?? 800,
                    initialHeight: win.height ?? 500,
                    instanceId: win.instanceId,
                    daemonId: win.daemonId,
                    type: win.type,
                    filePath: win.filePath,
                    fileName: win.fileName,
                    component:
                        desktopApp?.component ||
                        (instanceAction?.desktopComponent
                            ? markRaw(instanceAction.desktopComponent)
                            : undefined)
                });
            }
        }
        if (layout && Array.isArray(layout.icons)) {
            iconPositions.clear();
            for (const icon of layout.icons) {
                if (desktopShortcutIds.has(icon.id) && typeof icon.x === "number" && typeof icon.y === "number") {
                    iconPositions.set(icon.id, { x: icon.x, y: icon.y });
                }
            }
        }
        layoutLoaded = true;
    } catch (e) {
        desktopShortcutIds.clear();
        availableDesktopApps.value.forEach((app) => desktopShortcutIds.add(app.id));
        shortcutsLoaded.value = true;
        layoutLoaded = true;
        // Silently ignore
    }
};

// Load layout on mount
onMounted(async () => {
    if (isLogged.value) {
        await loadDesktopLayout();
    }
});

const openWindow = (appId: string) => {
    const app = availableDesktopApps.value.find((a) => a.id === appId);
    if (!app) return;

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

const openInstanceConsole = (instance: any, daemonId: string) => {
    const windowId = `console-${instance.instanceUuid}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 100 + windowOffset * 30;
    const offsetY = 60 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: instance.config.nickname || "Console",
        icon: markRaw(CodeOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "instance-console",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 1000,
        initialHeight: 650,
        instanceId: instance.instanceUuid,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openFileManagerWindow = (instanceId: string, daemonId: string, instanceName: string) => {
    const windowId = `file-manager-${instanceId}-${Date.now()}`;

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: `${instanceName} - ${t("TXT_CODE_ae533703")}`,
        icon: markRaw(FolderOpenOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "file-manager",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 900,
        initialHeight: 600,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openFileEditorWindow = (instanceId: string, daemonId: string, filePath: string, fileName: string) => {
    const windowId = `file-editor-${instanceId}-${Date.now()}`;

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 140 + windowOffset * 30;
    const offsetY = 100 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: fileName,
        icon: markRaw(EditOutlined),
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
        icon: markRaw(PictureOutlined),
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

const openServerConfigWindow = (instanceId: string, daemonId: string, type: string) => {
    const windowId = `server-config-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_d07742fe"),
        icon: markRaw(ControlOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "server-config",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 800,
        initialHeight: 600,
        instanceId: instanceId,
        daemonId: daemonId,
        type: type
    });
    saveDesktopLayout();
};

const openScheduleWindow = (instanceId: string, daemonId: string) => {
    const windowId = `schedule-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_b7d026f8"),
        icon: markRaw(FieldTimeOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "schedule",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 700,
        initialHeight: 500,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openEventConfigWindow = (instanceId: string, daemonId: string) => {
    const windowId = `event-config-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_10150756"),
        icon: markRaw(DashboardOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "event-config",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 500,
        initialHeight: 450,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openTermConfigWindow = (instanceId: string, daemonId: string) => {
    const windowId = `term-config-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_d23631cb"),
        icon: markRaw(CodeOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "term-config",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 700,
        initialHeight: 500,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openJavaManagerWindow = (instanceId: string, daemonId: string) => {
    const windowId = `java-manager-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_3fee13ed"),
        icon: markRaw(BuildOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "java-manager",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 800,
        initialHeight: 600,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openMcPingWindow = (instanceId: string, daemonId: string) => {
    const windowId = `mc-ping-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_40241d8e"),
        icon: markRaw(UsergroupDeleteOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "mc-ping",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 500,
        initialHeight: 400,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openModManagerWindow = (instanceId: string, daemonId: string) => {
    const windowId = `mod-manager-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_MOD_MANAGER"),
        icon: markRaw(UsbOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "mod-manager",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 900,
        initialHeight: 600,
        instanceId: instanceId,
        daemonId: daemonId
    });
    saveDesktopLayout();
};

const openInstanceActionWindow = (actionId: string, instanceId: string, daemonId: string) => {
    const action = pluginInstanceActions.value.find(
        (candidate) => candidate.id === actionId && candidate.desktopComponent
    );
    if (!action?.desktopComponent) return;

    const windowId = `instance-action-${actionId}-${instanceId}`;
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: typeof action.title === "function" ? action.title() : action.title,
        icon: markRaw(action.icon),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: `instance-action:${action.id}`,
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: action.desktopInitialWidth || 700,
        initialHeight: action.desktopInitialHeight || 500,
        instanceId: instanceId,
        daemonId: daemonId,
        component: markRaw(action.desktopComponent)
    });
    saveDesktopLayout();
};

const openNewInstanceWindow = () => {
    const windowId = "new-instance";
    const existing = windows.get(windowId);

    if (existing) {
        existing.minimized = false;
        existing.visible = true;
        focusWindow(windowId);
        return;
    }

    windowOffset = (windowOffset + 1) % 8;
    const offsetX = 120 + windowOffset * 30;
    const offsetY = 80 + windowOffset * 30;

    windows.set(windowId, {
        id: windowId,
        title: t("TXT_CODE_DESKTOP_IM_NEW_INSTANCE"),
        icon: markRaw(DesktopOutlined),
        visible: true,
        minimized: false,
        maximized: false,
        zIndex: ++nextZIndex,
        content: "new-instance",
        initialX: offsetX,
        initialY: offsetY,
        initialWidth: 500,
        initialHeight: 400
    });
    saveDesktopLayout();
};

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
        title: t("TXT_CODE_9bb2f08b"),
        icon: markRaw(UserOutlined),
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
    windows.delete(id);
    saveDesktopLayout();
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
    if (win) {
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

// ─── Window events ───
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

// ─── Route ───
const navigateToRoute = (appId: string) => {
    const app = availableDesktopApps.value.find((a) => a.id === appId);
    if (app?.route) {
        router.push(app.route);
    }
};

// ─── Context Menu ───
const ctxMenu = reactive({
    visible: false,
    x: 0,
    y: 0,
    targetWindowId: null as string | null,
    targetShortcutId: null as string | null,
    isTitlebar: false
});

const ctxMenuItems = computed<ContextMenuItem[]>(() => {
    const items: ContextMenuItem[] = [];

    if (ctxMenu.targetShortcutId) {
        const shortcutId = ctxMenu.targetShortcutId;
        items.push({
            label: t("TXT_CODE_DESKTOP_REMOVE_SHORTCUT"),
            icon: markRaw(DeleteOutlined),
            action: () => removeDesktopShortcut(shortcutId)
        });
        return items;
    }

    if (ctxMenu.targetWindowId) {
        if (ctxMenu.isTitlebar) {
            const win = windows.get(ctxMenu.targetWindowId);
            if (win) {
                items.push({
                    label: t("TXT_CODE_DESKTOP_MINIMIZE"),
                    icon: markRaw(MinusOutlined),
                    action: () => {
                        if (ctxMenu.targetWindowId) {
                            minimizeWindow(ctxMenu.targetWindowId);
                        }
                    }
                });
                items.push({
                    label: win.maximized ? (t("TXT_CODE_INSTANCE_BACKUP_RESTORE")) : (t("TXT_CODE_DESKTOP_MAXIMIZE")),
                    icon: markRaw(win.maximized ? FullscreenExitOutlined : FullscreenOutlined),
                    action: () => {
                        if (ctxMenu.targetWindowId) {
                            maximizeWindow(ctxMenu.targetWindowId);
                        }
                    }
                });
                items.push({ divider: true } as any);
            }
        }

        items.push({
            label: t("TXT_CODE_a7e9d4e"),
            icon: markRaw(CloseOutlined),
            action: () => {
                if (ctxMenu.targetWindowId) {
                    closeWindow(ctxMenu.targetWindowId);
                }
            }
        });
        items.push({ divider: true } as any);
    }

    items.push({
        label: t("TXT_CODE_DESKTOP_CLOSE_ALL"),
        icon: markRaw(CloseSquareOutlined),
        action: () => {
            windows.clear();
            saveDesktopLayout();
        }
    });

    return items;
});

const onDesktopContextMenu = (e: MouseEvent) => {
    if (showLoginOverlay.value) return;
    e.preventDefault();
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.targetWindowId = null;
    ctxMenu.targetShortcutId = null;
    ctxMenu.isTitlebar = false;
    ctxMenu.visible = true;
};

const onTaskbarContextMenu = (e: MouseEvent, id: string) => {
    e.preventDefault();
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.targetWindowId = id;
    ctxMenu.targetShortcutId = null;
    ctxMenu.isTitlebar = false;
    ctxMenu.visible = true;
};

const onTitlebarContextMenu = (e: MouseEvent, id: string) => {
    e.preventDefault();
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.targetWindowId = id;
    ctxMenu.targetShortcutId = null;
    ctxMenu.isTitlebar = true;
    ctxMenu.visible = true;
};

const onIconContextMenu = (e: MouseEvent, id: string) => {
    selectedIconId.value = id;
    ctxMenu.x = e.clientX;
    ctxMenu.y = e.clientY;
    ctxMenu.targetWindowId = null;
    ctxMenu.targetShortcutId = id;
    ctxMenu.isTitlebar = false;
    ctxMenu.visible = true;
};

const onDesktopKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Delete" || !selectedIconId.value) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;

    event.preventDefault();
    removeDesktopShortcut(selectedIconId.value);
    ctxMenu.visible = false;
};

onMounted(() => document.addEventListener("keydown", onDesktopKeyDown));
onUnmounted(() => {
    document.removeEventListener("keydown", onDesktopKeyDown);
    if (saveLayoutTimer) clearTimeout(saveLayoutTimer);
});

const closeContextMenu = () => {
    ctxMenu.visible = false;
};

const onDesktopClick = () => {
    selectedIconId.value = null;
    ctxMenu.visible = false;
};

// ─── Exit ───
const exitDesktop = async () => {
    if (authEnabled.value) await logoutUser().execute();
    window.location.reload();
};

const username = computed(() => appState.userInfo?.userName || "User");
</script>

<template>
    <div class="desktop-container" @click="onDesktopClick" @contextmenu="onDesktopContextMenu">
        <div class="desktop-wallpaper" :style="wallpaperStyle"></div>
        <Transition name="desktop-fade">
            <div v-if="!showLoginOverlay" class="desktop-content-wrapper" @mousemove="handleDesktopMouseMove"
                @mouseup="handleDesktopMouseUp">
                <div ref="desktopIconsRef" class="desktop-icons" @dragover.prevent @drop.prevent="handleStartMenuAppDrop">
                    <DesktopIcon v-for="app in desktopApps" :key="app.id" :id="app.id" :label="app.label"
                        :icon="app.icon" :color="app.color" :selected="selectedIconId === app.id"
                        :x="iconPositions.get(app.id)?.x ?? getDefaultPositionForApp(app.id).x"
                        :y="iconPositions.get(app.id)?.y ?? getDefaultPositionForApp(app.id).y" @select="selectIcon"
                        @open="openWindow" @dragstart="handleIconDragStart" @contextmenu="onIconContextMenu" />

                    <!-- Drop indicator -->
                    <div v-if="isDragging && dropValid" class="drop-indicator"
                        :style="{ left: dropX + 'px', top: dropY + 'px' }">
                        <div class="drop-indicator__highlight"></div>
                    </div>

                    <!-- Ghost -->
                    <div v-if="isDragging && droppingIconId" class="drag-ghost"
                        :style="{ left: ghostX + 'px', top: ghostY + 'px' }">
                        <template v-for="app in desktopApps" :key="app.id">
                            <div v-if="app.id === droppingIconId" class="drag-ghost__inner">
                                <component :is="app.icon" v-if="typeof app.icon !== 'string'"
                                    class="drag-ghost__icon" />
                                <span v-else class="drag-ghost__emoji">{{ app.icon }}</span>
                                <span class="drag-ghost__label">{{ app.label }}</span>
                            </div>
                        </template>
                    </div>
                </div>

                <TransitionGroup name="desktop-window-group">
                    <DesktopWindow v-for="[id, win] in windows" :key="id" :id="win.id" :title="win.title"
                        :icon="win.icon" :visible="win.visible" :minimized="win.minimized" :maximized="win.maximized"
                        :active="win.id === activeWindowId" :initial-x="win.initialX" :initial-y="win.initialY"
                        :initial-width="win.initialWidth" :initial-height="win.initialHeight" :z-index="win.zIndex"
                        @close="closeWindow" @minimize="minimizeWindow" @maximize="maximizeWindow" @focus="focusWindow"
                        @moved="handleWindowMoved" @resized="handleWindowResized"
                        @contextmenu-titlebar="onTitlebarContextMenu">
                        <div class="window-inner-content">
                            <DesktopMyApps v-if="win.content === 'my-apps'" @open-console="openInstanceConsole" />

                            <DesktopInstanceManager v-else-if="win.content === 'instances'"
                                @open-console="openInstanceConsole" @open-new-instance="openNewInstanceWindow" />

                            <DesktopNewInstance v-else-if="win.content === 'new-instance'"
                                @close="closeWindow(win.id)" />

                            <DesktopInstanceConsole
                                v-else-if="win.content === 'instance-console' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId"
                                @open-server-config="openServerConfigWindow" @open-file-manager="openFileManagerWindow"
                                @open-mod-manager="openModManagerWindow" @open-schedule="openScheduleWindow"
                                @open-event-config="openEventConfigWindow" @open-term-config="openTermConfigWindow"
                                @open-mc-ping="openMcPingWindow" @open-java-manager="openJavaManagerWindow"
                                @open-instance-action="openInstanceActionWindow" />

                            <component :is="win.component"
                                v-else-if="win.content.startsWith('instance-action:') && win.component && win.instanceId && win.daemonId"
                                :instance-uuid="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)"
                                @open-file-editor="(filePath: string, fileName: string) => openFileEditorWindow(win.instanceId!, win.daemonId!, filePath, fileName)" />

                            <DesktopServerConfig
                                v-else-if="win.content === 'server-config' && win.instanceId && win.daemonId && win.type"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" :type="win.type" />

                            <DesktopSchedule v-else-if="win.content === 'schedule' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" />

                            <DesktopEventConfig
                                v-else-if="win.content === 'event-config' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)" />

                            <DesktopTermConfig
                                v-else-if="win.content === 'term-config' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)" />

                            <DesktopMcPing v-else-if="win.content === 'mc-ping' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)" />

                            <DesktopJavaManager
                                v-else-if="win.content === 'java-manager' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)" />

                            <DesktopModManager
                                v-else-if="win.content === 'mod-manager' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" @close="closeWindow(win.id)"
                                @open-file-editor="(filePath: string, fileName: string) => openFileEditorWindow(win.instanceId!, win.daemonId!, filePath, fileName)" />

                            <DesktopFileManager
                                v-else-if="win.content === 'file-manager' && win.instanceId && win.daemonId"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" :session-id="win.id"
                                @open-file-editor="(filePath: string, fileName: string) => openFileEditorWindow(win.instanceId!, win.daemonId!, filePath, fileName)"
                                @open-image-viewer="(filePath: string, fileName: string) => openImageViewerWindow(win.instanceId!, win.daemonId!, filePath, fileName)" />

                            <DesktopFileEditor
                                v-else-if="win.content === 'file-editor' && win.instanceId && win.daemonId && win.filePath && win.fileName"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" :file-path="win.filePath"
                                :file-name="win.fileName" @close="closeWindow(win.id)" />

                            <DesktopImageViewer
                                v-else-if="win.content === 'image-viewer' && win.instanceId && win.daemonId && win.filePath && win.fileName"
                                :instance-id="win.instanceId" :daemon-id="win.daemonId" :file-path="win.filePath"
                                :file-name="win.fileName" @close="closeWindow(win.id)" />

                            <DesktopOverview v-else-if="win.content === 'overview'" />

                            <component :is="desktopUsersWindow" v-else-if="win.content === 'users' && desktopUsersWindow" />

                            <DesktopSettings v-else-if="win.content === 'settings'" />

                            <DesktopMarket v-else-if="win.content === 'market'" @open-console="openInstanceConsole" />

                            <DesktopTerminalSelector v-else-if="win.content === 'terminal'"
                                @open-console="openInstanceConsole" />

                            <component :is="desktopUserInfoWindow"
                                v-else-if="win.content === 'user-info' && desktopUserInfoWindow" />

                            <component :is="win.component" v-else-if="win.component" />

                            <div v-else class="window-page">
                                <p>{{ win.title }}</p>
                            </div>
                        </div>
                    </DesktopWindow>
                </TransitionGroup>
                <DesktopTaskbar :windows="taskbarWindows" :apps="availableDesktopApps" :username="username"
                    :user-avatar="desktopStartMenuAvatar"
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
}

.desktop-icons {
    position: relative;
    z-index: 1;
    width: 100%;
    height: calc(100vh - 48px);
    overflow: hidden;
}

/* Drag Ghost */
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
    backdrop-filter: blur(8px);
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

/* Drop Indicator */
.drop-indicator {
    position: absolute;
    z-index: 9998;
    pointer-events: none;
    width: 90px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.drop-indicator__highlight {
    width: 74px;
    height: 74px;
    border-radius: 12px;
    border: 2px dashed rgba(255, 255, 255, 0.45);
    background: rgba(255, 255, 255, 0.06);
}

.window-inner-content {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.window-page {
    padding: 24px;
    height: 100%;
    display: flex;
    flex-direction: column;

    &__header {
        margin-bottom: 20px;

        h3 {
            font-size: 20px;
            font-weight: 600;
            color: #fff;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        p {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.6);
            margin: 0;
        }
    }
}

.desktop-window-group-enter-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.desktop-window-group-leave-active {
    transition: all 0.2s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.desktop-window-group-enter-from {
    opacity: 0;
    transform: scale(0.95);
}

.desktop-window-group-leave-to {
    opacity: 0;
    transform: scale(0.95);
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
