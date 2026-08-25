import fs from "fs-extra";
import { StorageSubsystem } from "mcsmanager-common";
import path from "path";
import storage from "../common/system_storage";
import { logger } from "./log";

const DESKTOP_LAYOUT_DIR = "desktop_layouts";

function getLayoutFileName(userUuid: string): string {
    return `${DESKTOP_LAYOUT_DIR}/${userUuid}.json`;
}

export interface IDesktopWindowLayout {
    id: string;
    content: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
    zIndex: number;
    instanceId?: string;
    daemonId?: string;
    type?: string;
    filePath?: string;
    fileName?: string;
}

export interface IDesktopIconPosition {
    id: string;
    x: number;
    y: number;
}

export interface IDesktopLayout {
    windows: IDesktopWindowLayout[];
    icons?: IDesktopIconPosition[];
    shortcuts?: string[];
    updatedAt: number;
}

export function getDesktopLayout(userUuid: string): IDesktopLayout | null {
    const fileName = getLayoutFileName(userUuid);
    try {
        if (storage.fileExists(fileName)) {
            const data = storage.readFile(fileName);
            if (data) {
                return JSON.parse(data) as IDesktopLayout;
            }
        }
    } catch (err) {
        logger.error(`Failed to read desktop layout for user ${userUuid}: ${err}`);
    }
    return null;
}

export function setDesktopLayout(userUuid: string, layout: IDesktopLayout): void {
    const fileName = getLayoutFileName(userUuid);
    try {
        if (!Array.isArray(layout?.windows)) {
            throw new Error("Invalid desktop layout: windows must be an array");
        }
        if (layout.windows.length > 50) {
            throw new Error("Too many windows in layout (max 50)");
        }
        for (const win of layout.windows) {
            if (typeof win.id !== "string" || win.id.length > 200) {
                throw new Error("Invalid window id");
            }
            if (typeof win.content !== "string" || win.content.length > 100) {
                throw new Error("Invalid window content type");
            }
            if (typeof win.x !== "number" || typeof win.y !== "number") {
                throw new Error("Invalid window position");
            }
            if (typeof win.width !== "number" || typeof win.height !== "number") {
                throw new Error("Invalid window size");
            }
        }
        if (layout.icons != null) {
            if (!Array.isArray(layout.icons)) {
                throw new Error("Invalid desktop layout: icons must be an array");
            }
            if (layout.icons.length > 100) {
                throw new Error("Too many icons in layout (max 100)");
            }
            for (const icon of layout.icons) {
                if (typeof icon.id !== "string" || icon.id.length > 100) {
                    throw new Error("Invalid icon id");
                }
                if (typeof icon.x !== "number" || typeof icon.y !== "number") {
                    throw new Error("Invalid icon position");
                }
            }
        }
        if (layout.shortcuts != null) {
            if (!Array.isArray(layout.shortcuts)) {
                throw new Error("Invalid desktop layout: shortcuts must be an array");
            }
            if (layout.shortcuts.length > 100) {
                throw new Error("Too many shortcuts in layout (max 100)");
            }
            for (const shortcut of layout.shortcuts) {
                if (typeof shortcut !== "string" || shortcut.length > 100) {
                    throw new Error("Invalid desktop shortcut id");
                }
            }
        }
        layout.updatedAt = Date.now();
        const dirPath = path.join(StorageSubsystem.DATA_PATH, DESKTOP_LAYOUT_DIR);
        if (!fs.existsSync(dirPath)) fs.mkdirsSync(dirPath);
        storage.writeFile(fileName, JSON.stringify(layout, null, 2));
    } catch (err) {
        logger.error(`Failed to save desktop layout for user ${userUuid}: ${err}`);
        throw err;
    }
}

export function deleteDesktopLayout(userUuid: string): void {
    const fileName = getLayoutFileName(userUuid);
    try {
        if (storage.fileExists(fileName)) {
            storage.deleteFile(fileName);
        }
    } catch (err) {
        logger.error(`Failed to delete desktop layout for user ${userUuid}: ${err}`);
    }
}
