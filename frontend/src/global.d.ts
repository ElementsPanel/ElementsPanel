declare module "*.json" {
  export default any;
}

interface Window {
  closeLoadingContainer(): void;
  setLoadingTitle(title: string): void;
  setAppLoadingError(error: string): void;
  setAppLoadingPlugins(
    plugins: readonly {
      id: string;
      state: string;
      required: boolean;
      missingServices: readonly string[];
      error?: string;
    }[]
  ): void;
}
