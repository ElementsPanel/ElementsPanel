import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@console/stores/useAppStateStore";
import { setAppLoadingError, setLoadingTitle } from "@console/tools/dom";

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("request failed with status code 500")
    ? "The backend is currently unavailable, please try again later."
    : message;
}

export async function apply(ctx: PanelFrontendPluginContext) {
  const { state, updatePanelStatus } = useAppStateStore();
  ctx.set("startup", {
    get language() {
      return state.language;
    },
    showError: (error: unknown) => setAppLoadingError(errorMessage(error))
  });
  ctx.effect(() => {
    const onRejection = (event: PromiseRejectionEvent) =>
      console.error("Unhandled promise rejection:", event.reason);
    const onUnload = () => void ctx.stop();
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("beforeunload", onUnload, { once: true });
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("beforeunload", onUnload);
    };
  });

  setLoadingTitle("Initializing Application...");
  try {
    await updatePanelStatus();
  } catch (error) {
    throw new Error(errorMessage(error));
  }
  setLoadingTitle("Initializing Language...");
}
