import { onUnmounted, reactive, type Ref } from "vue";
import {
  testSocketConnection,
  SocketStatus
} from "@elementspanel/epanel-plugin-console/hooks/useSocketIo";
import type { NodeStatus } from "@elementspanel/epanel-plugin-console/types";

interface Options {
  nodes: Ref<NodeStatus[]>;
}

export function useNodeSockets(options: Options) {
  const { nodes } = options;

  const socketStatusMap = reactive<Record<string, SocketStatus>>({});
  const socketChecks = new Map<string, AbortController>();
  let disposed = false;

  const testNodeSocket = async (node: NodeStatus) => {
    if (disposed || socketChecks.has(node.uuid)) return;
    if (!node.available) {
      socketStatusMap[node.uuid] = SocketStatus.Error;
      return;
    }
    const controller = new AbortController();
    socketChecks.set(node.uuid, controller);
    try {
      const addr = `${node.ip}:${node.port}`;
      await testSocketConnection(addr, node.prefix, controller.signal);
      if (!disposed && !controller.signal.aborted)
        socketStatusMap[node.uuid] = SocketStatus.Connected;
    } catch {
      if (!disposed && !controller.signal.aborted) socketStatusMap[node.uuid] = SocketStatus.Error;
    } finally {
      if (socketChecks.get(node.uuid) === controller) socketChecks.delete(node.uuid);
    }
  };

  const testAllSockets = async () => {
    await Promise.all(nodes.value.map(testNodeSocket));
  };

  const invalidate = (previous: NodeStatus, current?: NodeStatus) => {
    if (
      !current ||
      current.ip !== previous.ip ||
      current.port !== previous.port ||
      current.prefix !== previous.prefix
    ) {
      socketChecks.get(previous.uuid)?.abort();
      socketChecks.delete(previous.uuid);
      delete socketStatusMap[previous.uuid];
    }
  };
  onUnmounted(() => {
    disposed = true;
    socketChecks.forEach((controller) => controller.abort());
    socketChecks.clear();
  });

  return {
    socketStatusMap,
    testNodeSocket,
    testAllSockets,
    invalidate,
    isDisposed: () => disposed
  };
}
