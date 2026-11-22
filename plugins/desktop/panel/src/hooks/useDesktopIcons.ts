import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  watch,
  type Component,
  type Ref
} from "vue";
import type { PanelFrontendDesktopView } from "@elements-panel/sdk";
import {
  arrangeDesktopIcons,
  createIconGrid,
  findIconCell,
  findIconGroupCell,
  getIconCell,
  getIconPosition
} from "../iconLayout";
import { useDesktopShortcuts } from "./useDesktopShortcuts";
import type { DesktopApp } from "../types";

interface Options {
  availableDesktopApps: Ref<DesktopApp[]>;
  findView: (id: string) => PanelFrontendDesktopView | undefined;
  saveDesktopLayout: () => void;
  closeContextMenu: () => void;
  onDesktopKeyDown: (event: KeyboardEvent) => void;
}

export function useDesktopIcons(options: Options) {
  const { availableDesktopApps, findView, saveDesktopLayout, closeContextMenu, onDesktopKeyDown } =
    options;

  const selectedIconIds = reactive(new Set<string>());
  let suppressDesktopClick = false;

  const selectIcon = (id: string, event?: MouseEvent) => {
    if (suppressDesktopClick && event?.detail) {
      suppressDesktopClick = false;
      return;
    }
    if (event?.ctrlKey || event?.metaKey) {
      if (!selectedIconIds.delete(id)) selectedIconIds.add(id);
    } else {
      selectedIconIds.clear();
      selectedIconIds.add(id);
    }
  };

  const iconPositions = reactive<Map<string, { x: number; y: number }>>(new Map());
  const desktopIconsRef = ref<HTMLElement | null>(null);

  const desktopSize = ref({
    width: window.innerWidth || 1024,
    height: Math.max(1, (window.innerHeight || 768) - 48)
  });
  const iconGrid = computed<ReturnType<typeof createIconGrid>>(() =>
    createIconGrid(desktopSize.value.width, desktopSize.value.height, desktopApps.value.length)
  );

  const normalizeIconPositions = () => {
    let changed = false;
    const ids = desktopApps.value.map((app) => app.id);
    const arranged = arrangeDesktopIcons(ids, iconPositions, iconGrid.value);
    for (const [id, point] of arranged) {
      const previous = iconPositions.get(id);
      if (previous?.x === point.x && previous?.y === point.y) continue;
      iconPositions.set(id, point);
      changed = true;
    }
    for (const id of selectedIconIds) {
      if (!ids.includes(id)) selectedIconIds.delete(id);
    }
    return changed;
  };

  function getDefaultPosition(index: number): { x: number; y: number } {
    const grid = iconGrid.value;
    return getIconPosition(
      { col: index % grid.columns, row: Math.floor(index / grid.columns) },
      grid
    );
  }

  function getDefaultPositionForApp(id: string): { x: number; y: number } {
    const ids = desktopApps.value.map((app) => app.id);
    const index = ids.indexOf(id);
    return getDefaultPosition(index >= 0 ? index : 0);
  }

  function getIconGridX(id: string): number {
    const pos = iconPositions.get(id);
    if (pos && Number.isFinite(pos.x))
      return Math.max(
        iconGrid.value.startX,
        Math.min(iconGrid.value.width - iconGrid.value.startX - iconGrid.value.iconWidth, pos.x)
      );
    return getDefaultPositionForApp(id).x;
  }

  function getIconGridY(id: string): number {
    const pos = iconPositions.get(id);
    if (pos && Number.isFinite(pos.y))
      return Math.max(
        iconGrid.value.startY,
        Math.min(iconGrid.value.height - iconGrid.value.startY - iconGrid.value.iconHeight, pos.y)
      );
    return getDefaultPositionForApp(id).y;
  }

  function getOccupiedGrid(excludeIds: ReadonlySet<string>): Set<string> {
    const occupied = new Set<string>();
    for (const app of desktopApps.value) {
      if (excludeIds.has(app.id)) continue;
      const gx = getIconGridX(app.id);
      const gy = getIconGridY(app.id);
      const { col, row } = getIconCell({ x: gx, y: gy }, iconGrid.value);
      occupied.add(`${col},${row}`);
    }
    return occupied;
  }

  function findEmptyCell(
    col: number,
    row: number,
    excludeId: string
  ): { col: number; row: number } {
    return findIconCell({ col, row }, getOccupiedGrid(new Set([excludeId])), iconGrid.value);
  }

  const DRAG_THRESHOLD = 5;

  const isDragging = ref(false);
  const dragOffsetX = ref(0);
  const dragOffsetY = ref(0);
  interface DraggedIcon {
    id: string;
    label: string;
    icon: Component | string;
    offsetX: number;
    offsetY: number;
    col: number;
    row: number;
  }
  const draggedIcons = shallowRef<DraggedIcon[]>([]);
  let dragSurfaceOrigin: { left: number; top: number } | undefined;
  let dragBounds: { left: number; top: number; right: number; bottom: number } | undefined;
  let dragOccupied = new Set<string>();

  // Wait for the drag threshold after mousedown.
  const pendingDragId = ref<string | null>(null);
  const pendingStartX = ref(0);
  const pendingStartY = ref(0);

  const ghostX = ref(0);
  const ghostY = ref(0);

  const dropX = ref(0);
  const dropY = ref(0);
  const dropValid = ref(false);
  const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null);
  let selectionStart: { x: number; y: number } | null = null;
  let selectionPoint = { x: 0, y: 0 };
  let selectionBaseline = new Set<string>();
  let selectionFrame = 0;

  const preventDesktopTextSelection = (event: Event) => event.preventDefault();

  const getDesktopPoint = (clientX: number, clientY: number) => {
    const rect = dragSurfaceOrigin ?? desktopIconsRef.value?.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(iconGrid.value.width, clientX - (rect?.left || 0))),
      y: Math.max(0, Math.min(iconGrid.value.height, clientY - (rect?.top || 0)))
    };
  };

  const cancelIconInteraction = () => {
    pendingDragId.value = null;
    droppingIconId.value = null;
    isDragging.value = false;
    draggedIcons.value = [];
    dragSurfaceOrigin = undefined;
    dragBounds = undefined;
    dragOccupied.clear();
    selectionStart = null;
    selectionRect.value = null;
    if (selectionFrame) cancelAnimationFrame(selectionFrame);
    selectionFrame = 0;
    document.removeEventListener("selectstart", preventDesktopTextSelection, true);
  };

  const updateDragSelection = () => {
    selectionFrame = 0;
    if (!selectionStart) return;
    if (
      Math.hypot(selectionPoint.x - selectionStart.x, selectionPoint.y - selectionStart.y) <
      DRAG_THRESHOLD
    )
      return;
    suppressDesktopClick = true;
    const rect = {
      x: Math.min(selectionStart.x, selectionPoint.x),
      y: Math.min(selectionStart.y, selectionPoint.y),
      width: Math.abs(selectionPoint.x - selectionStart.x),
      height: Math.abs(selectionPoint.y - selectionStart.y)
    };
    selectionRect.value = rect;
    const selected = new Set(selectionBaseline);
    for (const app of desktopApps.value) {
      const x = getIconGridX(app.id);
      const y = getIconGridY(app.id);
      if (
        x < rect.x + rect.width &&
        x + iconGrid.value.iconWidth > rect.x &&
        y < rect.y + rect.height &&
        y + iconGrid.value.iconHeight > rect.y
      )
        selected.add(app.id);
    }
    selectedIconIds.clear();
    for (const id of selected) selectedIconIds.add(id);
  };

  const handleDesktopMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !desktopIconsRef.value?.contains(event.target as Node)) return;
    if ((event.target as Element).closest(".desktop-icon")) return;
    event.preventDefault();
    event.stopPropagation();
    cancelIconInteraction();
    closeContextMenu();
    desktopIconsRef.value?.focus?.({ preventScroll: true });
    suppressDesktopClick = false;
    selectionBaseline =
      event.ctrlKey || event.metaKey || event.shiftKey ? new Set(selectedIconIds) : new Set();
    selectedIconIds.clear();
    for (const id of selectionBaseline) selectedIconIds.add(id);
    selectionStart = getDesktopPoint(event.clientX, event.clientY);
    selectionPoint = selectionStart;
    selectionRect.value = { ...selectionStart, width: 0, height: 0 };
    window.getSelection()?.removeAllRanges();
    document.addEventListener("selectstart", preventDesktopTextSelection, true);
  };

  function commitDragStart(id: string, clientX: number, clientY: number) {
    if (!selectedIconIds.has(id)) {
      selectedIconIds.clear();
      selectedIconIds.add(id);
    }
    originX.value = getIconGridX(id);
    originY.value = getIconGridY(id);
    const grid = iconGrid.value;
    const originCell = getIconCell({ x: originX.value, y: originY.value }, grid);
    draggedIcons.value = desktopApps.value
      .filter((app) => selectedIconIds.has(app.id))
      .map((app) => {
        const x = getIconGridX(app.id);
        const y = getIconGridY(app.id);
        const cell = getIconCell({ x, y }, grid);
        return {
          id: app.id,
          label: app.label,
          icon: app.icon,
          offsetX: x - originX.value,
          offsetY: y - originY.value,
          col: cell.col - originCell.col,
          row: cell.row - originCell.row
        };
      });
    if (!draggedIcons.value.length) return cancelIconInteraction();
    const rect = desktopIconsRef.value?.getBoundingClientRect();
    dragSurfaceOrigin = { left: rect?.left || 0, top: rect?.top || 0 };
    dragOccupied = getOccupiedGrid(selectedIconIds);
    dragBounds = {
      left: grid.startX - Math.min(...draggedIcons.value.map((icon) => icon.offsetX)),
      top: grid.startY - Math.min(...draggedIcons.value.map((icon) => icon.offsetY)),
      right:
        grid.width -
        grid.startX -
        grid.iconWidth -
        Math.max(...draggedIcons.value.map((icon) => icon.offsetX)),
      bottom:
        grid.height -
        grid.startY -
        grid.iconHeight -
        Math.max(...draggedIcons.value.map((icon) => icon.offsetY))
    };
    const point = getDesktopPoint(clientX, clientY);
    dragOffsetX.value = point.x - originX.value;
    dragOffsetY.value = point.y - originY.value;
    ghostX.value = originX.value;
    ghostY.value = originY.value;
    dropX.value = originX.value;
    dropY.value = originY.value;
    droppingIconId.value = id;
    isDragging.value = true;
    dropValid.value = true;
    pendingDragId.value = null;
    suppressDesktopClick = true;
    window.getSelection()?.removeAllRanges();
  }

  const droppingIconId = ref<string | null>(null);
  const originX = ref(0);
  const originY = ref(0);

  const handleIconDragStart = (id: string, clientX: number, clientY: number) => {
    cancelIconInteraction();
    closeContextMenu();
    desktopIconsRef.value?.focus?.({ preventScroll: true });
    normalizeIconPositions();
    suppressDesktopClick = false;
    pendingDragId.value = id;
    pendingStartX.value = clientX;
    pendingStartY.value = clientY;
    document.addEventListener("selectstart", preventDesktopTextSelection, true);
  };

  const updateIconDrag = (event: MouseEvent) => {
    if (!droppingIconId.value || !dragBounds) return;
    const point = getDesktopPoint(event.clientX, event.clientY);
    const grid = iconGrid.value;
    ghostX.value = Math.max(
      dragBounds.left,
      Math.min(dragBounds.right, point.x - dragOffsetX.value)
    );
    ghostY.value = Math.max(
      dragBounds.top,
      Math.min(dragBounds.bottom, point.y - dragOffsetY.value)
    );
    const target = findIconGroupCell(
      getIconCell({ x: ghostX.value, y: ghostY.value }, grid),
      draggedIcons.value,
      dragOccupied,
      grid
    );
    dropValid.value = !!target;
    if (target) {
      const position = getIconPosition(target, grid);
      dropX.value = position.x;
      dropY.value = position.y;
    }
  };

  const handleDesktopMouseMove = (e: MouseEvent) => {
    if (!selectionStart && !pendingDragId.value && !isDragging.value) return;
    if (!(e.buttons & 1)) return cancelIconInteraction();
    e.preventDefault();
    if (selectionStart) {
      selectionPoint = getDesktopPoint(e.clientX, e.clientY);
      if (selectionFrame) cancelAnimationFrame(selectionFrame);
      selectionFrame = requestAnimationFrame(updateDragSelection);
      return;
    }
    if (pendingDragId.value && !isDragging.value) {
      const dx = e.clientX - pendingStartX.value;
      const dy = e.clientY - pendingStartY.value;
      if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        commitDragStart(pendingDragId.value, pendingStartX.value, pendingStartY.value);
      }
    }

    if (!isDragging.value || !droppingIconId.value) return;
    updateIconDrag(e);
  };

  const handleDesktopMouseUp = (event: MouseEvent) => {
    if (selectionStart) {
      if (selectionFrame) cancelAnimationFrame(selectionFrame);
      selectionFrame = 0;
      selectionPoint = getDesktopPoint(event.clientX, event.clientY);
      updateDragSelection();
      cancelIconInteraction();
      return;
    }
    if (pendingDragId.value && !isDragging.value) {
      cancelIconInteraction();
      return;
    }

    if (!isDragging.value || !droppingIconId.value) return;
    updateIconDrag(event);
    const { col, row } = getIconCell({ x: dropX.value, y: dropY.value }, iconGrid.value);
    if (dropValid.value) {
      for (const icon of draggedIcons.value) {
        iconPositions.set(
          icon.id,
          getIconPosition({ col: col + icon.col, row: row + icon.row }, iconGrid.value)
        );
      }
    }
    cancelIconInteraction();
    normalizeIconPositions();
    saveDesktopLayout();
  };

  const shortcuts = useDesktopShortcuts({
    availableDesktopApps,
    findView,
    iconPositions,
    selectedIconIds,
    desktopIconsRef,
    iconGrid,
    normalizeIconPositions,
    findEmptyCell,
    saveDesktopLayout
  });
  const { desktopApps } = shortcuts;

  let desktopResizeObserver: ResizeObserver | undefined;
  const updateDesktopSize = () => {
    const surface = desktopIconsRef.value;
    const rect = surface?.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1024;
    const viewportHeight = Math.max(1, (window.innerHeight || 768) - 48);
    const width = Math.min(surface?.clientWidth || rect?.width || viewportWidth, viewportWidth);
    const height = Math.min(
      surface?.clientHeight || rect?.height || viewportHeight,
      viewportHeight
    );
    if (
      width > 0 &&
      height > 0 &&
      (width !== desktopSize.value.width || height !== desktopSize.value.height)
    ) {
      desktopSize.value = { width, height };
    }
  };

  watch(
    desktopIconsRef,
    (surface) => {
      cancelIconInteraction();
      desktopResizeObserver?.disconnect();
      if (surface && typeof ResizeObserver !== "undefined") {
        desktopResizeObserver = new ResizeObserver(updateDesktopSize);
        desktopResizeObserver.observe(surface);
      }
      updateDesktopSize();
    },
    { flush: "post" }
  );

  watch(
    [iconGrid, desktopApps],
    ([grid, apps], [previousGrid]) => {
      if (
        grid !== previousGrid ||
        (droppingIconId.value && !apps.some((app) => app.id === droppingIconId.value))
      )
        cancelIconInteraction();
      if (normalizeIconPositions()) saveDesktopLayout();
    },
    { flush: "post" }
  );

  onMounted(() => {
    document.body.classList.add("desktop-mode-active");
    document.addEventListener("keydown", onDesktopKeyDown);
    document.addEventListener("mousemove", handleDesktopMouseMove);
    document.addEventListener("mouseup", handleDesktopMouseUp);
    window.addEventListener("resize", updateDesktopSize);
    window.addEventListener("blur", cancelIconInteraction);
    updateDesktopSize();
  });
  onUnmounted(() => {
    document.removeEventListener("keydown", onDesktopKeyDown);
    document.body.classList.remove("desktop-mode-active");
    document.removeEventListener("mousemove", handleDesktopMouseMove);
    document.removeEventListener("mouseup", handleDesktopMouseUp);
    window.removeEventListener("resize", updateDesktopSize);
    window.removeEventListener("blur", cancelIconInteraction);
    desktopResizeObserver?.disconnect();
    cancelIconInteraction();
  });

  const onDesktopClick = (event: MouseEvent) => {
    if (suppressDesktopClick && event.detail) {
      suppressDesktopClick = false;
      return;
    }
    if (
      desktopIconsRef.value?.contains(event.target as Node) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    )
      selectedIconIds.clear();
    closeContextMenu();
  };

  return {
    ...shortcuts,
    selectedIconIds,
    selectIcon,
    iconPositions,
    desktopIconsRef,
    iconGrid,
    normalizeIconPositions,
    getIconGridX,
    getIconGridY,
    isDragging,
    draggedIcons,
    ghostX,
    ghostY,
    dropX,
    dropY,
    dropValid,
    selectionRect,
    cancelIconInteraction,
    handleDesktopMouseDown,
    handleIconDragStart,
    onDesktopClick
  };
}
