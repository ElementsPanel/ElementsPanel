import { createApp, type App, type Component } from "vue";
import { installVuetify } from "../vuetify";

export function useMountComponent(data: object = {}) {
  let pendingMount: Promise<unknown> | undefined;

  const createHost = <T extends Component>(
    component: Component,
    onResult?: (value: unknown) => void,
    onClose?: () => void,
    onDestroy?: () => void
  ) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    let app: App;
    let closing = false;
    let destroyed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(timer);
      app?.unmount();
      div.remove();
      onDestroy?.();
    };

    const destroy = (delay = 1000) => {
      if (!closing) {
        closing = true;
        onClose?.();
      }
      if (destroyed) return;
      if (delay <= 0) cleanup();
      else if (!timer) timer = setTimeout(cleanup, delay);
    };

    try {
      app = createApp(component, {
        ...data,
        destroyComponent: destroy,
        ...(onResult
          ? {
              emitResult: (value: unknown) => {
                onResult(value);
                destroy();
              }
            }
          : {})
      });
      installVuetify(app);
      const mountedComponent = app.mount(div);
      return {
        component: mountedComponent as unknown as T,
        app,
        div,
        destroyFc: () => destroy(0)
      };
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  const mount = <T>(component: Component): Promise<T | undefined> => {
    if (pendingMount) return pendingMount as Promise<T | undefined>;
    let resolveResult!: (value: T | undefined) => void;
    let rejectResult!: (reason: unknown) => void;
    const result = new Promise<T | undefined>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    pendingMount = result;
    try {
      createHost(
        component,
        (value) => resolveResult(value as T),
        () => resolveResult(undefined),
        () => {
          pendingMount = undefined;
        }
      );
    } catch (error) {
      rejectResult(error);
    }
    return result;
  };

  const loadApp = <T extends Component>(component: Component) => createHost<T>(component);
  const load = <T extends Component>(component: Component): T => loadApp<T>(component).component;

  return { mount, load, loadApp };
}
