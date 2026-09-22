import { onUnmounted, ref, watch } from "vue";

interface DialogCallbacks<T> {
  destroyComponent?: (delay?: number) => void;
  emitResult?: (data?: T) => void;
}

export function useDialog<T = unknown>(props: DialogCallbacks<T>) {
  const isVisible = ref(false);
  let pending: Promise<T | undefined> | undefined;
  let resolveDialog: ((value?: T) => void) | undefined;
  let closing = false;
  let disposed = false;

  const finish = (value?: T, submitted = false) => {
    if (!isVisible.value && !resolveDialog) return;
    const resolve = resolveDialog;
    resolveDialog = undefined;
    pending = undefined;
    isVisible.value = false;
    resolve?.(value);
    if (submitted) props.emitResult?.(value);
    if (!closing && props.destroyComponent) {
      closing = true;
      props.destroyComponent();
    }
  };

  const openDialog = (): Promise<T | undefined> => {
    if (disposed || closing) return Promise.resolve(undefined);
    if (pending) return pending;
    pending = new Promise<T | undefined>((resolve) => {
      resolveDialog = resolve;
    });
    isVisible.value = true;
    return pending;
  };

  const cancel = () => finish();
  const submit = (data?: T) => finish(data, true);

  watch(
    isVisible,
    (visible) => {
      if (!visible && resolveDialog) cancel();
    },
    { flush: "sync" }
  );

  onUnmounted(() => {
    disposed = true;
    resolveDialog?.(undefined);
    resolveDialog = undefined;
    pending = undefined;
    isVisible.value = false;
  });

  return { openDialog, isVisible, cancel, submit };
}

export function usePromiseDialog<T = unknown>(props: DialogCallbacks<T>) {
  const dialog = useDialog<T>(props);
  void dialog.openDialog();
  return dialog;
}
