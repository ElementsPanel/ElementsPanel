import { onUnmounted, ref } from "vue";

interface Options {
  closePluginContextMenu: () => void;
  movePluginToGroup: (pluginId: string, groupId: string) => void;
  selectPlugin: (pluginId: string) => void;
}
export function usePluginDrag(options: Options) {
  const { closePluginContextMenu, movePluginToGroup, selectPlugin } = options;

  const draggedPluginId = ref("");
  const dragOverGroupId = ref("");
  const PLUGIN_DRAG_THRESHOLD = 20;
  let pluginDragPointer: {
    pluginId: string;
    pointerId: number;
    x: number;
    y: number;
    list: HTMLElement;
  } | null = null;
  let pluginDragPosition = { x: 0, y: 0 };
  let pluginDragScrollFrame = 0;
  let suppressPluginClick = false;
  let dragPreview: HTMLElement | null = null;
  const clearDragPreview = () => {
    dragPreview?.remove();
    dragPreview = null;
  };

  const preventPluginTextSelection = (event: Event) => event.preventDefault();

  const startPluginDrag = (pluginId: string) => {
    closePluginContextMenu();
    draggedPluginId.value = pluginId;
    suppressPluginClick = true;
    window.getSelection()?.removeAllRanges();

    clearDragPreview();
    dragPreview = document.createElement("span");
    dragPreview.textContent = pluginId;
    Object.assign(dragPreview.style, {
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
    document.body.appendChild(dragPreview);
  };

  const updatePluginDragTarget = () => {
    const group = document
      .elementFromPoint(pluginDragPosition.x, pluginDragPosition.y)
      ?.closest<HTMLElement>(".plugin-config-group");
    dragOverGroupId.value =
      group && pluginDragPointer?.list.contains(group) ? group.dataset.pluginGroupId || "" : "";
  };

  const scrollPluginDragList = () => {
    pluginDragScrollFrame = 0;
    if (!draggedPluginId.value || !pluginDragPointer) return;
    const list = pluginDragPointer.list;
    if (!list.contains(document.elementFromPoint(pluginDragPosition.x, pluginDragPosition.y)))
      return;
    const bounds = list.getBoundingClientRect();
    const delta =
      pluginDragPosition.y < bounds.top + 28
        ? -8
        : pluginDragPosition.y > bounds.bottom - 28
        ? 8
        : 0;
    const previousScroll = list.scrollTop;
    list.scrollTop += delta;
    if (list.scrollTop !== previousScroll) {
      updatePluginDragTarget();
      pluginDragScrollFrame = requestAnimationFrame(scrollPluginDragList);
    }
  };

  const movePluginDrag = (event: PointerEvent) => {
    const pointer = pluginDragPointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    if (!(event.buttons & 1)) {
      endPluginDrag();
      return;
    }
    if (!draggedPluginId.value) {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < PLUGIN_DRAG_THRESHOLD)
        return;
      startPluginDrag(pointer.pluginId);
    }
    event.preventDefault();
    pluginDragPosition = { x: event.clientX, y: event.clientY };
    if (dragPreview)
      dragPreview.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 14}px)`;
    updatePluginDragTarget();
    if (!pluginDragScrollFrame) pluginDragScrollFrame = requestAnimationFrame(scrollPluginDragList);
  };

  const endPluginDrag = () => {
    if (pluginDragPointer) {
      document.removeEventListener("selectstart", preventPluginTextSelection, true);
      window.removeEventListener("pointermove", movePluginDrag);
      window.removeEventListener("pointerup", finishPluginDrag);
      window.removeEventListener("pointercancel", cancelPluginDrag);
      window.removeEventListener("blur", endPluginDrag);
    }
    pluginDragPointer = null;
    draggedPluginId.value = "";
    dragOverGroupId.value = "";
    clearDragPreview();
    if (pluginDragScrollFrame) cancelAnimationFrame(pluginDragScrollFrame);
    pluginDragScrollFrame = 0;
  };

  const finishPluginDrag = (event: PointerEvent) => {
    if (!pluginDragPointer || event.pointerId !== pluginDragPointer.pointerId) return;
    pluginDragPosition = { x: event.clientX, y: event.clientY };
    if (draggedPluginId.value) updatePluginDragTarget();
    const pluginId = draggedPluginId.value;
    const groupId = dragOverGroupId.value;
    endPluginDrag();
    if (pluginId && groupId) movePluginToGroup(pluginId, groupId);
  };

  const cancelPluginDrag = (event: PointerEvent) => {
    if (event.pointerId === pluginDragPointer?.pointerId) endPluginDrag();
  };

  const preparePluginDrag = (pluginId: string, event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.pointerType === "touch" ||
      pluginDragPointer
    )
      return;
    const list = (event.currentTarget as HTMLElement).closest<HTMLElement>(".plugin-config-list");
    if (!list) return;
    suppressPluginClick = false;
    pluginDragPointer = {
      pluginId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      list
    };
    document.addEventListener("selectstart", preventPluginTextSelection, true);
    window.addEventListener("pointermove", movePluginDrag);
    window.addEventListener("pointerup", finishPluginDrag);
    window.addEventListener("pointercancel", cancelPluginDrag);
    window.addEventListener("blur", endPluginDrag);
  };

  const selectPluginFromList = (pluginId: string, event: MouseEvent | KeyboardEvent) => {
    if (suppressPluginClick && event.detail) {
      event.preventDefault();
      event.stopPropagation();
      suppressPluginClick = false;
      return;
    }
    selectPlugin(pluginId);
  };

  onUnmounted(endPluginDrag);

  return {
    draggedPluginId,
    dragOverGroupId,
    endPluginDrag,
    preparePluginDrag,
    selectPluginFromList
  };
}
