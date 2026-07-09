import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { useEditorStore } from "../../stores/editor-store";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useT } from "../../lib/i18n";
import { defineDraftingThemes } from "../../lib/monaco-themes";
import {
  changeDocument,
  closeDocument,
  installLspBridge,
  openDocument,
} from "./lsp-bridge";

// Load Monaco from the bundled local package + local web workers — never a CDN.
// A CDN loader hangs forever as "Loading..." when offline, behind a firewall, or
// in regions where jsdelivr is blocked; a desktop app must ship Monaco locally.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment =
  {
    getWorker(_workerId: string, label: string) {
      switch (label) {
        case "json":
          return new jsonWorker();
        case "css":
        case "scss":
        case "less":
          return new cssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new htmlWorker();
        case "typescript":
        case "javascript":
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
loader.config({ monaco });

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

            // ts/js diagnostics come exclusively from the LSP bridge
            // (typescript-language-server reads the real tsconfig on disk).
            // Monaco's built-in TS worker only sees in-memory models, so it
            // flags every cross-file import (e.g. "@myapp/sockets") as
            // unresolvable — silence it to avoid false-positive squiggles.
            const tsDiagnosticsOff = {
              noSemanticValidation: true,
              noSyntaxValidation: true,
              noSuggestionDiagnostics: true,
            };
            monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions(
              tsDiagnosticsOff,
            );
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions(
              tsDiagnosticsOff,
            );
            defineDraftingThemes(monaco);

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
