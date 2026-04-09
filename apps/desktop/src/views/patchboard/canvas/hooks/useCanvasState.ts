import { useCallback, useMemo } from "react";
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import { usePatchboardStore } from "../../../../stores/patchboard-store";
import type { Wire } from "../../../../types/patchboard-types";
import type { SocketRefNodeData } from "../nodes/SocketRefNode";
import type { AdapterNodeData } from "../nodes/AdapterNodeComponent";

/**
 * Converts the Patchboard Canvas data model to react-flow nodes/edges
 * and provides change handlers that update the Zustand store.
 */
export function useCanvasState() {
  const activeCanvas = usePatchboardStore((s) => s.activeCanvas);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);
  const registry = usePatchboardStore((s) => s.registry);

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

  const edges: Edge[] = useMemo(() => {
    if (!activeCanvas) return [];
    return activeCanvas.wires.map((wire) => ({
      id: wire.id,
      source: wire.fromAdapterId,
      sourceHandle: wire.fromSocketId,
      target: wire.toAdapterId,
      targetHandle: wire.toParamName,
      type: "default",
      animated: true,
      style: { stroke: "#89b4fa" },
    }));
  }, [activeCanvas]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (!activeCanvas) return;

      // Apply position changes back to the canvas data model
      const updatedNodes = applyNodeChanges(changes, nodes);

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
      const updatedEdges = applyEdgeChanges(changes, edges);
      const wireIds = new Set(updatedEdges.map((e) => e.id));

      updateActiveCanvas((canvas) => ({
        ...canvas,
        wires: canvas.wires.filter((w) => wireIds.has(w.id)),
      }));
    },
    [activeCanvas, edges, updateActiveCanvas],
  );

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

  return { nodes, edges, onNodesChange, onEdgesChange, onConnect };
}
