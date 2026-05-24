import { useCallback, useMemo, type MouseEvent } from "react";
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  applyNodeChanges,
} from "@xyflow/react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";
import type { Wire } from "../../../../types/patchboard-types";
import type { SocketRefNodeData } from "../nodes/SocketRefNode";
import type { AdapterNodeData } from "../nodes/AdapterNodeComponent";

/**
 * Converts the Patchboard Canvas data model to react-flow nodes/edges
 * and provides change handlers that update the Zustand store.
 */
const BRIDGE_STYLE: Record<
  string,
  { stroke: string; strokeDasharray?: string }
> = {
  lossless: { stroke: "#89b4fa" },
  risky: { stroke: "#f9e2af", strokeDasharray: "6 4" },
  structural: { stroke: "#fab387", strokeDasharray: "3 3" },
  incompatible: { stroke: "#f38ba8", strokeDasharray: "2 2" },
};

export function useCanvasState() {
  const activeCanvas = usePatchboardStore((s) => s.activeCanvas);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);
  const registry = usePatchboardStore((s) => s.registry);
  const wireBridges = usePatchboardStore((s) => s.wireBridges);

  const nodes: Node[] = useMemo(() => {
    if (!activeCanvas) return [];
    const result: Node[] = [];

    // Socket references
    for (const ref of activeCanvas.socketRefs) {
      const entry = registry?.sockets.find((s) => s.id === ref.socketId);
      const data: SocketRefNodeData = {
        socketId: ref.socketId,
        fullName: entry?.fullName ?? ref.socketId,
        displayName: entry?.displayName ?? ref.socketId,
        lifecycle: entry?.lifecycle ?? "draft",
      };
      result.push({
        id: `socket-ref-${ref.socketId}`,
        type: "socket-ref",
        position: { x: ref.position.x, y: ref.position.y },
        data,
        selectable: true,
        draggable: true,
      });
    }

    // Adapters
    for (const adapter of activeCanvas.adapters) {
      const isEntryPoint = activeCanvas.entryPoints.some(
        (ep) => ep.adapterId === adapter.id,
      );
      const socketNames = adapter.implements.map((sid) => {
        const entry = registry?.sockets.find((s) => s.id === sid);
        return entry?.displayName ?? sid;
      });
      const data: AdapterNodeData = {
        adapterId: adapter.id,
        name: adapter.name,
        implements: socketNames,
        constructorParams: adapter.constructorParams,
        isEntryPoint,
      };
      result.push({
        id: adapter.id,
        type: "adapter",
        position: { x: adapter.position.x, y: adapter.position.y },
        data,
        selectable: true,
        draggable: true,
      });
    }

    return result;
  }, [activeCanvas, registry]);

  const selectedEdgeId = usePatchboardStore((s) => s.selectedEdgeId);
  const edges: Edge[] = useMemo(() => {
    if (!activeCanvas) return [];
    const bridgeByWire = new Map(wireBridges.map((b) => [b.wireId, b]));
    return activeCanvas.wires.map((wire) => {
      const bridge = bridgeByWire.get(wire.id);
      const baseStyle = BRIDGE_STYLE[bridge?.level ?? "lossless"];
      const isSelected = wire.id === selectedEdgeId;
      // Selected: solid blue (accent). Otherwise: bridge-level color.
      const style = isSelected
        ? { stroke: "#3b82f6", strokeWidth: 2 }
        : { ...baseStyle, strokeWidth: 1.5 };
      return {
        id: wire.id,
        source: wire.fromAdapterId,
        sourceHandle: wire.fromSocketId,
        target: wire.toAdapterId,
        targetHandle: wire.toParamName,
        type: "default",
        animated: bridge?.level !== "incompatible",
        selected: isSelected,
        style,
        label: bridge && bridge.level !== "lossless" ? bridge.level : undefined,
        labelStyle: { fill: baseStyle.stroke, fontSize: 10 },
        data: bridge ? { bridge } : undefined,
      };
    });
  }, [activeCanvas, wireBridges, selectedEdgeId]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (!activeCanvas) return;

      // Only react to position changes from user drags. ReactFlow also emits
      // `dimensions` and `select` changes on every measurement and click —
      // propagating those back to the Zustand store causes a render loop
      // (activeCanvas re-references → nodes re-memoized → measurement →
      // dimension change → loop, observed as 8000+ ResizeObserver warnings).
      const positionChanges = changes.filter(
        (c): c is Extract<typeof c, { type: "position" }> =>
          c.type === "position",
      );
      if (positionChanges.length === 0) return;

      // Apply only the position changes against the current node list.
      const updatedNodes = applyNodeChanges(positionChanges, nodes);

      updateActiveCanvas((canvas) => {
        const newAdapters = [...canvas.adapters];
        const newSocketRefs = [...canvas.socketRefs];

        for (const node of updatedNodes) {
          if (node.type === "adapter") {
            const idx = newAdapters.findIndex((a) => a.id === node.id);
            if (idx !== -1) {
              newAdapters[idx] = {
                ...newAdapters[idx],
                position: { x: node.position.x, y: node.position.y },
              };
            }
          } else if (node.type === "socket-ref") {
            const socketId = node.id.replace("socket-ref-", "");
            const idx = newSocketRefs.findIndex((r) => r.socketId === socketId);
            if (idx !== -1) {
              newSocketRefs[idx] = {
                ...newSocketRefs[idx],
                position: { x: node.position.x, y: node.position.y },
              };
            }
          }
        }

        return { ...canvas, adapters: newAdapters, socketRefs: newSocketRefs };
      });
    },
    [activeCanvas, nodes, updateActiveCanvas],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (!activeCanvas) return;
      // Same trick as onNodesChange: only act on actual removals from the
      // user. ReactFlow also fires `select` changes on every click which
      // would churn the store reference for no reason.
      const removeIds = new Set(
        changes
          .filter((c): c is Extract<typeof c, { type: "remove" }> => c.type === "remove")
          .map((c) => c.id),
      );
      if (removeIds.size === 0) return;

      updateActiveCanvas((canvas) => ({
        ...canvas,
        wires: canvas.wires.filter((w) => !removeIds.has(w.id)),
      }));
    },
    [activeCanvas, updateActiveCanvas],
  );

  const setSelectedNode = usePatchboardStore((s) => s.setSelectedNode);
  const setSelectedEdge = usePatchboardStore((s) => s.setSelectedEdge);
  const onNodeClick = useCallback(
    (_e: MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );
  const onEdgeClick = useCallback(
    (_e: MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id);
    },
    [setSelectedEdge],
  );
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setSelectedNode, setSelectedEdge]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activeCanvas || !connection.source || !connection.target) return;

      const newWire: Wire = {
        id: `wire-${Date.now()}`,
        fromAdapterId: connection.source,
        fromSocketId: connection.sourceHandle ?? "",
        toAdapterId: connection.target,
        toParamName: connection.targetHandle ?? "",
      };

      updateActiveCanvas((canvas) => ({
        ...canvas,
        wires: [...canvas.wires, newWire],
      }));
    },
    [activeCanvas, updateActiveCanvas],
  );

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
  };
}
