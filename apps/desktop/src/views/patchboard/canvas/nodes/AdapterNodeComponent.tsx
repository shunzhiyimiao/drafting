import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Plug, Key } from "lucide-react";
import type { AdapterConstructorParam } from "../../../../types/patchboard-types";

export interface AdapterImplement {
  /** Socket ULID — used as the Handle id so wires reference the real ID. */
  id: string;
  /** Human-readable Socket name — shown in the row. */
  label: string;
}

export interface AdapterNodeData {
  adapterId: string;
  name: string;
  implements: AdapterImplement[];
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
      className={`bg-bg-secondary border rounded shadow-sm w-[200px] ${
        selected ? "border-accent" : "border-border"
      } ${nodeData.isEntryPoint ? "ring-1 ring-accent/40" : ""}`}
    >
      {/* Title bar — colored band, name + optional entry indicator. */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 border-b border-border rounded-t ${
          nodeData.isEntryPoint
            ? "bg-accent/25 text-text-primary"
            : "bg-accent/10 text-text-primary"
        }`}
      >
        <Box size={10} className="shrink-0 opacity-80" />
        <span className="text-[11px] font-semibold truncate flex-1">
          {nodeData.name}
        </span>
        {nodeData.isEntryPoint && (
          <Key size={9} className="text-accent shrink-0" />
        )}
      </div>

      {/* Field rows: one per implemented Socket. ReactFlow positions the
          Handle naturally at the row's right edge (slightly outside the
          node body — that's intentional, gives a clear connector dot).
          Drag from the dot to start a wire that follows the cursor. */}
      {nodeData.implements.length > 0 && (
        <div className="flex flex-col">
          {nodeData.implements.map((impl) => (
            <div
              key={impl.id}
              className="relative flex items-center gap-1.5 px-2 py-1 text-[10px] text-text-secondary border-b last:border-b-0 border-border/60"
              title={impl.label}
            >
              <Plug size={10} className="shrink-0 text-success" />
              <span className="truncate flex-1">{impl.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={impl.id}
                style={{
                  position: "absolute",
                  right: -6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 12,
                  height: 12,
                  background: "var(--color-success)",
                  border: "2px solid var(--app-bg, #000)",
                  borderRadius: 6,
                  cursor: "crosshair",
                  zIndex: 10,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Constructor params (socket deps) — yellow target dot on the
          LEFT of each row; drag a green source dot here to wire. */}
      {socketDeps.length > 0 && (
        <div className="flex flex-col bg-bg-primary/50 rounded-b">
          {socketDeps.map((p) => (
            <div
              key={`dep-${p.name}`}
              className="relative flex items-center gap-1.5 px-2 py-1 text-[10px] text-text-muted border-b last:border-b-0 border-border/60"
              title={`dependency: ${p.name}`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={p.name}
                style={{
                  position: "absolute",
                  left: -6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 12,
                  height: 12,
                  background: "var(--color-warning)",
                  border: "2px solid var(--app-bg, #000)",
                  borderRadius: 6,
                  cursor: "crosshair",
                  zIndex: 10,
                }}
              />
              <span className="truncate flex-1">{p.name}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

export const AdapterNodeComponent = memo(AdapterNodeComponentInner);
