import { useState, useRef } from "react";
import { GitCommit, Sparkles, Square } from "lucide-react";
import { getStagedDiffPatch } from "../../lib/git-api";
import {
  cancelStream,
  onStreamEvent,
  streamChat,
} from "../../lib/ai-api";
import type { ChatMessage } from "../../types/ai-types";
import { useEditorStore } from "../../stores/editor-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { useT } from "../../lib/i18n";

// A stable empty-array reference so the Zustand selector below returns the
// same snapshot every render even when the store doesn't (yet) have a
// `features` field. Without this, React throws
// "getSnapshot should be cached" and hits the infinite-loop guard.
const EMPTY_FEATURES: unknown[] = [];

interface Props {
  stagedCount: number;
  onCommit: (message: string) => Promise<void>;
}

const SYSTEM_PROMPT = `You write Git commit messages.

Rules:
- Use the Conventional Commits format: <type>(<scope>): <subject>
- Types: feat, fix, chore, docs, refactor, perf, test, build, ci, style, revert
- Subject is imperative, present tense, no trailing period, <= 72 characters
- If the change is non-trivial, add a blank line then a short body explaining WHY (not what — the diff shows what)
- Output ONLY the commit message. No preamble, no "Here is a commit message:", no code fences.`;

export function CommitBox({ stagedCount, onCommit }: Props) {
  const t = useT();
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const featureBlueprints = useBlueprintStore(
    (s) => ((s as any).features as unknown[] | undefined) ?? EMPTY_FEATURES,
  );

  const activeStreamIdRef = useRef<string | null>(null);

  const handleGenerate = async () => {
    if (!projectRoot) {
      setError(t("git.commit.noProject"));
      return;
    }
    setError(null);
    setStreaming(true);
    setMessage("");

    let diff = "";
    try {
      diff = await getStagedDiffPatch(projectRoot, 60_000);
    } catch (e: any) {
      setError(t("git.commit.diffFailed", { error: e?.message ?? String(e) }));
      setStreaming(false);
      return;
    }

    if (!diff.trim()) {
      setError(t("git.commit.noStaged"));
      setStreaming(false);
      return;
    }

    // Optional: include a short summary of in-progress feature Blueprints so
    // the model can reflect their intent. Cheap signal, easy to ignore if
    // empty.
    const blueprintContext = summarizeBlueprints(featureBlueprints);

    const userMessage = [
      "Generate a commit message for the following staged diff.",
      blueprintContext
        ? `\nRelevant in-progress Blueprints:\n${blueprintContext}`
        : "",
      "\n--- STAGED DIFF ---\n",
      diff,
    ].join("");

    const messages: ChatMessage[] = [{ role: "user", content: userMessage }];

    let ownStreamId: string | null = null;
    let unlisten: (() => void) | null = null;

    try {
      unlisten = await onStreamEvent((ev) => {
        if (!ownStreamId) return;
        if ("streamId" in ev && ev.streamId !== ownStreamId) return;
        switch (ev.type) {
          case "delta":
            setMessage((prev) => prev + ev.text);
            break;
          case "completed":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            activeStreamIdRef.current = null;
            break;
          case "cancelled":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            activeStreamIdRef.current = null;
            break;
          case "failed":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            setError(ev.error);
            activeStreamIdRef.current = null;
            break;
          case "started":
            // Already have the stream id from streamChat return value; ignore.
            break;
        }
      });

      ownStreamId = await streamChat(projectRoot, "gitCommitMessage", {
        model: "",
        system: SYSTEM_PROMPT,
        messages,
        temperature: 0.3,
        maxTokens: 512,
      });
      activeStreamIdRef.current = ownStreamId;
    } catch (e: any) {
      unlisten?.();
      setStreaming(false);
      setError(e?.message ?? String(e));
      activeStreamIdRef.current = null;
    }
  };

  const handleStop = async () => {
    if (activeStreamIdRef.current) {
      await cancelStream(activeStreamIdRef.current).catch(() => {});
    }
  };

  const handleCommit = async () => {
    if (!message.trim()) return;
    await onCommit(message.trim());
    setMessage("");
  };

  return (
    <div className="glass-panel p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {t("git.commit.title")}
        </span>
        {streaming ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-1 text-[10px] text-warning hover:text-warning/80"
            title={t("git.commit.stopTip")}
          >
            <Square size={10} />
            {t("git.commit.stop")}
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={stagedCount === 0 || !projectRoot}
            className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              stagedCount === 0
                ? t("git.commit.stageFirst")
                : t("git.commit.aiTip")
            }
          >
            <Sparkles size={10} />
            {t("git.commit.aiGenerate")}
          </button>
        )}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          streaming ? t("git.commit.generating") : t("git.commit.placeholder")
        }
        rows={4}
        disabled={streaming}
        className="w-full text-xs px-2 py-1.5 rounded resize-none mb-1 font-mono"
      />
      {error && (
        <p className="text-[10px] text-error mb-1 break-words">{error}</p>
      )}
      <button
        onClick={handleCommit}
        disabled={!message.trim() || stagedCount === 0 || streaming}
        className="glass-button-primary w-full py-1.5 text-xs rounded-lg font-medium disabled:opacity-40"
      >
        <GitCommit size={11} className="inline mr-1" />
        {t("git.commit.button", { count: stagedCount })}
      </button>
    </div>
  );
}

/** Compact summary of in-progress features for the AI prompt. */
function summarizeBlueprints(features: any[]): string {
  if (!Array.isArray(features) || features.length === 0) return "";
  return features
    .filter((f) => f?.status === "in-progress" || f?.status === "draft")
    .slice(0, 3)
    .map((f) => {
      const name = f.displayName ?? f.blueprintId ?? "feature";
      const goal = (f.goal ?? "").trim().slice(0, 180);
      return goal ? `- ${name}: ${goal}` : `- ${name}`;
    })
    .filter((l) => l.length > 0)
    .join("\n");
}
