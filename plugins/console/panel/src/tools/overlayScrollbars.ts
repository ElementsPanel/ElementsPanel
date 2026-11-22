import {
  ClickScrollPlugin,
  OverlayScrollbars,
  type OverflowBehavior,
  type State
} from "overlayscrollbars";

const INTERNAL_ELEMENTS = ".os-scrollbar, .os-size-observer, .os-trinsic-observer, .os-environment";
const NATIVE_CONTROLS =
  "input, textarea, select, option, iframe, .xterm, .cm-editor, .monaco-editor, .v-menu, [data-native-scrollbars]";
const TREE_STYLE_PROPERTIES = [
  "all",
  "display",
  "visibility",
  "contain",
  "container-type",
  "content-visibility"
];
const OVERFLOW_STYLE_PROPERTIES = ["overflow", "overflow-x", "overflow-y"];
const WINDOW_VISUAL_STYLES = new Set([
  "left",
  "top",
  "translate",
  "transform",
  "opacity",
  "z-index",
  "box-shadow",
  "border-radius",
  "will-change",
  "transition"
]);
const VISUAL_STYLES = new Set([
  "opacity",
  "z-index",
  "box-shadow",
  "border-radius",
  "will-change",
  "transition",
  "color",
  "background",
  "background-color",
  "background-image",
  "cursor",
  "pointer-events"
]);
const WINDOW_VISUAL_CLASS = /^desktop-window(?:--|-enter-|-leave-|-move$)/;

const isCachedWindowContent = (element: HTMLElement) => {
  const owner = element.closest<HTMLElement>("[data-desktop-window-content]")?.dataset
    .desktopWindowContent;
  return owner !== undefined && !!document.getElementById(`${owner}-title`);
};

type Overflow = { x: OverflowBehavior; y: OverflowBehavior };
type ScrollbarEntry = { instance: OverlayScrollbars; overflow: Overflow; sleeping: boolean };

const createScrollPositionGuard = () => {
  let previous: State["scrollCoordinates"] | undefined;
  return (instance: OverlayScrollbars) => {
    const { scrollCoordinates, sleeping } = instance.state();
    const { scrollOffsetElement } = instance.elements();
    if (
      sleeping ||
      !scrollOffsetElement.isConnected ||
      scrollOffsetElement.closest(".desktop-window--suspended") ||
      !scrollOffsetElement.clientWidth ||
      !scrollOffsetElement.clientHeight
    )
      return;

    const old = previous;
    previous = scrollCoordinates;
    if (!old) return;
    // Only shrinking bounds need correction; preserve native overscroll and fractional offsets.
    for (const [axis, property] of [
      ["x", "scrollLeft"],
      ["y", "scrollTop"]
    ] as const) {
      const min = Math.min(scrollCoordinates.start[axis], scrollCoordinates.end[axis]);
      const max = Math.max(scrollCoordinates.start[axis], scrollCoordinates.end[axis]);
      if (
        min <= Math.min(old.start[axis], old.end[axis]) &&
        max >= Math.max(old.start[axis], old.end[axis])
      )
        continue;
      const value = scrollOffsetElement[property];
      const clamped = Math.min(Math.max(value, min), max);
      if (Math.abs(clamped - value) > 1) scrollOffsetElement[property] = clamped;
    }
  };
};

export function installOverlayScrollbars() {
  if (
    typeof CSS === "undefined" ||
    !CSS.supports("overflow", "revert-layer") ||
    typeof MutationObserver === "undefined" ||
    typeof requestAnimationFrame === "undefined" ||
    !OverlayScrollbars.env().scrollbarsHiding
  )
    return () => {};

  OverlayScrollbars.plugin(ClickScrollPlugin);
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
  const instances = new Map<HTMLElement, ScrollbarEntry>();
  const pendingRoots = new Set<HTMLElement>([document.body]);
  const pendingElements = new Set<HTMLElement>();
  const pendingUpdates = new Set<HTMLElement>();
  const previousStyle = document.createElement("div").style;
  let frame = 0;
  let resizeTimer: number | undefined;
  let disposed = false;
  let pendingLifecycle = false;

  const isInternal = (element: HTMLElement) => !!element.closest(INTERNAL_ELEMENTS);
  const queueContentUpdate = (element: HTMLElement) => {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      if (instances.has(current)) pendingUpdates.add(current);
    }
  };
  const queueAncestors = (element: HTMLElement) => {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      pendingElements.add(current);
    }
  };

  const queueTree = (element: HTMLElement) => {
    pendingRoots.add(element);
    queueAncestors(element);
  };

  const collectMutations = (mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      const element =
        mutation.target instanceof HTMLElement
          ? mutation.target
          : mutation.type === "characterData"
          ? mutation.target.parentElement
          : null;
      if (!(element instanceof HTMLElement) || isInternal(element)) continue;
      if (element.closest(NATIVE_CONTROLS)) {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "class" ||
            mutation.attributeName === "data-native-scrollbars")
        ) {
          pendingLifecycle = true;
        }
        queueContentUpdate(element);
        continue;
      }
      if (mutation.type === "characterData") {
        queueContentUpdate(element);
        continue;
      }
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "class" && element.classList.contains("desktop-window")) {
          const layoutClasses = (value: string) =>
            value
              .split(/\s+/)
              .filter((name) => name && !WINDOW_VISUAL_CLASS.test(name))
              .sort()
              .join(" ");
          if (layoutClasses(mutation.oldValue || "") === layoutClasses(element.className)) {
            if (
              (mutation.oldValue || "").split(/\s+/).includes("desktop-window--suspended") !==
              element.classList.contains("desktop-window--suspended")
            )
              pendingLifecycle = true;
            continue;
          }
        }
        if (mutation.attributeName !== "style") {
          queueContentUpdate(element);
          queueTree(element);
          continue;
        }

        // Size changes refresh existing instances without rescanning the tree.
        previousStyle.cssText = mutation.oldValue || "";
        const changed = (name: string) =>
          previousStyle.getPropertyValue(name) !== element.style.getPropertyValue(name) ||
          previousStyle.getPropertyPriority(name) !== element.style.getPropertyPriority(name);
        const names = new Set([...Array.from(previousStyle), ...Array.from(element.style)]);
        const changedNames = [...names].filter(changed);
        if (changedNames.every((name) => VISUAL_STYLES.has(name) || name.startsWith("--os-")))
          continue;
        if (element.classList.contains("desktop-window")) {
          if (
            changedNames.every((name) => WINDOW_VISUAL_STYLES.has(name) || name.startsWith("--os-"))
          )
            continue;
        }
        let affectsTree = TREE_STYLE_PROPERTIES.some(changed);
        for (const style of [previousStyle, element.style]) {
          for (let index = 0; index < style.length && !affectsTree; index++) {
            const name = style.item(index);
            affectsTree = name.startsWith("--") && !name.startsWith("--os-") && changed(name);
          }
        }
        if (affectsTree) queueTree(element);
        else if (OVERFLOW_STYLE_PROPERTIES.some(changed)) queueAncestors(element);
        for (const style of [previousStyle, element.style]) {
          for (let index = 0; index < style.length; index++) {
            const name = style.item(index);
            if (!name.startsWith("--os-") && changed(name)) {
              queueContentUpdate(element);
              break;
            }
          }
        }
      } else {
        let changed = false;
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (isInternal(node)) continue;
            queueTree(node);
            changed = true;
          } else if (node.nodeType !== Node.COMMENT_NODE) {
            changed = true;
          }
        }
        for (const node of mutation.removedNodes) {
          if (!(node instanceof HTMLElement) || !isInternal(node) || instances.has(element)) {
            changed = true;
          }
        }
        if (changed) {
          queueContentUpdate(element);
          queueAncestors(element);
        }
      }
    }
  };

  const scrollbarOptions = () => ({
    clickScroll: reducedMotion.matches ? ("instant" as const) : true,
    autoHide: finePointer.matches ? ("leave" as const) : ("scroll" as const),
    autoHideSuspend: false
  });

  const update = (element: HTMLElement, overflow: Overflow) => {
    const entry = instances.get(element);
    if (overflow.x === "hidden" && overflow.y === "hidden") {
      entry?.instance.destroy();
      instances.delete(element);
    } else if (entry) {
      if (entry.overflow.x !== overflow.x || entry.overflow.y !== overflow.y) {
        entry.instance.options({ overflow });
        entry.overflow = overflow;
      }
      // Vue text and HTML updates can replace the generated scrollbar nodes.
      const { scrollbarHorizontal, scrollbarVertical } = entry.instance.elements();
      for (const { scrollbar } of [scrollbarHorizontal, scrollbarVertical]) {
        if (scrollbar.parentElement !== element) element.append(scrollbar);
      }
    } else {
      instances.set(element, {
        overflow,
        sleeping: false,
        instance: OverlayScrollbars(
          { target: element, elements: { viewport: element } },
          {
            overflow,
            update: {
              debounce: {
                mutation: [0, 33],
                // Coalesce animated layout resizes instead of measuring every frame.
                resize: [80, 300],
                event: [33, 99],
                env: [222, 666, true]
              }
            },
            scrollbars: {
              theme: "os-theme-app",
              ...scrollbarOptions(),
              autoHideDelay: 800
            }
          },
          { updated: createScrollPositionGuard() }
        )
      });
    }
  };

  const refresh = () => {
    frame = 0;
    if (disposed) return;
    collectMutations(observer.takeRecords());
    pendingLifecycle = false;
    if (forcedColors.matches) {
      observer.disconnect();
      instances.forEach(({ instance }) => instance.destroy());
      instances.clear();
      pendingRoots.clear();
      pendingElements.clear();
      pendingUpdates.clear();
      return;
    }
    const updates = new Set(pendingUpdates);
    pendingUpdates.clear();
    const candidates = new Set(pendingElements);
    for (const root of pendingRoots) {
      if (!root.isConnected || root.closest(NATIVE_CONTROLS) || isInternal(root)) continue;
      let covered = false;
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (pendingRoots.has(parent)) {
          covered = true;
          break;
        }
      }
      if (covered) continue;
      candidates.add(root);
      root.querySelectorAll<HTMLElement>("*").forEach((element) => {
        if (element instanceof HTMLElement) candidates.add(element);
      });
    }
    pendingRoots.clear();
    pendingElements.clear();
    const elements = [...candidates].filter(
      (element) =>
        element.isConnected &&
        !element.closest(NATIVE_CONTROLS) &&
        !isInternal(element) &&
        !element.closest(".desktop-window--suspended")
    );

    // Keep viewport markers intact and batch style reads before DOM writes.
    observer.disconnect();
    try {
      const plans: Array<{ element: HTMLElement; overflow: Overflow }> = [];
      for (const element of elements) {
        const style = getComputedStyle(element);
        plans.push({
          element,
          overflow: {
            x: /^(auto|scroll|overlay)$/.test(style.overflowX) ? "scroll" : "hidden",
            y: /^(auto|scroll|overlay)$/.test(style.overflowY) ? "scroll" : "hidden"
          }
        });
      }
      for (const [element, entry] of instances) {
        if (
          element.closest(NATIVE_CONTROLS) ||
          (!element.isConnected && !isCachedWindowContent(element))
        ) {
          entry.instance.destroy();
          instances.delete(element);
          continue;
        }
        const sleeping = !element.isConnected || !!element.closest(".desktop-window--suspended");
        if (entry.sleeping !== sleeping) {
          entry.sleeping = sleeping;
          entry.instance.sleep(sleeping);
        }
      }
      plans.forEach(({ element, overflow }) => {
        if (instances.has(element)) updates.add(element);
        update(element, overflow);
      });
      updates.forEach((element) => {
        const entry = instances.get(element);
        if (entry && !entry.sleeping) entry.instance.update();
      });
    } finally {
      if (!disposed) {
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ["class", "style", "hidden", "open", "dir", "data-native-scrollbars"]
        });
      }
    }
  };

  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(refresh);
  };
  const onResize = () => {
    if (forcedColors.matches) return;
    // Existing instances resize themselves; rediscover media-query changes once settled.
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = undefined;
      queueTree(document.body);
      schedule();
    }, 120);
  };
  const observer = new MutationObserver((mutations) => {
    collectMutations(mutations);
    if (pendingLifecycle || pendingRoots.size || pendingElements.size || pendingUpdates.size)
      schedule();
  });
  const onPreferencesChange = () => {
    instances.forEach(({ instance }) => instance.options({ scrollbars: scrollbarOptions() }));
  };
  const onForcedColorsChange = () => {
    queueTree(document.body);
    schedule();
  };
  const listen = (query: MediaQueryList, listener: () => void) => {
    if (query.addEventListener) {
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    }
    query.addListener(listener);
    return () => query.removeListener(listener);
  };
  const removeListeners = [
    listen(forcedColors, onForcedColorsChange),
    listen(reducedMotion, onPreferencesChange),
    listen(finePointer, onPreferencesChange)
  ];

  queueAncestors(document.body);
  refresh();
  window.addEventListener("resize", onResize);

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    removeListeners.forEach((remove) => remove());
    cancelAnimationFrame(frame);
    window.clearTimeout(resizeTimer);
    instances.forEach(({ instance }) => instance.destroy());
    instances.clear();
    pendingRoots.clear();
    pendingElements.clear();
    pendingUpdates.clear();
  };
}
