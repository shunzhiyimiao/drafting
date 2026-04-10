import { useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useEditorStore } from "../../stores/editor-store";
import { useThemeStore } from "../../stores/theme-store";

// Use local monaco copies (bundled) instead of CDN
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.53.0/min/vs",
  },
});

const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  html: "html",
  rs: "rust",
  toml: "ini",
  yaml: "yaml",
  yml: "yaml",
};

function detectLanguage(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return languageMap[ext] ?? "plaintext";
}

export function MonacoPanel() {
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const tabs = useEditorStore((s) => s.tabs);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const saveTab = useEditorStore((s) => s.saveTab);
  const saveAll = useEditorStore((s) => s.saveAll);
  const themeVariant = useThemeStore((s) => s.variant);

  const activeTab = tabs.find((t) => t.path === activeTabPath);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // Re-apply theme when variant changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(`drafting-${themeVariant}`);
    }
  }, [themeVariant]);

  // Keyboard shortcuts: Cmd+S save, Cmd+Alt+S save all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (e.altKey) {
          saveAll();
        } else if (activeTabPath) {
          saveTab(activeTabPath);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTabPath, saveTab, saveAll]);

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Select a file from the file tree to edit.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {activeTab.identity.readonly && (
        <div className="px-3 py-1.5 text-[11px] bg-warning/10 border-b border-warning/30 text-warning">
          🔒 This file is tool-generated. Edit in Patchboard instead.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          value={activeTab.content}
          language={detectLanguage(activeTab.path)}
          theme={`drafting-${themeVariant}`}
          beforeMount={(monaco) => {
            monacoRef.current = monaco;

            // Dark variant
            monaco.editor.defineTheme("drafting-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#0a0b1300",
                "editor.foreground": "#e8ecf5",
                "editor.lineHighlightBackground": "#ffffff08",
                "editor.selectionBackground": "#a8c6ff33",
                "editorCursor.foreground": "#a8c6ff",
                "editorLineNumber.foreground": "#7d859e66",
                "editorLineNumber.activeForeground": "#b5bdd4",
                "editorIndentGuide.background": "#ffffff0a",
                "editorIndentGuide.activeBackground": "#ffffff1a",
                "editorWhitespace.foreground": "#ffffff14",
                "editor.selectionHighlightBackground": "#a8c6ff1a",
                "editor.wordHighlightBackground": "#ffffff0f",
                "editorBracketMatch.background": "#a8c6ff22",
                "editorBracketMatch.border": "#a8c6ff66",
                "scrollbarSlider.background": "#ffffff10",
                "scrollbarSlider.hoverBackground": "#ffffff20",
                "scrollbarSlider.activeBackground": "#ffffff30",
              },
            });

            // Light variant
            monaco.editor.defineTheme("drafting-light", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#ffffff00",
                "editor.foreground": "#1a2140",
                "editor.lineHighlightBackground": "#1a214008",
                "editor.selectionBackground": "#5b7cff33",
                "editorCursor.foreground": "#5b7cff",
                "editorLineNumber.foreground": "#8591ab80",
                "editorLineNumber.activeForeground": "#4a5577",
                "editorIndentGuide.background": "#1a214010",
                "editorIndentGuide.activeBackground": "#1a214022",
                "editor.selectionHighlightBackground": "#5b7cff1a",
                "editor.wordHighlightBackground": "#1a21400a",
                "editorBracketMatch.background": "#5b7cff22",
                "editorBracketMatch.border": "#5b7cff66",
                "scrollbarSlider.background": "#1a214018",
                "scrollbarSlider.hoverBackground": "#1a214028",
                "scrollbarSlider.activeBackground": "#1a214038",
              },
            });

            // Soft variant
            monaco.editor.defineTheme("drafting-soft", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#1e203000",
                "editor.foreground": "#e8e2f0",
                "editor.lineHighlightBackground": "#ffffff0a",
                "editor.selectionBackground": "#c9c0e433",
                "editorCursor.foreground": "#c9c0e4",
                "editorLineNumber.foreground": "#8a85a066",
                "editorLineNumber.activeForeground": "#c5bed4",
                "editorIndentGuide.background": "#ffffff0c",
                "editorIndentGuide.activeBackground": "#ffffff1a",
                "editorWhitespace.foreground": "#ffffff14",
                "editor.selectionHighlightBackground": "#c9c0e41a",
                "editor.wordHighlightBackground": "#ffffff0f",
                "editorBracketMatch.background": "#c9c0e422",
                "editorBracketMatch.border": "#c9c0e466",
                "scrollbarSlider.background": "#ffffff10",
                "scrollbarSlider.hoverBackground": "#ffffff20",
                "scrollbarSlider.activeBackground": "#ffffff30",
              },
            });

            monaco.editor.setTheme(`drafting-${themeVariant}`);
          }}
          onChange={(val) => {
            if (val !== undefined) {
              updateTabContent(activeTab.path, val);
            }
          }}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            readOnly: activeTab.identity.readonly,
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            renderWhitespace: "boundary",
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
          }}
        />
      </div>
    </div>
  );
}
