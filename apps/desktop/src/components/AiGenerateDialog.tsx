import { useEffect, useRef, useState } from "react";
import { Sparkles, Square, X } from "lucide-react";
import {
  cancelStream,
  onStreamEvent,
  streamChat,
} from "../lib/ai-api";
import type { ChatMessage, TaskId } from "../types/ai-types";
import { useT } from "../lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Modal title */
  title: string;
  /** AI task id — backend routes this to the right model via Settings */
  taskId: TaskId;
  /** Project root (passed to streamChat) */
  projectRoot: string;
  /** System prompt sent to the model */
  systemPrompt: string;
  /** Builds the user message from the textarea content */
  userPromptBuilder: (input: string) => string;
  /** Label above the input textarea */
  inputLabel: string;
  inputPlaceholder: string;
  /** Initial value in the input textarea (e.g. pre-filled Goal) */
  initialInput?: string;
  /** Called when user clicks Accept. Receives the (possibly user-edited)
   * output text and the original input. May return a Promise; if it
   * throws, the error is shown in the dialog (stays open for re-tries). */
  onAccept: (text: string, input: string) => void | Promise<void>;
  /** Optional: override temperature (default 0.3) */
  temperature?: number;
  /** Optional: override max tokens (default 2000) */
  maxTokens?: number;
  /** Optional: button label for Accept (defaults to t("ai.accept")) */
  acceptLabel?: string;
}

/**
 * Generic modal for one-shot AI generation features. Used by:
 * - Blueprint AI draft
 * - Blueprint AI suggest criteria
 * - Patchboard AI suggest Socket
 * - Patchboard AI suggest Adapter
 *
 * Pattern: user types a description → clicks Generate → AI streams response
 * into a read-only preview → user clicks Accept which fires onAccept(text).
 */
export function AiGenerateDialog({
  open,
  onClose,
  title,
  taskId,
  projectRoot,
  systemPrompt,
  userPromptBuilder,
  inputLabel,
  inputPlaceholder,
  initialInput = "",
  onAccept,
  temperature = 0.3,
  maxTokens = 2000,
  acceptLabel,
}: Props) {
  const t = useT();
  const [input, setInput] = useState(initialInput);
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setInput(initialInput);
      setOutput("");
      setError(null);
      setStreaming(false);
      streamIdRef.current = null;
    }
  }, [open, initialInput]);

  const handleGenerate = async () => {
    if (!projectRoot) {
      setError(t("ai.noProject"));
      return;
    }
    if (!input.trim()) {
      setError(t("ai.emptyInput"));
      return;
    }
    setError(null);
    setOutput("");
    setStreaming(true);

    const messages: ChatMessage[] = [
      { role: "user", content: userPromptBuilder(input) },
    ];

    let ownStreamId: string | null = null;
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await onStreamEvent((ev) => {
        if (!ownStreamId) return;
        if ("streamId" in ev && ev.streamId !== ownStreamId) return;
        switch (ev.type) {
          case "delta":
            setOutput((prev) => prev + ev.text);
            break;
          case "completed":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            streamIdRef.current = null;
            break;
          case "cancelled":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            streamIdRef.current = null;
            break;
          case "failed":
            unlisten?.();
            unlisten = null;
            setStreaming(false);
            setError(ev.error);
            streamIdRef.current = null;
            break;
        }
      });

      ownStreamId = await streamChat(projectRoot, taskId, {
        model: "",
        system: systemPrompt,
        messages,
        temperature,
        maxTokens,
      });
      streamIdRef.current = ownStreamId;
    } catch (e: any) {
      unlisten?.();
      setStreaming(false);
      setError(e?.message ?? String(e));
      streamIdRef.current = null;
    }
  };

  const handleStop = async () => {
    if (streamIdRef.current) {
      await cancelStream(streamIdRef.current);
    }
  };

  const [accepting, setAccepting] = useState(false);
  const handleAccept = async () => {
    if (!output.trim() || accepting) return;
    setError(null);
    setAccepting(true);
    try {
      await onAccept(output, input);
    } catch (e: any) {
      setError(`Accept failed: ${e?.message ?? String(e)}`);
    } finally {
      setAccepting(false);
    }
  };

  const handleClose = () => {
    if (streamIdRef.current) {
      void cancelStream(streamIdRef.current);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="glass-thick rounded-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">{title}</span>
          </div>
          <button
            onClick={handleClose}
            className="text-text-muted hover:text-text-secondary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-text-muted">
              {inputLabel}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              rows={3}
              disabled={streaming}
              autoFocus
              className="w-full mt-1 px-2 py-1.5 text-sm bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none resize-none"
            />
          </div>

          {(output || streaming) && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-text-muted">
                  {t("ai.preview")}
                  {!streaming && (
                    <span className="ml-2 text-[10px] normal-case text-text-muted/70">
                      {t("ai.previewEditable")}
                    </span>
                  )}
                </label>
                {streaming && (
                  <span className="text-[10px] text-accent inline-flex items-center gap-1">
                    <span className="inline-block w-1.5 h-3 bg-accent animate-pulse" />
                    {t("ai.streaming")}
                  </span>
                )}
              </div>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                readOnly={streaming}
                spellCheck={false}
                className="w-full mt-1 px-2 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary font-mono resize-y min-h-[180px] max-h-[40vh] focus:border-accent focus:outline-none"
                style={{ whiteSpace: "pre-wrap" }}
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-error break-words">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-white/5">
          {streaming ? (
            <button
              onClick={handleStop}
              className="glass-button px-4 py-2 text-sm rounded-lg inline-flex items-center gap-1.5"
            >
              <Square size={12} />
              {t("ai.stop")}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!input.trim() || !projectRoot}
              className="glass-button px-4 py-2 text-sm rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Sparkles size={12} />
              {output ? t("ai.regenerate") : t("ai.generate")}
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="glass-button px-4 py-2 text-sm rounded-lg transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleAccept}
              disabled={!output.trim() || streaming || accepting}
              className="glass-button-primary px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {accepting ? t("ai.applying") : (acceptLabel ?? t("ai.accept"))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
