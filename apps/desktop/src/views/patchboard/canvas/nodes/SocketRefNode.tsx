import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import type { SocketLifecycle } from "../../../../types/patchboard-types";

export interface SocketRefNodeData {
  socketId: string;
  fullName: string;
  displayName: string;
  lifecycle: SocketLifecycle;
  [key: string]: unknown;
}

const lifecycleColors: Record<SocketLifecycle, string> = {
  draft: "text-accent",
  stable: "text-success",
  deprecated: "text-warning",
  removed: "text-error",
};

function SocketRefNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as SocketRefNodeData;
  return (
    <div className="bg-bg-secondary border border-border rounded-lg px-3 py-2 min-w-[140px]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          Socket
        </span>
        <span
          className={`text-[10px] ${lifecycleColors[nodeData.lifecycle] ?? "text-text-muted"}`}
        >
          {nodeData.lifecycle}
        </span>
      </div>
      <div className="text-xs font-medium text-text-primary mt-1">
        {nodeData.displayName}
      </div>
      <div className="text-[10px] text-text-muted">{nodeData.fullName}</div>
    </div>
  );
}

export const SocketRefNode = memo(SocketRefNodeComponent);
