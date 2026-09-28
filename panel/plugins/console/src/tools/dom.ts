import type { PanelFrontendPluginDiagnostic } from "@/plugin/context";

export function findParentWithClass(element: HTMLElement, className: string): HTMLElement | null {
  if (element.classList.contains(className)) {
    return element;
  }
  let parentElement = element.parentElement;

  while (parentElement !== null) {
    if (parentElement.classList.contains(className)) {
      return parentElement;
    }
    parentElement = parentElement.parentElement;
  }

  return null;
}

export function closeAppLoading() {
  window.closeLoadingContainer();
}

export function setLoadingTitle(title: string) {
  window.setLoadingTitle(title);
}

export function setAppLoadingError(error: string) {
  window.setAppLoadingError(error);
}

export function setAppLoadingPlugins(plugins: readonly PanelFrontendPluginDiagnostic[]) {
  window.setAppLoadingPlugins(plugins);
}
