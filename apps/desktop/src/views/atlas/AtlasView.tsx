import { useEffect } from "react";
import {
  Map,
  Box,
  FileText,
  Hash,
  Braces,
  Workflow,
  Zap,
  FileCode,
  ArrowRight,
} from "lucide-react";
import { useAtlasStore } from "../../stores/atlas-store";
import { useEditorStore } from "../../stores/editor-store";
import { useNavigationStore } from "../../stores/navigation-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import type { AtlasSymbol, SymbolKind } from "../../types/atlas-types";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { useT } from "../../lib/i18n";

const kindIcons: Record<SymbolKind, typeof Box> = {
  class: Box,
  interface: Braces,
  function: Workflow,
  method: Workflow,
  property: Hash,
  enum: Hash,
  typeAlias: FileCode,
  variable: Hash,
  struct: Box,
  trait: Braces,
  impl: Box,
  module: FileText,
};

const kindColors: Record<SymbolKind, string> = {
  class: "text-accent",
  interface: "text-info",
  function: "text-success",
  method: "text-success",
  property: "text-text-muted",
  enum: "text-warning",
  typeAlias: "text-info",
  variable: "text-text-muted",
  struct: "text-accent",
  trait: "text-info",
  impl: "text-warning",
  module: "text-text-secondary",
};

export function AtlasView() {
  const t = useT();
  const initialize = useAtlasStore((s) => s.initialize);
  const activeFilePath = useAtlasStore((s) => s.activeFilePath);
  const fileMap = useAtlasStore((s) => s.fileMap);
  const loading = useAtlasStore((s) => s.loading);
  const error = useAtlasStore((s) => s.error);
  const loadFile = useAtlasStore((s) => s.loadFile);

  // Sync with editor's active tab
  const editorActivePath = useEditorStore((s) => s.activeTabPath);
  const openFile = useEditorStore((s) => s.openFile);
  const setActiveView = useNavigationStore((s) => s.setActiveView);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);

  useEffect(() => {
    // Always re-init on mount so the store picks up the current workspace.
    getProjectRoot().then((root) => initialize(root));
  }, [initialize]);

  useEffect(() => {
    if (editorActivePath && editorActivePath !== activeFilePath) {
      loadFile(editorActivePath);
    }
  }, [editorActivePath, activeFilePath, loadFile]);

  const handleSymbolClick = async (_symbol: AtlasSymbol) => {
    if (!activeFilePath) return;
    await openFile(activeFilePath);
    setActiveView("editor");
    // Editor jump-to-line would require Monaco API integration;
    // for now, opening the file is enough.
  };

  const handleOpenAdapter = async () => {
    if (fileMap?.adapterId) {
      // Find canvas containing this adapter — for now, just switch view
      setActiveView("patchboard");
    }
  };

  const handleOpenBlueprint = async () => {
    if (fileMap?.fileBlueprintId) {
      await loadBlueprint(fileMap.fileBlueprintId);
      setActiveView("blueprint");
    }
  };

  if (!activeFilePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Map size={48} className="text-text-muted mb-4" />
        <h2 className="text-lg font-medium text-text-primary mb-2">{t("atlas.title")}</h2>
        <p className="text-sm text-text-muted max-w-md mb-4">
          {t("atlas.empty")}
        </p>
        <button
          onClick={() => setActiveView("editor")}
          className="glass-button-primary px-3.5 py-1.5 text-xs rounded-lg font-medium"
        >
          Go to Editor
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Parsing {activeFilePath}...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error text-sm">
        {error}
      </div>
    );
  }

  if (!fileMap) return null;

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="glass-panel px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-muted">
              <Map size={10} />
              File Map
            </div>
            <h1 className="text-sm font-medium text-text-primary mt-0.5">
              {fileMap.path}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
              <span>{fileMap.language}</span>
              <span>{fileMap.totalLines} lines</span>
              <span>{countSymbols(fileMap.symbols)} symbols</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fileMap.adapterId && (
              <button
                onClick={handleOpenAdapter}
                className="glass-button px-2.5 py-1 text-[10px] rounded-lg flex items-center gap-1 text-accent"
                title={t("atlas.viewInPatchboard")}
              >
                <Zap size={11} />
                Adapter
              </button>
            )}
            {fileMap.fileBlueprintId && (
              <button
                onClick={handleOpenBlueprint}
                className="glass-button px-2.5 py-1 text-[10px] rounded-lg flex items-center gap-1 text-success"
                title={t("atlas.viewBlueprint")}
              >
                <FileText size={11} />
                Blueprint
              </button>
            )}
            {fileMap.isGenerated && (
              <span className="px-2 py-1 text-[10px] rounded-lg bg-warning/20 text-warning">
                Generated
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Symbol tree */}
      <div className="glass-panel flex-1 overflow-auto">
        {fileMap.symbols.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm">
            No symbols detected in this file.
          </div>
        ) : (
          <div className="py-2">
            {fileMap.symbols.map((sym, idx) => (
              <SymbolNode
                key={`${sym.name}-${idx}`}
                symbol={sym}
                depth={0}
                onClick={handleSymbolClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SymbolNode({
  symbol,
  depth,
  onClick,
}: {
  symbol: AtlasSymbol;
  depth: number;
  onClick: (s: AtlasSymbol) => void;
}) {
  const Icon = kindIcons[symbol.kind] ?? Box;
  const color = kindColors[symbol.kind] ?? "text-text-secondary";

  return (
    <>
      <button
        onClick={() => onClick(symbol)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors group"
        style={{ paddingLeft: depth * 16 + 12 }}
      >
        <Icon size={12} className={`${color} shrink-0`} />
        <span className="text-xs text-text-primary truncate flex-1">
          {symbol.name}
        </span>
        {symbol.detail && (
          <span className="text-[10px] text-text-muted">{symbol.detail}</span>
        )}
        <span className="text-[10px] text-text-muted tabular-nums">
          L{symbol.line}
        </span>
        <ArrowRight
          size={10}
          className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </button>
      {symbol.children.map((child, idx) => (
        <SymbolNode
          key={`${child.name}-${idx}`}
          symbol={child}
          depth={depth + 1}
          onClick={onClick}
        />
      ))}
    </>
  );
}

function countSymbols(symbols: AtlasSymbol[]): number {
  return symbols.reduce(
    (acc, s) => acc + 1 + countSymbols(s.children),
    0,
  );
}
