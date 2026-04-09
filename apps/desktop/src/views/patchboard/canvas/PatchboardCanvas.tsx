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

const nodeTypes = {
  "socket-ref": SocketRefNode,
  adapter: AdapterNodeComponent,
};

export function PatchboardCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
    useCanvasState();

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
        style={{ background: "#11111b" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#313244"
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
