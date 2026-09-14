import {
  createApp,
  defineComponent,
  h,
  isVNode,
  shallowReactive,
  type VNode,
  type VNodeChild
} from "vue";
import { VIcon, VSnackbar } from "vuetify/components";
import { installVuetify } from "../vuetify";

type ToastType = "success" | "error" | "warning" | "info";
type Renderable = string | number | VNode | Renderable[] | (() => Renderable) | undefined;

export interface ToastOptions {
  message?: Renderable;
  description?: Renderable;
  content?: Renderable;
  type?: ToastType;
  duration?: number;
  placement?: string;
}

interface ToastItem {
  id: number;
  type: ToastType;
  content: Renderable;
  description?: Renderable;
  timeout: number;
  visible: boolean;
  closing: boolean;
  removeTimer?: ReturnType<typeof setTimeout>;
}

const MAX_VISIBLE = 3;
const DEFAULT_TIMEOUT = 5000;
const pendingToasts: ToastItem[] = [];
const activeToasts = shallowReactive<ToastItem[]>([]);
let nextId = 1;
let mounted = false;
let host: HTMLDivElement | undefined;
let app: ReturnType<typeof createApp> | undefined;

const typeIcon: Record<ToastType, string> = {
  success: "mdi-check-circle-outline",
  error: "mdi-alert-circle-outline",
  warning: "mdi-alert-outline",
  info: "mdi-information-outline"
};

// Vuetify 3.7's snackbar queue only displays one item at a time.
const showNextToasts = () => {
  while (activeToasts.length < MAX_VISIBLE && pendingToasts.length > 0) {
    const item = pendingToasts.shift()!;
    item.visible = true;
    activeToasts.push(item);
  }
};

const finalizeToast = (item: ToastItem) => {
  if (item.removeTimer) {
    clearTimeout(item.removeTimer);
    item.removeTimer = undefined;
  }
  const index = activeToasts.indexOf(item);
  if (index < 0) return;
  activeToasts.splice(index, 1);
  showNextToasts();
  if (activeToasts.length === 0) {
    app?.unmount();
    host?.remove();
    app = undefined;
    host = undefined;
    mounted = false;
  }
};

const removeToast = (item: ToastItem) => {
  const pendingIndex = pendingToasts.indexOf(item);
  if (pendingIndex >= 0) {
    pendingToasts.splice(pendingIndex, 1);
    return;
  }
  if (item.closing || activeToasts.indexOf(item) < 0) return;
  item.closing = true;
  item.visible = false;

  // Keep the item mounted long enough for VSnackbar's leave transition. The
  // after-leave hook normally removes it sooner; this also covers a close
  // call made before the first render has completed.
  item.removeTimer = setTimeout(() => finalizeToast(item), 250);
};

const resolveRenderable = (value: Renderable): VNodeChild => {
  if (typeof value === "function") return resolveRenderable(value());
  if (Array.isArray(value)) return value.map(resolveRenderable);
  return value;
};

const hasContent = (value: Renderable): boolean => {
  if (typeof value === "function") return hasContent(value());
  if (Array.isArray(value)) return value.some(hasContent);
  return typeof value === "string" ? value.trim().length > 0 : value != null;
};

const ensureMounted = () => {
  if (mounted || typeof document === "undefined") return;
  mounted = true;
  host = document.createElement("div");
  host.className = "vuetify-toast-host";
  document.body.appendChild(host);

  const ToastHost = defineComponent({
    setup() {
      return () =>
        [...activeToasts].reverse().map((item) => {
          const content = resolveRenderable(item.content);
          const description = resolveRenderable(item.description);
          const textChildren: VNodeChild[] = [];
          if (content != null) textChildren.push(...(Array.isArray(content) ? content : [content]));
          if (description != null) {
            textChildren.push(
              h(
                "div",
                { class: "vuetify-toast-description" },
                Array.isArray(description) ? description : [description]
              )
            );
          }

          const children = h("div", { class: "vuetify-toast-content" }, [
            h(VIcon, {
              icon: typeIcon[item.type],
              class: "vuetify-toast-icon",
              size: 20
            }),
            h("div", { class: "vuetify-toast-text" }, textChildren)
          ]);

          return h(
            VSnackbar,
            {
              key: item.id,
              class: "vuetify-toast",
              modelValue: item.visible,
              "onUpdate:modelValue": (value: boolean) => {
                if (!value) removeToast(item);
              },
              onAfterLeave: () => finalizeToast(item),
              attach: true,
              color: item.type,
              location: "top center",
              minWidth: 0,
              maxWidth: "min(560px, calc(100vw - 32px))",
              zIndex: 10000,
              rounded: "xl",
              timeout: item.timeout,
              variant: "tonal",
              multiLine: description != null
            },
            { default: () => children }
          );
        });
    }
  });

  app = createApp(ToastHost);
  installVuetify(app);
  app.mount(host);
};

const openToast = (type: ToastType, options: ToastOptions | Renderable) => {
  const normalized: ToastOptions =
    typeof options === "object" && options !== null && !Array.isArray(options) && !isVNode(options)
      ? (options as ToastOptions)
      : { content: options as Renderable };
  const content = normalized.message ?? normalized.content;
  const description = normalized.description;
  if (!hasContent(content) && !hasContent(description)) return { close: () => undefined };

  ensureMounted();
  if (!mounted) return { close: () => undefined };

  const item = shallowReactive<ToastItem>({
    id: nextId++,
    type,
    content: typeof content === "string" ? content.trim() : content,
    description: typeof description === "string" ? description.trim() : description,
    timeout: normalized.duration === 0 ? -1 : normalized.duration ?? DEFAULT_TIMEOUT,
    visible: false,
    closing: false
  });
  pendingToasts.push(item);
  showNextToasts();

  return {
    close: () => {
      removeToast(item);
    }
  };
};

const createMessage = (type: ToastType) => (content: Renderable, duration?: number) =>
  openToast(type, { content, duration });

export const message = {
  success: createMessage("success"),
  error: createMessage("error"),
  warning: createMessage("warning"),
  warn: createMessage("warning"),
  info: createMessage("info")
};

export const notification = {
  success: (options: ToastOptions) => openToast("success", options),
  error: (options: ToastOptions) => openToast("error", options),
  warning: (options: ToastOptions) => openToast("warning", options),
  warn: (options: ToastOptions) => openToast("warning", options),
  info: (options: ToastOptions) => openToast("info", options),
  open: (options: ToastOptions) => openToast(options.type ?? "info", options)
};

export const destroyAll = () => {
  pendingToasts.splice(0, pendingToasts.length);
  activeToasts.forEach((item) => {
    if (item.removeTimer) clearTimeout(item.removeTimer);
  });
  activeToasts.splice(0, activeToasts.length);
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mounted = false;
};
