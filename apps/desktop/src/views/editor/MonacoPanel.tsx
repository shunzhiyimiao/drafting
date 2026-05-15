import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useEditorStore } from "../../stores/editor-store";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useT } from "../../lib/i18n";
import {
  changeDocument,
  closeDocument,
  installLspBridge,
  openDocument,
} from "./lsp-bridge";

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

const LSP_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "cts",
  "mjs",
  "cjs",
]);

function isLspEligible(path: string): boolean {
  const ext = path.split(".").pop() ?? "";
  return LSP_EXTS.has(ext);
}

export function MonacoPanel() {
  const t = useT();
  const projectRoot = useEditorStore((s) => s.projectRoot);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const tabs = useEditorStore((s) => s.tabs);
  const updateTabContent = useEditorStore((s) => s.updateTabContent);
  const saveTab = useEditorStore((s) => s.saveTab);
  const saveAll = useEditorStore((s) => s.saveAll);
  const themeVariant = useThemeStore((s) => s.variant);
  const appearance = useSettingsStore((s) => s.appearance);

  const activeTab = tabs.find((t) => t.path === activeTabPath);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const [monacoReady, setMonacoReady] = useState(false);
  // Tracks which (project, path) pairs have been didOpen-ed so we don't double-open.
  const openedDocsRef = useRef<Set<string>>(new Set());
  // Debounce timer for didChange.
  const changeTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Latest known active path / text, for LSP providers (avoid stale closures).
  const activePathRef = useRef<string | null>(null);
  const activeTextRef = useRef<string | null>(null);
  const lspBridgeDisposeRef = useRef<(() => void) | null>(null);

  activePathRef.current = activeTabPath;
  activeTextRef.current = activeTab?.content ?? null;

  // Install LSP bridge once monaco is ready and projectRoot is known.
  useEffect(() => {
    if (!monacoReady || !monacoRef.current || !projectRoot) return;
    if (lspBridgeDisposeRef.current) return;
    lspBridgeDisposeRef.current = installLspBridge(monacoRef.current, {
      projectRoot,
      getActivePath: () => activePathRef.current,
      getActiveText: () => activeTextRef.current,
    });
    return () => {
      lspBridgeDisposeRef.current?.();
      lspBridgeDisposeRef.current = null;
    };
  }, [projectRoot, monacoReady]);

  // didOpen when a new LSP-eligible tab becomes active.
  useEffect(() => {
    if (!projectRoot || !activeTab) return;
    if (!isLspEligible(activeTab.path)) return;
    const key = `${projectRoot}::${activeTab.path}`;
    if (openedDocsRef.current.has(key)) return;
    openedDocsRef.current.add(key);
    void openDocument(projectRoot, activeTab.path, activeTab.content);
  }, [projectRoot, activeTab?.path]);

  // didChange (debounced) when content changes.
  useEffect(() => {
    if (!projectRoot || !activeTab) return;
    if (!isLspEligible(activeTab.path)) return;
    const key = `${projectRoot}::${activeTab.path}`;
    if (!openedDocsRef.current.has(key)) return; // wait until didOpen fired

    const timers = changeTimerRef.current;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      void changeDocument(projectRoot, activeTab.path, activeTab.content);
      timers.delete(key);
    }, 300);
    timers.set(key, t);
  }, [projectRoot, activeTab?.path, activeTab?.content]);

  // didClose for tabs that disappear.
  useEffect(() => {
    if (!projectRoot) return;
    const liveKeys = new Set(
      tabs
        .filter((t) => isLspEligible(t.path))
        .map((t) => `${projectRoot}::${t.path}`),
    );
    for (const key of Array.from(openedDocsRef.current)) {
      if (!liveKeys.has(key)) {
        openedDocsRef.current.delete(key);
        const relPath = key.slice(projectRoot.length + 2);
        void closeDocument(projectRoot, relPath);
      }
    }
  }, [projectRoot, tabs]);

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
        {t("editor.selectFile")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {activeTab.identity.readonly && (
        <div className="px-3 py-1.5 text-[11px] bg-warning/10 border-b border-warning/30 text-warning">
          {t("editor.toolGenerated")}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Editor
          value={activeTab.content}
          language={detectLanguage(activeTab.path)}
          theme={`drafting-${themeVariant}`}
          beforeMount={(monaco) => {
            monacoRef.current = monaco;
            setMonacoReady(true);

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

            // Blossom variant (rose pink)
            monaco.editor.defineTheme("drafting-blossom", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#ffdee700",
                "editor.foreground": "#4a1929",
                "editor.lineHighlightBackground": "#4a192908",
                "editor.selectionBackground": "#d6477233",
                "editorCursor.foreground": "#d64772",
                "editorLineNumber.foreground": "#a8607a80",
                "editorLineNumber.activeForeground": "#7c3248",
                "editorIndentGuide.background": "#4a192910",
                "editorIndentGuide.activeBackground": "#4a192922",
                "editor.selectionHighlightBackground": "#d647721a",
                "editor.wordHighlightBackground": "#4a19290a",
                "editorBracketMatch.background": "#d6477222",
                "editorBracketMatch.border": "#d6477266",
                "scrollbarSlider.background": "#4a192918",
                "scrollbarSlider.hoverBackground": "#4a192928",
                "scrollbarSlider.activeBackground": "#4a192938",
              },
            });

            // Mist variant (lavender blue)
            monaco.editor.defineTheme("drafting-mist", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#c5cef900",
                "editor.foreground": "#1a2457",
                "editor.lineHighlightBackground": "#1a245708",
                "editor.selectionBackground": "#4a60d833",
                "editorCursor.foreground": "#4a60d8",
                "editorLineNumber.foreground": "#6b75a880",
                "editorLineNumber.activeForeground": "#3a4780",
                "editorIndentGuide.background": "#1a245710",
                "editorIndentGuide.activeBackground": "#1a245722",
                "editor.selectionHighlightBackground": "#4a60d81a",
                "editor.wordHighlightBackground": "#1a24570a",
                "editorBracketMatch.background": "#4a60d822",
                "editorBracketMatch.border": "#4a60d866",
                "scrollbarSlider.background": "#1a245718",
                "scrollbarSlider.hoverBackground": "#1a245728",
                "scrollbarSlider.activeBackground": "#1a245738",
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
            fontFamily: appearance.fontFamily,
            fontSize: appearance.fontSize,
            minimap: { enabled: appearance.editorMinimap },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: appearance.editorTabSize,
            wordWrap: appearance.editorWordWrap ? "on" : "off",
            lineNumbers: appearance.editorLineNumbers ? "on" : "off",
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
