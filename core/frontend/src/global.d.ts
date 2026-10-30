declare module "*.json" {
  export default any;
}

interface Window {
  closeLoadingContainer(): void;
  setLoadingTitle(title: string): void;
  setAppLoadingError(error: string): void;
}
