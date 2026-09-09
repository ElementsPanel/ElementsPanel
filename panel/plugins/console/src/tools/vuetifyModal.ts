import { createApp, defineComponent, h, shallowReactive, type VNode } from "vue";
import AppDialog from "../components/AppDialog.vue";
import { installVuetify } from "../vuetify";

type Renderable = string | VNode | Renderable[] | (() => Renderable) | undefined;

export interface ModalOptions {
  title?: Renderable;
  content?: Renderable;
  icon?: Renderable;
  onOk?: () => unknown;
  onCancel?: () => unknown;
  okText?: string;
  cancelText?: string;
  okType?: string;
  okButtonProps?: Record<string, unknown>;
  footer?: Renderable;
  maskClosable?: boolean;
  closable?: boolean;
  centered?: boolean;
  width?: string | number;
  maxWidth?: string | number;
}

export interface ModalHandle {
  destroy: () => void;
  update: (next: Partial<ModalOptions>) => void;
}

const activeDialogs = new Set<ModalHandle>();

const resolveRenderable = (value: Renderable): Renderable => {
  return typeof value === "function" ? resolveRenderable(value()) : value;
};

const asChildren = (value: Renderable) => {
  const resolved = resolveRenderable(value);
  return resolved == null ? [] : Array.isArray(resolved) ? resolved : [resolved];
};

function openDialog(options: ModalOptions, variant: "confirm" | "alert"): ModalHandle {
  const state = shallowReactive({
    ...options,
    open: true,
    loading: false,
    variant
  });
  const host = document.createElement("div");
  document.body.appendChild(host);

  let app: ReturnType<typeof createApp>;
  let handle: ModalHandle;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

  const destroy = () => {
    if (!state.open && cleanupTimer) return;
    state.open = false;
    cleanupTimer = setTimeout(() => {
      app?.unmount();
      host.remove();
      activeDialogs.delete(handle);
    }, 300);
  };

  const update = (next: Partial<ModalOptions>) => {
    Object.assign(state, next);
  };

  handle = { destroy, update };
  activeDialogs.add(handle);

  const submit = async () => {
    if (state.loading) return;
    try {
      const result = state.onOk?.();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        state.loading = true;
        const resolved = await result;
        if (resolved !== false) destroy();
      } else if (result !== false) {
        destroy();
      }
    } catch {
      // Keep the dialog open when an async confirmation rejects.
    } finally {
      state.loading = false;
    }
  };

  const cancel = () => {
    state.onCancel?.();
    destroy();
  };

  const DialogHost = defineComponent({
    setup() {
      return () => {
        const title = resolveRenderable(state.title);
        const icon = resolveRenderable(state.icon);
        const hasTitleSlot = icon != null || (title != null && typeof title !== "string");
        const dialogSlots: Record<string, any> = {
          default: () => asChildren(state.content)
        };
        if (state.footer != null) {
          dialogSlots.footer = () => asChildren(state.footer);
        }
        if (hasTitleSlot) {
          dialogSlots.title = () => [...asChildren(icon), ...asChildren(title)];
        }
        return h(
          AppDialog,
          {
            open: state.open,
            title: hasTitleSlot ? undefined : title,
            closable: state.closable !== false,
            maskClosable: state.maskClosable !== false,
            confirmLoading: state.loading,
            okText: state.okText,
            cancelText: state.cancelText,
            okType: state.okType,
            okButtonProps: state.okButtonProps,
            compact: variant === "confirm",
            width: state.width,
            maxWidth: state.maxWidth,
            showCancel: variant === "confirm",
            onOk: submit,
            onCancel: cancel
          },
          dialogSlots
        );
      };
    }
  });

  app = createApp(DialogHost);
  installVuetify(app);
  app.mount(host);
  return handle;
}

export const Modal = {
  confirm: (options: ModalOptions) => openDialog(options, "confirm"),
  info: (options: ModalOptions) => openDialog(options, "alert"),
  success: (options: ModalOptions) => openDialog(options, "alert"),
  error: (options: ModalOptions) => openDialog(options, "alert"),
  warning: (options: ModalOptions) => openDialog(options, "alert"),
  warn: (options: ModalOptions) => openDialog(options, "alert"),
  destroyAll: () => {
    activeDialogs.forEach((dialog) => dialog.destroy());
  }
};
