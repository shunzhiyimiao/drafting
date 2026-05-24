import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Sparkles } from "lucide-react";
import { usePatchboardStore } from "../../../stores/patchboard-store";
import { AiGenerateDialog } from "../../../components/AiGenerateDialog";
import type {
  SocketMethod,
  MethodParam,
  CreateSocketInput,
} from "../../../types/patchboard-types";
import { useT } from "../../../lib/i18n";

const SOCKET_SUGGEST_SYSTEM_PROMPT = `You are designing a TypeScript Socket (interface) for the Drafting Patchboard architecture system. A Socket defines a contract that one or more Adapters can implement.

# OUTPUT FORMAT — STRICT

Your ENTIRE response MUST be a single JSON object.
- The VERY FIRST character of your response MUST be \`{\` (left brace).
- The VERY LAST character of your response MUST be \`}\` (right brace).
- No markdown, no code fences, no prose, no explanation before or after.
- No "Here is..." preamble. No trailing notes. Nothing but the JSON object.

If you cannot satisfy these constraints, output the literal string \`{}\` and nothing else.

# JSON SCHEMA

{
  "fullName": "<namespace.PascalCaseName, e.g. llm.LlmProvider>",
  "displayName": "<human-readable name, 4-30 chars>",
  "methods": [
    {
      "name": "<camelCase>",
      "params": [
        {"name": "<camelCase>", "paramType": "<TS type>", "optional": false}
      ],
      "returnType": "<TS type, usually Promise<T>>"
    }
  ]
}

# CONTENT RULES

- 1 to 5 methods (single responsibility — don't kitchen-sink it).
- Use async-friendly return types: \`Promise<T>\` by default.
- TS type strings can include generics like \`Promise<string[]>\`, \`Map<K,V>\`, union types like \`string | null\`.
- \`fullName\` MUST be \`namespace.PascalCaseName\` (lowercase namespace, PascalCase class name).
- Do NOT include any keys beyond the schema above. No "description", no "id", no metadata.
- All quotes MUST be double-quotes ("). All commas MUST be ASCII commas (,). All colons MUST be ASCII colons (:). Never use Chinese or smart-quote punctuation.

# REMINDER

Re-read your response before finishing. Confirm:
1. First character is \`{\`.
2. Last character is \`}\`.
3. The object parses with \`JSON.parse\` in standard JavaScript.

If any check fails, fix it before stopping.`;

interface SocketSuggestion {
  fullName?: string;
  displayName?: string;
  methods?: SocketMethod[];
}

function parseSocketSuggestion(raw: string): SocketSuggestion | null {
  // Try multiple recovery strategies in order, from cheapest to most aggressive.
  const attempts: string[] = [];

  let s = raw.trim();
  // 1. Strip ```json / ``` outer fence
  s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  attempts.push(s);

  // 2. Extract the substring from first `{` to last `}` (handles preamble/trailing prose)
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    attempts.push(s.slice(first, last + 1));
  }

  // 2b. AI sometimes drops the leading `{`. If the content starts with a
  //     `"key":` pattern but has a closing `}`, wrap it back.
  if (/^\s*"[\w-]+"\s*:/.test(s) && s.lastIndexOf("}") > 0) {
    attempts.push(`{${s.slice(0, s.lastIndexOf("}") + 1)}`);
  }
  // 2c. Or symmetric: starts with `{` but no closing `}`.
  if (s.startsWith("{") && !s.includes("}")) {
    attempts.push(`${s}}`);
  }

  // 3. As a last resort, fold Chinese punctuation that's a common LLM slip
  //    (e.g. fullName:"Foo", → fullName:"Foo",). Only apply to the extracted block.
  if (first >= 0 && last > first) {
    const cn = s
      .slice(first, last + 1)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/,/g, ",")
      .replace(/:/g, ":");
    attempts.push(cn);
  }

  for (const a of attempts) {
    try {
      const parsed = JSON.parse(a);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as SocketSuggestion;
      }
    } catch {
      // try next attempt
    }
  }
  return null;
}

interface SocketEditorProps {
  socketId: string | null; // null = create mode
  onClose: () => void;
}

export function SocketEditor({ socketId, onClose }: SocketEditorProps) {
  const t = useT();
  const createSocket = usePatchboardStore((s) => s.createSocket);
  const updateSocket = usePatchboardStore((s) => s.updateSocket);
  const getSocket = usePatchboardStore((s) => s.getSocket);

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [methods, setMethods] = useState<SocketMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAiSuggest, setShowAiSuggest] = useState(false);
  const projectRoot = usePatchboardStore((s) => s.projectRoot ?? "");

  useEffect(() => {
    if (socketId) {
      getSocket(socketId).then((s) => {
        setFullName(s.fullName);
        setDisplayName(s.displayName);
        setMethods(s.methods);
      });
    }
  }, [socketId, getSocket]);

  const addMethod = () => {
    setMethods([
      ...methods,
      { name: "", params: [], returnType: "void" },
    ]);
  };

  const removeMethod = (idx: number) => {
    setMethods(methods.filter((_, i) => i !== idx));
  };

  const updateMethod = (idx: number, patch: Partial<SocketMethod>) => {
    setMethods(
      methods.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
  };

  const addParam = (methodIdx: number) => {
    const method = methods[methodIdx];
    updateMethod(methodIdx, {
      params: [
        ...method.params,
        { name: "", paramType: "string", optional: false },
      ],
    });
  };

  const updateParam = (
    methodIdx: number,
    paramIdx: number,
    patch: Partial<MethodParam>,
  ) => {
    const method = methods[methodIdx];
    const newParams = method.params.map((p, i) =>
      i === paramIdx ? { ...p, ...patch } : p,
    );
    updateMethod(methodIdx, { params: newParams });
  };

  const removeParam = (methodIdx: number, paramIdx: number) => {
    const method = methods[methodIdx];
    updateMethod(methodIdx, {
      params: method.params.filter((_, i) => i !== paramIdx),
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!fullName.trim()) {
      setSaveError("Full Name 不能为空(例:llm.LlmProvider)");
      return;
    }
    if (!displayName.trim()) {
      setSaveError("Display Name 不能为空");
      return;
    }
    setLoading(true);
    try {
      if (socketId) {
        await updateSocket({
          id: socketId,
          fullName,
          displayName,
          methods,
        });
      } else {
        const input: CreateSocketInput = {
          fullName,
          displayName,
          extends: [],
          methods,
        };
        await createSocket(input);
      }
      onClose();
    } catch (e: any) {
      setSaveError(`保存失败: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-xs font-medium text-text-secondary">
          {socketId ? "Edit Socket" : "New Socket"}
        </span>
        {!socketId && (
          <button
            onClick={() => setShowAiSuggest(true)}
            disabled={!projectRoot}
            className="ml-auto text-[10px] text-accent hover:text-accent/80 disabled:opacity-40 inline-flex items-center gap-1"
            title={t("patchboard.ai.suggestSocketTitle")}
          >
            <Sparkles size={11} />
            {t("patchboard.ai.suggestSocketButton")}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Full Name
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("patchboard.fullNamePlaceholder")}
            className="w-full mt-0.5 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Display Name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("patchboard.displayNamePlaceholder")}
            className="w-full mt-0.5 px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-text-muted">
              Methods
            </label>
            <button
              onClick={addMethod}
              className="text-text-muted hover:text-text-secondary"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {methods.map((method, mi) => (
              <div
                key={mi}
                className="border border-border rounded p-2 bg-bg-primary"
              >
                <div className="flex items-center gap-1">
                  <input
                    value={method.name}
                    onChange={(e) =>
                      updateMethod(mi, { name: e.target.value })
                    }
                    placeholder={t("patchboard.methodNamePlaceholder")}
                    className="flex-1 px-1.5 py-0.5 text-[11px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                  />
                  <span className="text-[10px] text-text-muted">→</span>
                  <input
                    value={method.returnType}
                    onChange={(e) =>
                      updateMethod(mi, { returnType: e.target.value })
                    }
                    placeholder={t("patchboard.returnTypePlaceholder")}
                    className="w-20 px-1.5 py-0.5 text-[11px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => removeMethod(mi)}
                    className="text-text-muted hover:text-error"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
                {/* Params */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {method.params.map((param, pi) => (
                    <div key={pi} className="flex items-center gap-1 ml-2">
                      <input
                        value={param.name}
                        onChange={(e) =>
                          updateParam(mi, pi, { name: e.target.value })
                        }
                        placeholder={t("patchboard.paramPlaceholder")}
                        className="w-16 px-1 py-0.5 text-[10px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                      />
                      <span className="text-[10px] text-text-muted">:</span>
                      <input
                        value={param.paramType}
                        onChange={(e) =>
                          updateParam(mi, pi, {
                            paramType: e.target.value,
                          })
                        }
                        placeholder={t("patchboard.typePlaceholder")}
                        className="w-16 px-1 py-0.5 text-[10px] bg-transparent border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                      />
                      <button
                        onClick={() => removeParam(mi, pi)}
                        className="text-text-muted hover:text-error"
                      >
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addParam(mi)}
                    className="ml-2 text-[10px] text-text-muted hover:text-text-secondary"
                  >
                    + param
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border flex flex-col gap-1">
        {saveError && (
          <p className="text-[11px] text-error break-words">{saveError}</p>
        )}
        <button
          onClick={handleSave}
          disabled={loading || !fullName || !displayName}
          className="w-full glass-button-primary px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? "Saving..." : socketId ? "Update" : "Create"}
        </button>
      </div>

      {showAiSuggest && (
        <AiGenerateDialog
          open
          onClose={() => setShowAiSuggest(false)}
          title={t("patchboard.ai.suggestSocketTitle")}
          taskId="patchboardSuggestSocket"
          projectRoot={projectRoot}
          systemPrompt={SOCKET_SUGGEST_SYSTEM_PROMPT}
          userPromptBuilder={(desc) =>
            `Design a Socket for the following capability.\n\nDescription:\n${desc}\n\nOutput the JSON object now.`
          }
          inputLabel={t("patchboard.ai.suggestSocketInputLabel")}
          inputPlaceholder={t("patchboard.ai.suggestSocketInputPlaceholder")}
          temperature={0.1}
          maxTokens={1200}
          onAccept={(text) => {
            const parsed = parseSocketSuggestion(text);
            if (!parsed) {
              throw new Error(
                "AI 输出不是合法 JSON,请在预览区里调整(或重新生成):\n" +
                  "需要形如 {\"fullName\":\"namespace.Name\",\"displayName\":\"...\",\"methods\":[...]}",
              );
            }
            const hasAnyField =
              parsed.fullName ||
              parsed.displayName ||
              (Array.isArray(parsed.methods) && parsed.methods.length > 0);
            if (!hasAnyField) {
              throw new Error(
                "JSON 解析成功但没有任何有用字段(fullName/displayName/methods 都为空)",
              );
            }
            if (parsed.fullName) setFullName(parsed.fullName);
            if (parsed.displayName) setDisplayName(parsed.displayName);
            if (Array.isArray(parsed.methods)) {
              setMethods(
                parsed.methods.map((m) => ({
                  name: m.name ?? "",
                  params: Array.isArray(m.params)
                    ? m.params.map((p: any) => ({
                        name: p.name ?? "",
                        paramType: p.paramType ?? "any",
                        optional: !!p.optional,
                      }))
                    : [],
                  returnType: m.returnType ?? "void",
                })),
              );
            }
            setShowAiSuggest(false);
          }}
        />
      )}
    </div>
  );
}
