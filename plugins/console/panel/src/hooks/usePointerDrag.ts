import { onUnmounted, ref } from "vue";

interface PointerDragItem<T> {
  id: string;
  label: string;
  value: T;
}

interface PointerDragOptions<T> {
  onDrop: (value: T, event: PointerEvent) => void;
  scrollContainer?: string;
  previewClass?: string;
}

export function usePointerDrag<T>(options: PointerDragOptions<T>) {
  const draggingId = ref("");
  let pointer: {
    item: PointerDragItem<T>;
    pointerId: number;
    x: number;
    y: number;
    list: HTMLElement | null;
  } | null = null;
  let preview: HTMLElement | null = null;
  let position = { x: 0, y: 0 };
  let scrollFrame = 0;
  let suppressClick = false;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;

  const preventTextSelection = (event: Event) => event.preventDefault();

  const releaseClickGuard = () => {
    window.removeEventListener("click", suppressDragClick, true);
    clearTimeout(clickTimer);
    clickTimer = undefined;
  };

  const cancelDrag = () => {
    document.removeEventListener("selectstart", preventTextSelection, true);
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", cancelPointer);
    window.removeEventListener("blur", cancelDrag);
    pointer = null;
    draggingId.value = "";
    preview?.remove();
    preview = null;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    releaseClickGuard();
  };

  const scrollDragList = () => {
    scrollFrame = 0;
    const list = pointer?.list;
    if (
      !draggingId.value ||
      !list ||
      !list.contains(document.elementFromPoint(position.x, position.y))
    )
      return;
    const bounds = list.getBoundingClientRect();
    const delta = position.y < bounds.top + 28 ? -8 : position.y > bounds.bottom - 28 ? 8 : 0;
    const previous = list.scrollTop;
    list.scrollTop += delta;
    if (list.scrollTop !== previous) scrollFrame = requestAnimationFrame(scrollDragList);
  };

  const moveDrag = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    if (!(event.buttons & 1)) return cancelDrag();
    if (!draggingId.value) {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 20) return;
      draggingId.value = pointer.item.id;
      suppressClick = true;
      window.getSelection()?.removeAllRanges();
      preview = document.createElement("span");
      preview.className = options.previewClass || "pointer-drag-preview";
      preview.textContent = pointer.item.label;
      Object.assign(preview.style, {
        position: "fixed",
        top: "0",
        left: "0",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: "21000",
        padding: "4px 10px",
        borderRadius: "14px",
        background: "rgb(var(--v-theme-surface, 255 255 255))",
        color: "rgb(var(--v-theme-on-surface, 0 0 0))",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
        font: "12px sans-serif",
        whiteSpace: "nowrap"
      });
      document.body.appendChild(preview);
    }
    event.preventDefault();
    position = { x: event.clientX, y: event.clientY };
    if (preview)
      preview.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 14}px)`;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollDragList);
  };

  const finishDrag = (event: PointerEvent) => {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    const item = pointer.item;
    const dragged = !!draggingId.value;
    cancelDrag();
    if (dragged) {
      window.addEventListener("click", suppressDragClick, true);
      clickTimer = setTimeout(releaseClickGuard, 0);
      options.onDrop(item.value, event);
    }
  };

  const cancelPointer = (event: PointerEvent) => {
    if (event.pointerId === pointer?.pointerId) cancelDrag();
  };

  const prepareDrag = (event: PointerEvent, item: PointerDragItem<T>) => {
    if (!event.isPrimary || event.button !== 0 || event.pointerType === "touch" || pointer) return;
    if (
      (event.target as Element | null)?.closest(
        "button, a, input, select, textarea, [contenteditable]"
      )
    )
      return;
    event.preventDefault();
    releaseClickGuard();
    suppressClick = false;
    pointer = {
      item,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      list: options.scrollContainer
        ? (event.currentTarget as HTMLElement).closest(options.scrollContainer)
        : null
    };
    document.addEventListener("selectstart", preventTextSelection, true);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("blur", cancelDrag);
  };

  const suppressDragClick = (event: MouseEvent) => {
    if (!suppressClick || !event.detail) return false;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
    releaseClickGuard();
    return true;
  };

  onUnmounted(cancelDrag);
  return { prepareDrag, suppressDragClick, draggingId, cancelDrag };
}
