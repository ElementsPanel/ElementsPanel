import { onUnmounted, ref, watch, type Ref } from "vue";

export interface WindowRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface WindowRenderingOptions {
  bounds: () => WindowRectangle;
  visible: () => boolean;
  zIndex: () => number;
  maximized: () => boolean;
  interacting: () => boolean;
  animating: () => boolean;
  keepVisible?: () => boolean;
}

interface RenderEntry extends WindowRenderingOptions {
  suspended: Ref<boolean>;
}

const subtract = (rect: WindowRectangle, cover: WindowRectangle): WindowRectangle[] => {
  const left = Math.max(rect.left, cover.left);
  const top = Math.max(rect.top, cover.top);
  const right = Math.min(rect.right, cover.right);
  const bottom = Math.min(rect.bottom, cover.bottom);
  if (left >= right || top >= bottom) return [rect];
  const remaining: WindowRectangle[] = [];
  if (rect.top < top) remaining.push({ ...rect, bottom: top });
  if (bottom < rect.bottom) remaining.push({ ...rect, top: bottom });
  if (rect.left < left) remaining.push({ left: rect.left, top, right: left, bottom });
  if (right < rect.right) remaining.push({ left: right, top, right: rect.right, bottom });
  return remaining;
};

// Conservative coverage keeps partially visible windows live, including rounded corners.
export const isWindowCovered = (
  rect: WindowRectangle,
  maximized: boolean,
  covers: { rect: WindowRectangle; maximized: boolean }[]
) => {
  let remaining = [rect];
  for (const cover of covers) {
    const bounds = cover.rect;
    if (
      (cover.maximized || !maximized) &&
      bounds.left <= rect.left &&
      bounds.top <= rect.top &&
      bounds.right >= rect.right &&
      bounds.bottom >= rect.bottom
    )
      return true;
    const radius = cover.maximized
      ? 0
      : Math.min(10, (bounds.right - bounds.left) / 2, (bounds.bottom - bounds.top) / 2);
    const strips = radius
      ? [
          { ...bounds, left: bounds.left + radius, right: bounds.right - radius },
          { ...bounds, top: bounds.top + radius, bottom: bounds.bottom - radius }
        ]
      : [bounds];
    for (const strip of strips) remaining = remaining.flatMap((part) => subtract(part, strip));
    if (!remaining.length) return true;
  }
  return false;
};

const renderers = new WeakMap<Document, ReturnType<typeof createRenderer>>();

function createRenderer(document: Document) {
  const entries = new Set<RenderEntry>();
  const interacting = ref(false);
  let frame: number | undefined;
  let moving = false;

  const update = () => {
    frame = undefined;
    const viewport = document.defaultView!;
    const covers: { rect: WindowRectangle; maximized: boolean }[] = [];
    for (const entry of [...entries].reverse().sort((a, b) => b.zIndex() - a.zIndex())) {
      const rect = entry.bounds();
      const inMotion = entry.interacting() || entry.animating();
      const outside =
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= viewport.innerWidth ||
        rect.top >= viewport.innerHeight - 48;
      const visible = entry.visible() && (inMotion || !outside);
      const covered = !inMotion && isWindowCovered(rect, entry.maximized(), covers);
      entry.suspended.value = !visible || (covered && !entry.keepVisible?.());
      if (visible && !inMotion) covers.push({ rect, maximized: entry.maximized() });
    }
  };

  const schedule = () => {
    interacting.value = [...entries].some((entry) => entry.interacting());
    const nextMoving = interacting.value || [...entries].some((entry) => entry.animating());
    // Reveal only windows exposed by the moving frame, before the next paint.
    if (moving !== nextMoving) {
      moving = nextMoving;
      if (frame !== undefined) cancelAnimationFrame(frame);
      update();
      return;
    }
    if (frame === undefined) frame = requestAnimationFrame(update);
  };
  document.defaultView!.addEventListener("resize", schedule);

  const remove = (entry: RenderEntry) => {
    entries.delete(entry);
    if (entries.size) return schedule();
    if (frame !== undefined) cancelAnimationFrame(frame);
    document.defaultView!.removeEventListener("resize", schedule);
    renderers.delete(document);
  };

  return { entries, interacting, schedule, remove };
}

export function useWindowRendering(options: WindowRenderingOptions) {
  const renderer = renderers.get(document) ?? createRenderer(document);
  renderers.set(document, renderer);
  const entry: RenderEntry = { ...options, suspended: ref(!options.visible()) };
  renderer.entries.add(entry);
  const stop = watch(
    () => [
      options.bounds(),
      options.visible(),
      options.zIndex(),
      options.maximized(),
      options.interacting(),
      options.animating()
    ],
    renderer.schedule,
    { flush: "post" }
  );
  renderer.schedule();
  onUnmounted(() => {
    stop();
    renderer.remove(entry);
  });
  return { suspended: entry.suspended, interacting: renderer.interacting };
}
