import { useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useEditorStore } from "../../stores/editor-store";

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

  const activeTab = tabs.find((t) => t.path === activeTabPath);
  const editorRef = useRef<any>(null);

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
          theme="vs-dark"
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
          }}
        />
      </div>
    </div>
  );
}
