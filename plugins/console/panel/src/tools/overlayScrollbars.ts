import { OverlayScrollbars, type OverflowBehavior } from "overlayscrollbars";

const INTERNAL_ELEMENTS = ".os-scrollbar, .os-size-observer, .os-trinsic-observer, .os-environment";
const NATIVE_CONTROLS = "input, textarea, select, option, iframe";
const VIEWPORT_ATTRIBUTES = ["data-overlayscrollbars", "data-overlayscrollbars-viewport"];
const TREE_STYLE_PROPERTIES = ["all", "display", "visibility", "contain", "container-type", "content-visibility"];
const OVERFLOW_STYLE_PROPERTIES = ["overflow", "overflow-x", "overflow-y"];

type Overflow = { x: OverflowBehavior; y: OverflowBehavior };
type ScrollbarEntry = { instance: OverlayScrollbars; overflow: Overflow };

export function installOverlayScrollbars() {
  const instances = new Map<HTMLElement, ScrollbarEntry>();
  const pendingRoots = new Set<HTMLElement>([document.body]);
  const pendingElements = new Set<HTMLElement>();
  const previousStyle = document.createElement("div").style;
  let frame = 0;
  let resizeTimer: number | undefined;
  let disposed = false;

  const isInternal = (element: HTMLElement) => !!element.closest(INTERNAL_ELEMENTS);
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
      if (!(mutation.target instanceof HTMLElement) || isInternal(mutation.target)) continue;
      const element = mutation.target;
      if (mutation.type === "attributes") {
        if (mutation.attributeName !== "style") {
          queueTree(element);
          continue;
        }

        // Size and library-owned styles are handled by the library's observers.
        previousStyle.cssText = mutation.oldValue || "";
        const changed = (name: string) =>
          previousStyle.getPropertyValue(name) !== element.style.getPropertyValue(name) ||
          previousStyle.getPropertyPriority(name) !== element.style.getPropertyPriority(name);
        let affectsTree = TREE_STYLE_PROPERTIES.some(changed);
        for (const style of [previousStyle, element.style]) {
          for (let index = 0; index < style.length && !affectsTree; index++) {
            const name = style.item(index);
            affectsTree = name.startsWith("--") && !name.startsWith("--os-") && changed(name);
          }
        }
        if (affectsTree) queueTree(element);
        else if (OVERFLOW_STYLE_PROPERTIES.some(changed)) queueAncestors(element);
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
        if (changed) queueAncestors(element);
      }
    }
  };

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
        instance: OverlayScrollbars(
          { target: element, elements: { viewport: element } },
          {
            overflow,
            update: {
              debounce: {
                mutation: [0, 33],
                resize: [80, 300],
                event: [33, 99],
                env: [222, 666, true]
              }
            },
            scrollbars: {
              theme: "os-theme-app",
              clickScroll: "instant",
              autoHide: "scroll",
              autoHideDelay: 800
            }
          }
        )
      });
    }
  };

  const refresh = () => {
    frame = 0;
    if (disposed) return;
    collectMutations(observer.takeRecords());
    const candidates = new Set(pendingElements);
    for (const root of pendingRoots) {
      if (!root.isConnected) continue;
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
      (element) => element.isConnected && !element.matches(NATIVE_CONTROLS) && !isInternal(element)
    );

    // Ignore our own DOM writes and batch marker changes around all style reads.
    observer.disconnect();
    try {
      const markers = elements.filter((element) => instances.has(element)).map((element) => ({
        element,
        values: VIEWPORT_ATTRIBUTES.map((name) => element.getAttribute(name))
      }));
      const plans: Array<{ element: HTMLElement; overflow: Overflow }> = [];
      try {
        markers.forEach(({ element }) => {
          VIEWPORT_ATTRIBUTES.forEach((name) => element.removeAttribute(name));
        });
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
      } finally {
        markers.forEach(({ element, values }) => {
          VIEWPORT_ATTRIBUTES.forEach((name, index) => {
            if (values[index] !== null) element.setAttribute(name, values[index]!);
          });
        });
      }
      for (const [element, entry] of instances) {
        if (!element.isConnected) {
          entry.instance.destroy();
          instances.delete(element);
        }
      }
      plans.forEach(({ element, overflow }) => update(element, overflow));
    } finally {
      if (!disposed) {
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ["class", "style", "hidden", "open", "dir"]
        });
      }
    }
  };

  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(refresh);
  };
  const onResize = () => {
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
    if (pendingRoots.size || pendingElements.size) schedule();
  });

  queueAncestors(document.body);
  refresh();
  window.addEventListener("resize", onResize);

  return () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(frame);
    window.clearTimeout(resizeTimer);
    instances.forEach(({ instance }) => instance.destroy());
    instances.clear();
    pendingRoots.clear();
    pendingElements.clear();
  };
}
