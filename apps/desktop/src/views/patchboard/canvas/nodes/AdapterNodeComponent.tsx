import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AdapterConstructorParam } from "../../../../types/patchboard-types";

export interface AdapterNodeData {
  adapterId: string;
  name: string;
  implements: string[];
  constructorParams: AdapterConstructorParam[];
  isEntryPoint: boolean;
  [key: string]: unknown;
}

function AdapterNodeComponentInner({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AdapterNodeData;
  const socketDeps = nodeData.constructorParams.filter(
    (p) => p.paramType.kind === "socketDep",
  );

  return (
    <div
      className={`bg-bg-secondary border rounded-lg min-w-[180px] ${
        selected ? "border-accent" : "border-border"
      } ${nodeData.isEntryPoint ? "ring-1 ring-accent/40" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs font-medium text-text-primary">
          {nodeData.name}
        </span>
        {nodeData.isEntryPoint && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
            entry
          </span>
        )}
      </div>

      {/* Implements badges */}
      <div className="px-3 py-1 flex flex-wrap gap-1">
        {nodeData.implements.map((socketId) => (
          <span
            key={socketId}
            className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-secondary"
          >
            {socketId}
          </span>
        ))}
      </div>

      {/* Input handles (left) - one per SocketDep param */}
      {socketDeps.map((param, i) => (
        <Handle
          key={`in-${param.name}`}
          type="target"
          position={Position.Left}
          id={param.name}
          style={{ top: 50 + i * 20 }}
          className="!w-2.5 !h-2.5 !bg-accent !border-bg-primary"
        />
      ))}

      {/* Output handles (right) - one per implemented Socket */}
      {nodeData.implements.map((socketId, i) => (
        <Handle
          key={`out-${socketId}`}
          type="source"
          position={Position.Right}
          id={socketId}
          style={{ top: 50 + i * 20 }}
          className="!w-2.5 !h-2.5 !bg-success !border-bg-primary"
        />
      ))}
    </div>
  );
}

export const AdapterNodeComponent = memo(AdapterNodeComponentInner);
