import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { ChevronRight } from "lucide-react";
import { defaultTheme, toJsxString, type SketchNode } from "@drafting/sketch-core";
import { useSketchStore } from "../../stores/sketch-store";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { defineDraftingThemes } from "../../lib/monaco-themes";
import { SketchTextPanel } from "./SketchTextPanel";

/** The designer's bottom dock (S2a): tabs over the document's two honest
 *  textual faces — MARKUP (the .sketch source, THE document, editable) and
 *  CODE (the generated React, computed live by the same sketch-core fold
 *  codegen runs — read-only, write-only-file semantics made visible).
 *  A breadcrumb of the selected node's ancestry rides above; clicking an
 *  ancestor selects it (canvas + text follow, as everywhere). */
type DockTab = "markup" | "code";

/** Ancestor chain root→selected, template hops included. */
function ancestryOf(root: SketchNode, nodeId: string): SketchNode[] {
  const path: SketchNode[] = [];
  const walk = (n: SketchNode, trail: SketchNode[]): boolean => {
    const next = [...trail, n];
    if (n.id === nodeId) {
      path.push(...next);
      return true;
    }
    if (n.kind === "stack" || n.kind === "frame") return n.children.some((c) => walk(c, next));
    if (n.kind === "list") return walk(n.template, next);
    return false;
  };
  walk(root, []);
  return path;
}

export function BottomDock() {
  const [tab, setTab] = useState<DockTab>("markup");
  const active = useSketchStore((s) => s.active);
  const activeFile = useSketchStore((s) => s.activeFile);
  const parseError = useSketchStore((s) => s.parseError);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectNode = useSketchStore((s) => s.selectNode);
  const themeVariant = useThemeStore((s) => s.variant);
  const appearance = useSettingsStore((s) => s.appearance);

  // The generated half, computed by the SAME fold the codegen-server runs
  // (K3's one implementation) — from the last GOOD parse.
  const generated = useMemo(() => {
    if (!active) return "";
    try {
      return toJsxString(active, defaultTheme, activeFile ?? undefined);
    } catch (e) {
      return `// 生成失败: ${String(e)}`;
    }
  }, [active, activeFile]);

  const crumbs =
    active && selectedNodeId ? ancestryOf(active.root, selectedNodeId) : [];

  const crumbLabel = (n: SketchNode) => {
    if (n.kind === "stack") return `Stack·${n.layout.direction}`;
    if (n.kind === "frame") return "Frame";
    if (n.kind === "list") return `List·${n.dataKey}`;
    return n.kind.charAt(0).toUpperCase() + n.kind.slice(1);
  };

  return (
    <div className="flex flex-col min-h-0 h-full glass-panel">
      {/* tab strip + breadcrumb */}
      <div className="flex items-center gap-1 px-2 pt-1.5 shrink-0">
        {(
          [
            ["markup", "MARKUP"],
            ["code", "CODE"],
          ] as [DockTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-2.5 py-1 text-[10px] tracking-wider rounded-t-md border-b-2 transition-colors ${
              tab === id
                ? "text-text-primary border-accent"
                : "text-text-muted border-transparent hover:text-text-secondary"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-border/60" />
        <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
          {crumbs.map((n, i) => (
            <span key={n.id} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <ChevronRight size={9} className="text-text-muted" />}
              <button
                onClick={() => selectNode(n.id)}
                className={`text-[10px] px-1 py-0.5 rounded hover:bg-bg-hover ${
                  i === crumbs.length - 1 ? "text-accent" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {crumbLabel(n)}
              </button>
            </span>
          ))}
        </div>
        {tab === "code" && (
          <span className="ml-auto text-[9px] text-text-muted pr-1">
            generated · 只读 · 保存后由 codegen 落盘
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "markup" ? (
          <SketchTextPanel />
        ) : (
          <Editor
            value={generated}
            language="typescript"
            theme={`drafting-${themeVariant}`}
            beforeMount={(m) => defineDraftingThemes(m)}
            options={{
              readOnly: true,
              fontFamily: appearance.fontFamily,
              fontSize: appearance.fontSize,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
              padding: { top: 8, bottom: 8 },
              renderWhitespace: "none",
              domReadOnly: true,
            }}
          />
        )}
      </div>
      {tab === "code" && parseError && (
        <div className="px-3 py-1 text-[10px] text-warning shrink-0">
          文档当前有方言错误——预览基于最后一次成功解析。
        </div>
      )}
    </div>
  );
}

// The dock intentionally has no STYLES/EVENTS/DATA tabs yet: STYLES is the
// token system (finite, edited in the Inspector), EVENTS are the sibling
// file's typed handlers, DATA is d:Sample (edited on the List node). Faking
// them as empty panes would imply capabilities the model doesn't have.
