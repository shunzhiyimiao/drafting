import {
  ArrowDown,
  ArrowUp,
  BoxSelect,
  Frame as FrameIcon,
  Image as ImageIcon,
  List as ListIcon,
  MousePointerClick,
  TextCursorInput,
  Trash2,
  Type,
} from "lucide-react";
import { isBind, type SketchNode } from "@drafting/sketch-core";
import { useSketchStore } from "../../stores/sketch-store";

const KIND_ICON = {
  stack: BoxSelect,
  frame: FrameIcon,
  list: ListIcon,
  text: Type,
  button: MousePointerClick,
  input: TextCursorInput,
  image: ImageIcon,
} as const;

function nodeLabel(node: SketchNode): string {
  switch (node.kind) {
    case "stack":
      return `stack · ${node.layout.direction}`;
    case "frame":
      return "frame";
    case "list":
      return `list · ${node.dataKey}`;
    case "text":
      return isBind(node.content) ? `{${node.content.bind}}` : node.content || "text";
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
  return <OutlineNode node={active.root} isRoot />;
}

function OutlineNode({
  node,
  isRoot = false,
}: {
  node: SketchNode;
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
      {/* Indent guide (S2a): children render inside a guided rail so depth
          reads at a glance — LAYERS-panel style. */}
      {(node.kind === "stack" || node.kind === "frame") && node.children.length > 0 && (
        <div className="ml-3 border-l border-border/40">
          {node.children.map((child) => (
            <OutlineNode key={child.id} node={child} />
          ))}
        </div>
      )}
      {/* The template is the list's required single root: it renders as a
          normal subtree but — like the sketch root — can't be moved or
          deleted (isRoot hides those controls; findNode gives it a null
          parent so the ops are no-ops anyway). Its children edit normally. */}
      {node.kind === "list" && (
        <div className="ml-3 border-l border-border/40">
          <OutlineNode key={node.template.id} node={node.template} isRoot />
        </div>
      )}
    </div>
  );
}
