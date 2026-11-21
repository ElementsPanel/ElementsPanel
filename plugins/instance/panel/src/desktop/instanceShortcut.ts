import {
  INSTANCE_SHORTCUT_DROP_EVENT,
  getInstanceShortcutId,
  parseDesktopInstanceShortcut,
  type DesktopInstanceShortcut
} from "@elements-panel/sdk";
import { usePointerDrag } from "@elementspanel/epanel-plugin-console/hooks/usePointerDrag";

interface InstanceShortcutSource {
  instanceUuid: string;
  nickname?: string;
  config?: { nickname?: string };
}

export function useInstanceShortcutDrag() {
  const drag = usePointerDrag<DesktopInstanceShortcut>({
    previewClass: "instance-shortcut-drag-preview",
    scrollContainer: ".ma-list, .dim-list",
    onDrop: (shortcut, event) => {
      window.dispatchEvent(
        new CustomEvent(INSTANCE_SHORTCUT_DROP_EVENT, {
          detail: { shortcut, clientX: event.clientX, clientY: event.clientY }
        })
      );
    }
  });

  const prepareInstanceShortcutDrag = (
    event: PointerEvent,
    instance: InstanceShortcutSource,
    daemonId: string
  ) => {
    const shortcut = parseDesktopInstanceShortcut({
      instanceId: instance.instanceUuid,
      daemonId,
      name: instance.config?.nickname || instance.nickname || instance.instanceUuid
    });
    if (shortcut)
      drag.prepareDrag(event, {
        id: getInstanceShortcutId(shortcut),
        label: shortcut.name,
        value: shortcut
      });
  };

  return {
    prepareInstanceShortcutDrag,
    suppressInstanceShortcutClick: drag.suppressDragClick,
    isInstanceShortcutDragging: (instanceId: string, daemonId: string) =>
      drag.draggingId.value === getInstanceShortcutId({ instanceId, daemonId }),
    cancelInstanceShortcutDrag: drag.cancelDrag
  };
}
