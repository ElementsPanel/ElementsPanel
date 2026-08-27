/// <reference types="vite/client" />

declare module "*.scss?inline" {
  const css: string;
  export default css;
}

declare module "virtual:panel-plugins" {
  export const panelPluginModules: Array<{
    metadata: Record<string, unknown>;
    directory: string;
    assetDirectory: string;
    load: (cacheKey?: string) => Promise<Record<string, unknown>>;
  }>;
}
