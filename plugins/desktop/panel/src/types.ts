import type { Component } from "vue";
import type { WindowState } from "./windowContext";

export type DesktopWindowProps = Pick<WindowState, "props" | "instanceId" | "daemonId" | "type">;

export interface SavedDesktopWindow extends DesktopWindowProps {
  id: string;
  content: string;
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  maximized?: boolean;
  zIndex?: number;
  filePath?: string;
  fileName?: string;
}

export interface DesktopApp {
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
