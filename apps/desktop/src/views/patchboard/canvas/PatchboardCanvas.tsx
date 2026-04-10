import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasState } from "./hooks/useCanvasState";
import { SocketRefNode } from "./nodes/SocketRefNode";
import { AdapterNodeComponent } from "./nodes/AdapterNodeComponent";
import { useThemeStore } from "../../../stores/theme-store";

const nodeTypes = {
  "socket-ref": SocketRefNode,
  adapter: AdapterNodeComponent,
};

export function PatchboardCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
    useCanvasState();
  const themeVariant = useThemeStore((s) => s.variant);

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
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: true }}
        style={{ background: "transparent" }}
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
