import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePatchboardStore } from "../../../stores/patchboard-store";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasState } from "./hooks/useCanvasState";
import { SocketRefNode } from "./nodes/SocketRefNode";
import { AdapterNodeComponent } from "./nodes/AdapterNodeComponent";
import { useThemeStore } from "../../../stores/theme-store";

// IMPORTANT: nodeTypes MUST be a stable reference across renders, otherwise
// ReactFlow remounts every node on each render and Handle event listeners
// never settle (the connection drag won't even start).
const NODE_TYPES = {
  "socket-ref": SocketRefNode,
  adapter: AdapterNodeComponent,
};

const DEFAULT_EDGE_OPTIONS = { animated: true };
const CONNECTION_LINE_STYLE = {
  stroke: "#ff00aa",
  strokeWidth: 3,
  strokeDasharray: "5 5",
};
const FIT_VIEW_OPTIONS = { padding: 0.2 };
const PRO_OPTIONS = { hideAttribution: true };
const RF_STYLE = { background: "transparent" };

export function PatchboardCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onEdgeClick,
    onPaneClick,
  } = useCanvasState();
  const selectedEdgeId = usePatchboardStore((s) => s.selectedEdgeId);
  const setSelectedEdge = usePatchboardStore((s) => s.setSelectedEdge);
  const updateActiveCanvas = usePatchboardStore((s) => s.updateActiveCanvas);

  // Global keyboard listener — Tauri's webview sometimes doesn't bubble
  // Delete/Backspace into ReactFlow's internal handler, so we wire it
  // ourselves against the store's selectedEdgeId.
  useEffect(() => {
    if (!selectedEdgeId) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return; // don't hijack typing
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        updateActiveCanvas((canvas) => ({
          ...canvas,
          wires: canvas.wires.filter((w) => w.id !== selectedEdgeId),
        }));
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEdgeId, setSelectedEdge, updateActiveCanvas]);
  const themeVariant = useThemeStore((s) => s.variant);
  const { fitView } = useReactFlow();
  const prevCountRef = useRef(0);
  const didInitialFit = useRef(false);

  const handleConnectStart = useCallback(
    (_e: unknown, params: { nodeId: string | null; handleId: string | null; handleType: "source" | "target" | null }) => {
      console.warn("[wire] connectStart", params);
    },
    [],
  );
  const handleConnectEnd = useCallback((_e: unknown) => {
    console.warn("[wire] connectEnd");
  }, []);
  void useMemo; // imported above; reserved for future use

  // 1. First render with non-empty nodes → fit the viewport. ReactFlow's
  //    own `fitView` prop only fires on the very first mount, which is
  //    usually when nodes is still empty.
  // 2. Every subsequent node-count increase → re-fit so newly added nodes
  //    become visible.
  useEffect(() => {
    if (nodes.length === 0) {
      didInitialFit.current = false;
      prevCountRef.current = 0;
      return;
    }
    const shouldFit =
      !didInitialFit.current || nodes.length > prevCountRef.current;
    if (shouldFit) {
      const t = setTimeout(() => {
        fitView({ padding: 0.2, duration: 400, includeHiddenNodes: false });
      }, 80);
      didInitialFit.current = true;
      prevCountRef.current = nodes.length;
      return () => clearTimeout(t);
    }
    prevCountRef.current = nodes.length;
  }, [nodes.length, fitView]);

  const dotColor =
    themeVariant === "light"
      ? "rgba(30, 40, 80, 0.18)"
      : themeVariant === "blossom"
        ? "rgba(170, 40, 80, 0.2)"
        : themeVariant === "mist"
          ? "rgba(40, 55, 140, 0.2)"
          : themeVariant === "soft"
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(255, 255, 255, 0.08)";

  return (
    <div className="w-full h-full relative">
      {/* Debug: counts + edge data + Fit View button */}
      <div className="absolute top-2 right-2 z-10 flex items-start gap-2">
        <div className="px-2 py-1 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-muted max-w-[300px]">
          <div>nodes={nodes.length} edges={edges.length}</div>
          {edges.length > 0 && (
            <div className="mt-0.5 break-all">
              edge[0]: {edges[0].source} ({edges[0].sourceHandle}) →{" "}
              {edges[0].target} ({edges[0].targetHandle})
            </div>
          )}
        </div>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 400 })}
          className="glass-button px-2 py-1 text-[11px] rounded-lg"
          title="Fit all nodes into view"
        >
          Fit View
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        proOptions={PRO_OPTIONS}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        style={RF_STYLE}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={dotColor}
        />
        <Controls
          showInteractive={false}
          className="!bg-bg-secondary !border-border !shadow-none [&>button]:!bg-bg-secondary [&>button]:!border-border [&>button]:!fill-text-muted [&>button:hover]:!bg-bg-hover"
        />
        <MiniMap
          nodeColor="#45475a"
          maskColor="rgba(17, 17, 27, 0.7)"
          className="!bg-bg-secondary !border-border"
        />
      </ReactFlow>
    </div>
  );
}
