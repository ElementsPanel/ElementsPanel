/// <reference types="vite/client" />

declare module "virtual:panel-plugins" {
  export const panelPluginModules: Array<{
    metadata: Record<string, unknown>;
    directory: string;
    module: Record<string, unknown>;
  }>;
}
