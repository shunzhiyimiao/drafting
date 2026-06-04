import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReactFlowProvider } from "@xyflow/react";
import { X, Check, Sparkles } from "lucide-react";
import { usePatchboardStore } from "../../stores/patchboard-store";
import { PatchboardCanvas } from "./canvas/PatchboardCanvas";
import { CanvasToolbar } from "./canvas/toolbar/CanvasToolbar";
import { CanvasListPanel } from "./canvas/panels/CanvasListPanel";
import { AdapterPanel } from "./canvas/panels/AdapterPanel";
import { WirePanel } from "./canvas/panels/WirePanel";
import { RegistryPanel } from "./registry/RegistryPanel";
import { AiGenerateDialog } from "../../components/AiGenerateDialog";
import type { AdapterNode } from "../../types/patchboard-types";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { useT } from "../../lib/i18n";
import { notify } from "../../stores/notification-store";

const ADAPTER_SUGGEST_SYSTEM_PROMPT = `You are designing a TypeScript Adapter class for the Drafting Patchboard architecture. An Adapter is a concrete implementation of one or more Sockets (interfaces).

# OUTPUT FORMAT — STRICT

Your ENTIRE response MUST be a single JSON object.
- The VERY FIRST character of your response MUST be \`{\` (left brace).
- The VERY LAST character of your response MUST be \`}\` (right brace).
- No markdown, no code fences, no prose, no explanation before or after.
- No "Here is..." preamble. No trailing notes. Nothing but the JSON object.

If you cannot satisfy these constraints, output the literal string \`{}\` and nothing else.

# JSON SCHEMA

{
  "name": "<PascalCaseClassName>",
  "implementsSocketFullNames": ["<socket fullName from the provided list>", ...],
  "designNotes": "<2-3 short sentences on the implementation approach>"
}

# CONTENT RULES

- \`name\` should hint at the underlying provider/library (e.g. OpenAiLlmProvider, PostgresUserRepo, NodemailerEmailSender).
- \`implementsSocketFullNames\` MUST be an array of strings that EXACTLY match fullNames from the provided socket list. Do not invent or modify fullNames.
- An Adapter often implements just one Socket, but can implement multiple if they're closely related.
- Do NOT include any keys beyond the schema above.
- All quotes MUST be double-quotes ("). All commas MUST be ASCII commas (,). Never use Chinese or smart-quote punctuation.

# REMINDER

Re-read your response before finishing. Confirm:
1. First character is \`{\`.
2. Last character is \`}\`.
3. \`implementsSocketFullNames\` values all appear in the provided list (don't make them up).
4. The object parses with \`JSON.parse\` in standard JavaScript.

If any check fails, fix it before stopping.`;

interface AdapterSuggestion {
  name?: string;
  implementsSocketFullNames?: string[];
  designNotes?: string;
}

function parseAdapterSuggestion(raw: string): AdapterSuggestion | null {
  const attempts: string[] = [];
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  attempts.push(s);
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    attempts.push(s.slice(first, last + 1));
    attempts.push(
      s
        .slice(first, last + 1)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,/g, ",")
        .replace(/:/g, ":"),
    );
  }
  // Recover from missing leading `{`
  if (/^\s*"[\w-]+"\s*:/.test(s) && s.lastIndexOf("}") > 0) {
    attempts.push(`{${s.slice(0, s.lastIndexOf("}") + 1)}`);
  }
  if (s.startsWith("{") && !s.includes("}")) {
    attempts.push(`${s}}`);
  }
  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as AdapterSuggestion;
      }
    } catch {
      // try next
    }
  }
  return null;
}

type LeftTab = "canvases" | "registry";

export function PatchboardView() {
  const t = useT();
  const {
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
  const [confirmOverwrite, setConfirmOverwrite] = useState<string[] | null>(null);
  const [projectRoot, setProjectRoot] = useState("");

  useEffect(() => {
    getProjectRoot().then(setProjectRoot);
  }, []);

  useEffect(() => {
    // Always re-init on mount so the store picks up the current workspace
    // — fixes stale projectRoot after a workspace switch.
    getProjectRoot().then((root) => initialize(root));
  }, [initialize]);

  // Auto-save on canvas changes (debounced)
  useEffect(() => {
    if (!activeCanvas) return;
    const timer = setTimeout(() => {
      saveActiveCanvas().catch((e: any) => {
        setValidationMsg(`⚠ 自动保存失败: ${e?.message ?? String(e)}`);
        setTimeout(() => setValidationMsg(null), 8000);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeCanvas, saveActiveCanvas]);

  const handleAddAdapterSubmit = useCallback(() => {
    if (!adapterName.trim()) {
      setValidationMsg("Class Name 不能为空");
      setTimeout(() => setValidationMsg(null), 4000);
      return;
    }
    if (selectedSocketIds.size === 0) {
      setValidationMsg("至少选一个 Socket 让 Adapter 实现");
      setTimeout(() => setValidationMsg(null), 4000);
      return;
    }
    if (!activeCanvas) {
      setValidationMsg(
        "没有激活的 Canvas — 先在 Canvases 标签页创建并选中一张画布",
      );
      setTimeout(() => setValidationMsg(null), 5000);
      setShowAddAdapter(false);
      return;
    }

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
    setValidationMsg(`已添加 Adapter: ${newAdapter.name}`);
    setTimeout(() => setValidationMsg(null), 3000);
  }, [adapterName, selectedSocketIds, updateActiveCanvas, activeCanvas]);

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

  // Run the actual generation (after any overwrite confirmation).
  const runGenerate = useCallback(async () => {
    try {
      const result = await generateCode();
      if (result) {
        if (result.success) {
          setValidationMsg(
            `Generated ${result.files.length} files: ${result.files.join(", ")}`,
          );
          setTimeout(() => setValidationMsg(null), 8000);
        } else {
          notify({
            severity: "error",
            title: t("notif.codegen.failed.title"),
            message: result.errors.join("; "),
            hint: t("notif.codegen.failed.hint.generic"),
          });
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const isNode = /node\.js|needs node|ENOENT/i.test(msg);
      notify({
        severity: "error",
        title: t("notif.codegen.failed.title"),
        message: msg,
        hint: isNode
          ? t("notif.codegen.failed.hint.node")
          : t("notif.codegen.failed.hint.generic"),
      });
    }
  }, [generateCode]);

  // Pre-flight: if generated output already exists, ask before overwriting.
  const handleGenerate = useCallback(async () => {
    try {
      const existing = await invoke<string[]>(
        "patchboard_existing_generated_output",
        { projectRoot },
      );
      if (existing.length > 0) {
        setConfirmOverwrite(existing);
        return;
      }
    } catch {
      // If the check fails, fall through to generation (don't block).
    }
    await runGenerate();
  }, [projectRoot, runGenerate]);

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

      {/* Right panel: properties — swaps between Adapter / Wire panel
          based on the current selection. */}
      <div className="w-56 bg-bg-secondary border-l border-border shrink-0 overflow-auto">
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Properties
          </span>
        </div>
        <PropertiesBody />
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

      {/* Confirm overwrite of existing generated code */}
      {confirmOverwrite && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setConfirmOverwrite(null)}
        >
          <div
            className="glass-thick rounded-2xl w-[420px] p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-text-primary">
              已存在生成的代码
            </h3>
            <p className="text-xs text-text-muted">
              以下目录已经有生成的文件,重新生成会覆盖它们:
            </p>
            <ul className="text-xs text-text-secondary font-mono bg-bg-primary rounded p-2 flex flex-col gap-0.5">
              {confirmOverwrite.map((d) => (
                <li key={d}>· {d}/src</li>
              ))}
            </ul>
            <p className="text-[10px] text-text-muted">
              注:sockets / wiring 是工具拥有,本就每次覆盖;adapters
              是你拥有,已存在的文件不会被覆盖(只补缺失的)。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOverwrite(null)}
                className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setConfirmOverwrite(null);
                  await runGenerate();
                }}
                className="glass-button-primary px-4 py-2 text-sm rounded-lg font-medium transition-colors"
              >
                覆盖生成
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
          temperature={0.1}
          maxTokens={800}
          onAccept={async (text) => {
            const parsed = parseAdapterSuggestion(text);
            if (!parsed) {
              throw new Error(
                "AI 输出不是合法 JSON。请在预览区里改对(或重新生成):\n" +
                  "需要形如 {\"name\":\"PascalCase\",\"implementsSocketFullNames\":[\"...\"],...}",
              );
            }
            const name = parsed.name?.trim() ?? "";
            const ids = new Set<string>();
            if (Array.isArray(parsed.implementsSocketFullNames)) {
              for (const fullName of parsed.implementsSocketFullNames) {
                const match = socketOptions.find((s) => s.fullName === fullName);
                if (match) ids.add(match.id);
              }
            }
            if (!name) {
              throw new Error("AI 返回里 `name` 字段缺失或为空");
            }
            if (ids.size === 0) {
              throw new Error(
                `AI 返回的 implementsSocketFullNames 没有匹配到任何已存在的 Socket。\n` +
                  `当前 Registry 里有: ${socketOptions.map((s) => s.fullName).join(", ") || "(空)"}`,
              );
            }
            // Auto-commit: directly create the adapter on the canvas instead
            // of routing through the Add Adapter dialog. Faster + the user
            // already saw the AI's plan in the preview area.
            if (!activeCanvas) {
              throw new Error(
                "没有激活的 Canvas。先在 Canvases 标签页创建并选中一张画布,再用 AI 建议。",
              );
            }
            const newAdapter: AdapterNode = {
              id: `adapter-${Date.now()}`,
              name,
              implements: [...ids],
              constructorParams: [],
              position: {
                x: 200 + Math.random() * 200,
                y: 100 + Math.random() * 200,
              },
            };
            updateActiveCanvas((canvas) => ({
              ...canvas,
              adapters: [...canvas.adapters, newAdapter],
            }));
            setAdapterName("");
            setSelectedSocketIds(new Set());
            setShowAdapterAi(false);
            setShowAddAdapter(false);
            // Immediately persist + refresh list — bypass the 1s debounce
            // so the on-disk file and the left panel summary update right
            // away (otherwise the user sees a state-vs-disk mismatch).
            try {
              await usePatchboardStore.getState().saveActiveCanvas();
            } catch (e: any) {
              setValidationMsg(`⚠ 保存失败: ${e?.message ?? String(e)}`);
              setTimeout(() => setValidationMsg(null), 8000);
              return;
            }
            const after = usePatchboardStore.getState().activeCanvas;
            setValidationMsg(
              `✓ 已添加并保存 Adapter: ${name} (canvas 现共 ${after?.adapters.length ?? 0} 个 adapter)`,
            );
            setTimeout(() => setValidationMsg(null), 4000);
          }}
        />
      )}
    </div>
  );
}

// Swap Properties body based on selection: wire takes precedence over node
// (you can only have one selected at a time per the store, but be defensive).
function PropertiesBody() {
  const selectedEdgeId = usePatchboardStore((s) => s.selectedEdgeId);
  if (selectedEdgeId) return <WirePanel />;
  return <AdapterPanel />;
}
