import {
  ArrowDown,
  ArrowUp,
  BoxSelect,
  Image as ImageIcon,
  MousePointerClick,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import type { SketchNode } from "@drafting/sketch-core";
import { useSketchStore } from "../../stores/sketch-store";

const KIND_ICON = {
  stack: BoxSelect,
  text: Type,
  button: MousePointerClick,
  input: TextCursorInput,
  image: ImageIcon,
} as const;

function nodeLabel(node: SketchNode): string {
  switch (node.kind) {
    case "stack":
      return `stack · ${node.layout.direction}`;
    case "text":
      return node.content || "text";
    case "button":
      return node.label || "button";
    case "input":
      return node.label || "input";
    case "image":
      return node.alt || "image";
  }
}

export function SketchOutline() {
  const active = useSketchStore((s) => s.active);
  if (!active) return null;
  return <OutlineNode node={active.root} depth={0} isRoot />;
}

function OutlineNode({
  node,
  depth,
  isRoot = false,
}: {
  node: SketchNode;
  depth: number;
  isRoot?: boolean;
}) {
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectNode = useSketchStore((s) => s.selectNode);
  const deleteNode = useSketchStore((s) => s.deleteNode);
  const moveNode = useSketchStore((s) => s.moveNode);

  const Icon = KIND_ICON[node.kind];
  const selected = selectedNodeId === node.id;

  return (
    <div>
      <div
        onClick={() => selectNode(node.id)}
        className={`group flex items-center gap-1.5 pr-1 py-1 rounded cursor-pointer text-xs ${
          selected
            ? "bg-accent/15 text-text-primary"
            : "text-text-secondary hover:bg-bg-hover"
        }`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <Icon size={11} className="shrink-0 text-text-muted" />
        <span className="truncate flex-1">{nodeLabel(node)}</span>
        {!isRoot && selected && (
          <span className="flex items-center gap-0.5 opacity-70">
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveNode(node.id, "up");
              }}
              title="Move up"
              className="hover:text-accent"
            >
              <ArrowUp size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                moveNode(node.id, "down");
              }}
              title="Move down"
              className="hover:text-accent"
            >
              <ArrowDown size={10} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(node.id);
              }}
              title="Delete node (bound criteria go dangling, never deleted)"
              className="hover:text-error"
            >
              <Trash2 size={10} />
            </button>
          </span>
        )}
      </div>
      {node.kind === "stack" &&
        node.children.map((child) => (
          <OutlineNode key={child.id} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
