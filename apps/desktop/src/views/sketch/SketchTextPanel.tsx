import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { nodeAtOffset, useSketchStore } from "../../stores/sketch-store";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { defineDraftingThemes } from "../../lib/monaco-themes";

/**
 * The primary editing surface (Rev 4 §7, text-as-truth): the `.sketch`
 * document itself. Typing edits it directly; every structured surface
 * (Inspector, tree ops, drag) routes back INTO this buffer via
 * `registerBuffer` + executeEdits — so ⌘Z is one stack for everything.
 *
 * Dialect errors surface as inline markers (MarkupError carries line/col);
 * the status bar states validity/canonical-form/error position; Format is
 * the canonical printer.
 */
export function SketchTextPanel() {
  const text = useSketchStore((s) => s.text);
  const parsed = useSketchStore((s) => s.parsed);
  const parseError = useSketchStore((s) => s.parseError);
  const canonical = useSketchStore((s) => s.canonical);
  const activeFile = useSketchStore((s) => s.activeFile);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);
  const selectionSource = useSketchStore((s) => s.selectionSource);
  const setTextFromBuffer = useSketchStore((s) => s.setTextFromBuffer);
  const registerBuffer = useSketchStore((s) => s.registerBuffer);
  const format = useSketchStore((s) => s.format);
  const selectNode = useSketchStore((s) => s.selectNode);
  const themeVariant = useThemeStore((s) => s.variant);
  const appearance = useSettingsStore((s) => s.appearance);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  /** Suppresses cursor→canvas sync while WE move the cursor (reveal). */
  const revealingRef = useRef(false);

  // Wire the store's buffer surface to THIS Monaco instance.
  useEffect(() => {
    const writer = (newText: string) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      // One undo unit per structured edit, on the same stack as typing.
      editor.pushUndoStop();
      editor.executeEdits("sketch-structured-edit", [
        { range: model.getFullModelRange(), text: newText },
      ]);
      editor.pushUndoStop();
    };
    const revealer = (range: { start: number; end: number }) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const pos = model.getPositionAt(range.start);
      revealingRef.current = true;
      editor.setPosition(pos);
      editor.revealPositionInCenterIfOutsideViewport(pos);
      revealingRef.current = false;
    };
    return registerBuffer(writer, revealer);
  }, [registerBuffer]);

  // Dialect errors → inline markers.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "sketch-dialect",
      parseError
        ? [
            {
              startLineNumber: parseError.line,
              startColumn: parseError.col,
              endLineNumber: parseError.line,
              endColumn: parseError.col + 1,
              message: parseError.message,
              severity: monaco.MarkerSeverity.Error,
            },
          ]
        : [],
    );
  }, [parseError, text]);

  // Canvas/outline selection → highlight the node's source (decoration).
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection();
    const range = selectedNodeId ? parsed?.ranges[selectedNodeId] : undefined;
    if (!range) {
      decorationsRef.current.clear();
      return;
    }
    const start = model.getPositionAt(range.start);
    const end = model.getPositionAt(range.end);
    decorationsRef.current.set([
      {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: { className: "sketch-node-highlight", isWholeLine: false },
      },
    ]);
    if (selectionSource === "canvas") {
      revealingRef.current = true;
      editor.revealRangeInCenterIfOutsideViewport(
        new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
      );
      revealingRef.current = false;
    }
  }, [selectedNodeId, selectionSource, parsed]);

  const fileName = activeFile?.split("/").pop() ?? "";

  return (
    <div className="flex flex-col min-h-0 h-full">
      <style>{`.sketch-node-highlight { background: rgba(91, 124, 255, 0.14); border-radius: 2px; }`}</style>
      <div className="flex-1 min-h-0 glass-panel overflow-hidden">
        <Editor
          value={text}
          language="xml"
          theme={`drafting-${themeVariant}`}
          beforeMount={(m) => {
            defineDraftingThemes(m);
          }}
          onMount={(editor) => {
            editorRef.current = editor;
            editor.onDidChangeCursorPosition((e) => {
              if (revealingRef.current) return;
              // Only user-driven cursor moves sync to the canvas.
              if (e.source === "api") return;
              const model = editor.getModel();
              const p = useSketchStore.getState().parsed;
              if (!model || !p) return;
              const offset = model.getOffsetAt(e.position);
              const id = nodeAtOffset(p, offset);
              if (id && id !== useSketchStore.getState().selectedNodeId) {
                selectNode(id, "text");
              }
            });
          }}
          onChange={(val) => {
            if (val !== undefined) setTextFromBuffer(val);
          }}
          options={{
            fontFamily: appearance.fontFamily,
            fontSize: appearance.fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "off",
            lineNumbers: "on",
            padding: { top: 8, bottom: 8 },
            renderWhitespace: "none",
          }}
        />
      </div>
      {/* Status bar: validity · canonical form · error position · Format. */}
      <div className="flex items-center gap-3 px-2 py-1 text-[10px] shrink-0">
        <span className="text-text-muted">{fileName}</span>
        {parseError ? (
          <span className="text-error">
            ✗ {parseError.line}:{parseError.col} {parseError.message}
          </span>
        ) : canonical ? (
          <span className="text-success">✓ 规范形式</span>
        ) : (
          <span className="text-warning">✓ 有效 · 未规范化</span>
        )}
        <span className="flex-1" />
        <button
          onClick={format}
          disabled={!!parseError || canonical}
          className="text-accent hover:text-accent-hover disabled:opacity-40"
          title="规范打印（Format）"
        >
          Format
        </button>
      </div>
    </div>
  );
}
