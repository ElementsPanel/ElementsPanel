import type { PanelFrontendDesktopView } from "@elements-panel/sdk";
import type { Component, InjectionKey, Ref } from "vue";

export interface WindowState {
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
  props?: Record<string, unknown>;
}

export interface DesktopWindowContext {
  activeWindowId: Readonly<Ref<string>>;
  views: Readonly<Ref<ReadonlyMap<string, PanelFrontendDesktopView>>>;
  fileEditor: Readonly<Ref<Component | undefined>>;
  imageViewer: Readonly<Ref<Component | undefined>>;
  users: Readonly<Ref<Component | undefined>>;
  userInfo: Readonly<Ref<Component | undefined>>;
  close: (id: string) => void;
  closed: (id: string) => void;
  minimize: (id: string) => void;
  maximize: (id: string) => void;
  focus: (id: string) => void;
  moved: (id: string, x: number, y: number) => void;
  resized: (id: string, x: number, y: number, width: number, height: number) => void;
  contextMenu: (event: MouseEvent, id: string) => void;
  openConsole: (instance: unknown, daemonId: string) => unknown;
  openFileEditor: (instanceId: string, daemonId: string, path: string, name: string) => void;
  openImageViewer: (instanceId: string, daemonId: string, path: string, name: string) => void;
}

export const desktopWindowContextKey: InjectionKey<DesktopWindowContext> = Symbol.for(
  "elementspanel.desktop-windows"
);
