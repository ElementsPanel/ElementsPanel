import fs from "node:fs";
import path from "node:path";
import type { PanelPluginContext } from "../../../../src/app/plugins";

const DESKTOP_LAYOUT_DIR = "desktop_layouts";

type Logger = PanelPluginContext["logger"];

export interface DesktopWindowLayout {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface DesktopIconLayout {
  id: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface DesktopLayout {
  windows: DesktopWindowLayout[];
  icons?: DesktopIconLayout[];
  shortcuts?: string[];
  updatedAt?: number;
}

function getLayoutFile(userUuid: string) {
  if (typeof userUuid !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(userUuid)) {
    throw new Error("Invalid user UUID");
  }
  return path.join(process.cwd(), "data", DESKTOP_LAYOUT_DIR, `${userUuid}.json`);
}

export function getDesktopLayout(userUuid: string, logger: Logger): DesktopLayout | null {
  const file = getLayoutFile(userUuid);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    logger.error(`Failed to read desktop layout for user ${userUuid}: ${error}`);
    return null;
  }
}

function validateDesktopLayout(layout: DesktopLayout) {
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
}

export function setDesktopLayout(userUuid: string, layout: DesktopLayout, logger: Logger) {
  try {
    validateDesktopLayout(layout);
    layout.updatedAt = Date.now();
    const directory = path.dirname(getLayoutFile(userUuid));
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(getLayoutFile(userUuid), JSON.stringify(layout, null, 2), "utf8");
  } catch (error) {
    logger.error(`Failed to save desktop layout for user ${userUuid}: ${error}`);
    throw error;
  }
}
