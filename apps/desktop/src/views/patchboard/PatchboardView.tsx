import { useEffect, useCallback, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { X, Check, Sparkles } from "lucide-react";
import { usePatchboardStore } from "../../stores/patchboard-store";
import { PatchboardCanvas } from "./canvas/PatchboardCanvas";
import { CanvasToolbar } from "./canvas/toolbar/CanvasToolbar";
import { CanvasListPanel } from "./canvas/panels/CanvasListPanel";
import { AdapterPanel } from "./canvas/panels/AdapterPanel";
import { RegistryPanel } from "./registry/RegistryPanel";
import { AiGenerateDialog } from "../../components/AiGenerateDialog";
import type { AdapterNode } from "../../types/patchboard-types";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { useT } from "../../lib/i18n";

const ADAPTER_SUGGEST_SYSTEM_PROMPT = `You are designing a TypeScript Adapter class for the Drafting Patchboard architecture.

An Adapter is a concrete implementation of one or more Sockets (interfaces). Given a description of what the Adapter should do and the list of available Sockets, propose:
1. A descriptive PascalCase class name
2. Which of the available Sockets this Adapter should implement (by their fullName)

Output ONLY a JSON object matching this schema, no markdown fences, no prose:

{
  "name": "<PascalCaseClassName>",
  "implementsSocketFullNames": ["<socket fullName from the provided list>", ...],
  "designNotes": "<2-3 short sentences on the implementation approach>"
}

Rules:
- Class name should hint at the underlying provider/library (e.g. OpenAiLlmProvider, PostgresUserRepo)
- Only reference Sockets from the provided list (matching their fullName exactly)
- An Adapter often implements just one Socket, but can implement multiple if they're closely related`;

interface AdapterSuggestion {
  name?: string;
  implementsSocketFullNames?: string[];
  designNotes?: string;
}

function parseAdapterSuggestion(raw: string): AdapterSuggestion | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  try {
    return JSON.parse(trimmed) as AdapterSuggestion;
  } catch {
    return null;
  }
}

type LeftTab = "canvases" | "registry";

export function PatchboardView() {
  const t = useT();
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
  const [showAddAdapter, setShowAddAdapter] = useState(false);
  const [showAdapterAi, setShowAdapterAi] = useState(false);
  const [adapterName, setAdapterName] = useState("");
  const [selectedSocketIds, setSelectedSocketIds] = useState<Set<string>>(new Set());
  const [confirmDeleteCanvas, setConfirmDeleteCanvas] = useState(false);
  const [projectRoot, setProjectRoot] = useState("");

  useEffect(() => {
    getProjectRoot().then(setProjectRoot);
  }, []);

  useEffect(() => {
    if (!initialized) {
      getProjectRoot().then((root) => initialize(root));
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

  const handleAddAdapterSubmit = useCallback(() => {
    if (!adapterName.trim() || selectedSocketIds.size === 0) return;

    const newAdapter: AdapterNode = {
      id: `adapter-${Date.now()}`,
      name: adapterName.trim(),
      implements: [...selectedSocketIds],
      constructorParams: [],
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };

    updateActiveCanvas((canvas) => ({
      ...canvas,
      adapters: [...canvas.adapters, newAdapter],
    }));

    setAdapterName("");
    setSelectedSocketIds(new Set());
    setShowAddAdapter(false);
  }, [adapterName, selectedSocketIds, updateActiveCanvas]);

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
    await deleteCanvas(activeCanvasId);
    setConfirmDeleteCanvas(false);
  }, [activeCanvasId, deleteCanvas]);

  const socketOptions = registry?.sockets ?? [];

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
              onAddAdapter={() => setShowAddAdapter(true)}
              onValidate={handleValidate}
              onGenerate={handleGenerate}
              onDeleteCanvas={() => setConfirmDeleteCanvas(true)}
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

      {/* Add Adapter dialog */}
      {showAddAdapter && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAddAdapter(false)}
        >
          <div
            className="glass-thick rounded-2xl w-[400px] p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-text-primary">
                Add Adapter
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAdapterAi(true)}
                  disabled={!projectRoot || (registry?.sockets.length ?? 0) === 0}
                  className="text-[10px] text-accent hover:text-accent/80 disabled:opacity-40 inline-flex items-center gap-1"
                  title={t("patchboard.ai.suggestAdapterTitle")}
                >
                  <Sparkles size={11} />
                  {t("patchboard.ai.suggestAdapterButton")}
                </button>
                <button
                  onClick={() => setShowAddAdapter(false)}
                  className="text-text-muted hover:text-text-secondary"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-text-muted">
                Class Name
              </label>
              <input
                value={adapterName}
                onChange={(e) => setAdapterName(e.target.value)}
                placeholder={t("patchboard.adapterNamePlaceholder")}
                autoFocus
                className="w-full mt-1 px-2 py-1.5 text-xs rounded"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddAdapterSubmit();
                }}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-text-muted">
                Implements (select sockets)
              </label>
              {socketOptions.length === 0 ? (
                <p className="text-xs text-text-muted mt-1">
                  No sockets defined. Create one in Registry first.
                </p>
              ) : (
                <div className="flex flex-col gap-1 mt-1 max-h-48 overflow-auto">
                  {socketOptions.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSocketIds.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(selectedSocketIds);
                          if (e.target.checked) {
                            next.add(s.id);
                          } else {
                            next.delete(s.id);
                          }
                          setSelectedSocketIds(next);
                        }}
                        className="w-3 h-3 accent-accent"
                      />
                      <span className="text-xs text-text-primary">
                        {s.displayName}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {s.fullName}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddAdapter(false)}
                className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAdapterSubmit}
                disabled={!adapterName.trim() || selectedSocketIds.size === 0}
                className="glass-button-primary px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors inline-flex items-center gap-1"
              >
                <Check size={14} />
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete canvas */}
      {confirmDeleteCanvas && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setConfirmDeleteCanvas(false)}
        >
          <div
            className="glass-thick rounded-2xl w-[340px] p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary">
              Delete Canvas?
            </h3>
            <p className="text-xs text-text-muted">
              This will delete "{activeCanvas?.name}" and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteCanvas(false)}
                className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCanvas}
                className="glass-button-error px-4 py-2 text-sm rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdapterAi && (
        <AiGenerateDialog
          open
          onClose={() => setShowAdapterAi(false)}
          title={t("patchboard.ai.suggestAdapterTitle")}
          taskId="patchboardSuggestAdapter"
          projectRoot={projectRoot}
          systemPrompt={ADAPTER_SUGGEST_SYSTEM_PROMPT}
          userPromptBuilder={(desc) => {
            const socketList = socketOptions
              .map((s) => `- ${s.fullName} (${s.displayName})`)
              .join("\n");
            return `Description:\n${desc}\n\nAvailable Sockets:\n${socketList || "(none — Adapter must implement at least one Socket, so create a Socket first)"}\n\nOutput the JSON object now.`;
          }}
          inputLabel={t("patchboard.ai.suggestAdapterInputLabel")}
          inputPlaceholder={t("patchboard.ai.suggestAdapterInputPlaceholder")}
          temperature={0.4}
          maxTokens={800}
          onAccept={(text) => {
            const parsed = parseAdapterSuggestion(text);
            if (parsed?.name) setAdapterName(parsed.name);
            if (Array.isArray(parsed?.implementsSocketFullNames)) {
              const idsToSelect = new Set<string>();
              for (const fullName of parsed.implementsSocketFullNames) {
                const match = socketOptions.find((s) => s.fullName === fullName);
                if (match) idsToSelect.add(match.id);
              }
              if (idsToSelect.size > 0) setSelectedSocketIds(idsToSelect);
            }
            setShowAdapterAi(false);
          }}
        />
      )}
    </div>
  );
}
