import type { Component } from "vue";

export const CloseOutlined = "mdi-close";
export const CloseSquareOutlined = "mdi-close-box-outline";
export const DeleteOutlined = "mdi-delete-outline";
export const DesktopOutlined = "mdi-monitor";
export const EditOutlined = "mdi-pencil-outline";
export const FullscreenExitOutlined = "mdi-fullscreen-exit";
export const FullscreenOutlined = "mdi-fullscreen";
export const MinusOutlined = "mdi-minus";
export const PictureOutlined = "mdi-image-outline";
export const TeamOutlined = "mdi-account-group-outline";
export const UserOutlined = "mdi-account-outline";

// Map legacy component icons to MDI glyphs at the desktop shell boundary.
export const DESKTOP_ICON_MAP: Record<string, string> = {
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

export const getDesktopIcon = (id: string, icon?: Component | string): string | Component =>
  DESKTOP_ICON_MAP[id] ||
  (typeof icon === "string" && icon.startsWith("mdi-") ? icon : "mdi-application-outline");
