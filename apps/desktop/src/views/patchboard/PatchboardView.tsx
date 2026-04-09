import { useEffect, useCallback, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { usePatchboardStore } from "../../stores/patchboard-store";
import { PatchboardCanvas } from "./canvas/PatchboardCanvas";
import { CanvasToolbar } from "./canvas/toolbar/CanvasToolbar";
import { CanvasListPanel } from "./canvas/panels/CanvasListPanel";
import { AdapterPanel } from "./canvas/panels/AdapterPanel";
import { RegistryPanel } from "./registry/RegistryPanel";
import type { AdapterNode } from "../../types/patchboard-types";

type LeftTab = "canvases" | "registry";

export function PatchboardView() {
  const {
    initialized,
    initialize,
    activeCanvas,
    activeCanvasId,
    updateActiveCanvas,
    saveActiveCanvas,
    deleteCanvas,
    validateActiveCanvas,
    registry,
  } = usePatchboardStore();

  const [leftTab, setLeftTab] = useState<LeftTab>("canvases");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // Auto-initialize with current working directory
  useEffect(() => {
    if (!initialized) {
      // In dev mode, use the parent of the Tauri app directory
      // This would be the user's project root in production
      initialize(".");
    }
  }, [initialized, initialize]);

  // Auto-save on canvas changes (debounced)
  useEffect(() => {
    if (!activeCanvas) return;
    const timer = setTimeout(() => {
      saveActiveCanvas();
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeCanvas, saveActiveCanvas]);

  const handleAddAdapter = useCallback(() => {
    const name = prompt("Adapter class name:");
    if (!name) return;

    // Pick sockets to implement
    const socketOptions = registry?.sockets ?? [];
    if (socketOptions.length === 0) {
      alert("Create at least one Socket in the Registry first.");
      return;
    }

    const socketList = socketOptions
      .map((s, i) => `${i + 1}. ${s.displayName} (${s.fullName})`)
      .join("\n");
    const input = prompt(
      `Which Sockets does ${name} implement?\nEnter numbers separated by commas:\n\n${socketList}`,
    );
    if (!input) return;

    const indices = input
      .split(",")
      .map((s) => parseInt(s.trim()) - 1)
      .filter((i) => i >= 0 && i < socketOptions.length);

    if (indices.length === 0) {
      alert("Adapter must implement at least one Socket.");
      return;
    }

    const implementsIds = indices.map((i) => socketOptions[i].id);

    const newAdapter: AdapterNode = {
      id: `adapter-${Date.now()}`,
      name,
      implements: implementsIds,
      constructorParams: [],
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };

    updateActiveCanvas((canvas) => ({
      ...canvas,
      adapters: [...canvas.adapters, newAdapter],
    }));
  }, [registry, updateActiveCanvas]);

  const handleValidate = useCallback(async () => {
    const result = await validateActiveCanvas();
    if (!result) return;
    if (result.valid) {
      setValidationMsg("Canvas is valid.");
    } else {
      setValidationMsg(`Errors: ${result.errors.join("; ")}`);
    }
    setTimeout(() => setValidationMsg(null), 5000);
  }, [validateActiveCanvas]);

  const generateCode = usePatchboardStore((s) => s.generateCode);

  const handleGenerate = useCallback(async () => {
    try {
      const result = await generateCode();
      if (result) {
        setValidationMsg(
          result.success
            ? `Generated ${result.files.length} files: ${result.files.join(", ")}`
            : `Generation failed: ${result.errors.join("; ")}`,
        );
        setTimeout(() => setValidationMsg(null), 8000);
      }
    } catch (err: any) {
      setValidationMsg(`Error: ${err.message ?? err}`);
      setTimeout(() => setValidationMsg(null), 5000);
    }
  }, [generateCode]);

  const handleDeleteCanvas = useCallback(async () => {
    if (!activeCanvasId) return;
    if (confirm("Delete this canvas?")) {
      await deleteCanvas(activeCanvasId);
    }
  }, [activeCanvasId, deleteCanvas]);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-52 bg-bg-secondary border-r border-border flex flex-col shrink-0">
        <div className="flex border-b border-border">
          <button
            onClick={() => setLeftTab("canvases")}
            className={`flex-1 px-2 py-1.5 text-xs text-center transition-colors ${
              leftTab === "canvases"
                ? "text-text-primary bg-bg-hover"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Canvases
          </button>
          <button
            onClick={() => setLeftTab("registry")}
            className={`flex-1 px-2 py-1.5 text-xs text-center transition-colors ${
              leftTab === "registry"
                ? "text-text-primary bg-bg-hover"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Registry
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {leftTab === "canvases" ? <CanvasListPanel /> : <RegistryPanel />}
        </div>
      </div>

      {/* Center: canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeCanvas ? (
          <>
            <CanvasToolbar
              canvasName={activeCanvas.name}
              onAddAdapter={handleAddAdapter}
              onValidate={handleValidate}
              onGenerate={handleGenerate}
              onDeleteCanvas={handleDeleteCanvas}
            />
            {validationMsg && (
              <div className="px-3 py-1.5 text-xs bg-bg-hover border-b border-border text-text-secondary">
                {validationMsg}
              </div>
            )}
            <div className="flex-1">
              <ReactFlowProvider>
                <PatchboardCanvas />
              </ReactFlowProvider>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            Select or create a canvas from the left panel.
          </div>
        )}
      </div>

      {/* Right panel: properties */}
      <div className="w-56 bg-bg-secondary border-l border-border shrink-0 overflow-auto">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Properties
          </span>
        </div>
        <AdapterPanel />
      </div>
    </div>
  );
}
