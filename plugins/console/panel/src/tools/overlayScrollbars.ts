import { OverlayScrollbars, type OverflowBehavior } from "overlayscrollbars";

const INTERNAL_ELEMENTS = ".os-scrollbar, .os-size-observer, .os-trinsic-observer, .os-environment";
const NATIVE_CONTROLS = "input, textarea, select, option, iframe";
const VIEWPORT_ATTRIBUTES = ["data-overlayscrollbars", "data-overlayscrollbars-viewport"];

export function installOverlayScrollbars() {
  const instances = new Map<HTMLElement, OverlayScrollbars>();
  const pending = new Set<HTMLElement>([document.body]);
  let frame = 0;

  const update = (element: HTMLElement) => {
    const instance = instances.get(element);
    if (!element.isConnected) {
      instance?.destroy();
      instances.delete(element);
      return;
    }
    if (element.matches(NATIVE_CONTROLS) || element.closest(INTERNAL_ELEMENTS)) return;

    // Read application overflow rules without the library's viewport defaults.
    const attributes = VIEWPORT_ATTRIBUTES.map((name) => element.getAttribute(name));
    if (instance) VIEWPORT_ATTRIBUTES.forEach((name) => element.removeAttribute(name));
    const style = getComputedStyle(element);
    const overflow = {
      x: /^(auto|scroll|overlay)$/.test(style.overflowX) ? "scroll" : "hidden",
      y: /^(auto|scroll|overlay)$/.test(style.overflowY) ? "scroll" : "hidden"
    } satisfies { x: OverflowBehavior; y: OverflowBehavior };
    if (instance) {
      VIEWPORT_ATTRIBUTES.forEach((name, index) => {
        if (attributes[index] !== null) element.setAttribute(name, attributes[index]!);
      });
    }

    if (overflow.x === "hidden" && overflow.y === "hidden") {
      instance?.destroy();
      instances.delete(element);
    } else if (instance) {
      instance.options({ overflow });
      // Vue text and HTML updates can replace the generated scrollbar nodes.
      const { scrollbarHorizontal, scrollbarVertical } = instance.elements();
      for (const { scrollbar } of [scrollbarHorizontal, scrollbarVertical]) {
        if (scrollbar.parentElement !== element) element.append(scrollbar);
      }
    } else {
      instances.set(
        element,
        OverlayScrollbars(
          { target: element, elements: { viewport: element } },
          { overflow, scrollbars: { theme: "os-theme-app", clickScroll: "instant" } }
        )
      );
    }
  };

  const refresh = () => {
    frame = 0;
    const candidates = new Set(instances.keys());
    for (const root of pending) {
      if (!root.isConnected) continue;
      for (let element: HTMLElement | null = root; element; element = element.parentElement) {
        candidates.add(element);
      }
      root.querySelectorAll<HTMLElement>("*").forEach((element) => {
        if (element instanceof HTMLElement) candidates.add(element);
      });
    }
    pending.clear();
    candidates.forEach(update);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(refresh);
  };
  const onResize = () => {
    pending.add(document.body);
    schedule();
  };
  const observer = new MutationObserver((mutations) => {
    let changed = false;
    for (const mutation of mutations) {
      if (!(mutation.target instanceof HTMLElement) || mutation.target.closest(INTERNAL_ELEMENTS)) {
        continue;
      }
      changed = true;
      if (mutation.type === "attributes") pending.add(mutation.target);
      else {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && !node.closest(INTERNAL_ELEMENTS)) pending.add(node);
        });
      }
    }
    if (changed) schedule();
  });

  refresh();
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "open", "dir"]
  });
  window.addEventListener("resize", onResize);

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(frame);
    instances.forEach((instance) => instance.destroy());
    instances.clear();
    pending.clear();
  };
}
