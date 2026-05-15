// Monaco's full types live in `monaco-editor`, which isn't a direct dependency
// here (we only use @monaco-editor/react). Use loose typing throughout this
// file — the API surface we touch is small and stable.
type Monaco = any;
import {
  lspCompletion,
  lspDefinition,
  lspDidChange,
  lspDidClose,
  lspDidOpen,
  lspHover,
  onLspDiagnostics,
  type LspDiagnostic,
  type LspDiagnosticsPayload,
} from "../../lib/lsp-api";

const LSP_LANGS = new Set(["typescript", "javascript"]);

/** Map LSP CompletionItemKind to Monaco. They mostly align (1-based). */
function mapKind(monacoApi: Monaco, kind: number | undefined): number {
  const k = monacoApi.languages.CompletionItemKind;
  switch (kind) {
    case 1:
      return k.Text;
    case 2:
      return k.Method;
    case 3:
      return k.Function;
    case 4:
      return k.Constructor;
    case 5:
      return k.Field;
    case 6:
      return k.Variable;
    case 7:
      return k.Class;
    case 8:
      return k.Interface;
    case 9:
      return k.Module;
    case 10:
      return k.Property;
    case 14:
      return k.Keyword;
    case 21:
      return k.Constant;
    default:
      return k.Text;
  }
}

function mapSeverity(monacoApi: Monaco, severity: number | undefined): number {
  const s = monacoApi.MarkerSeverity;
  switch (severity) {
    case 1:
      return s.Error;
    case 2:
      return s.Warning;
    case 3:
      return s.Info;
    case 4:
      return s.Hint;
    default:
      return s.Info;
  }
}

interface BridgeOptions {
  projectRoot: string;
  /** Resolve current file's project-relative path (may change as user switches tabs). */
  getActivePath: () => string | null;
  /** Resolve current file's text (for didChange / didOpen sync). */
  getActiveText: () => string | null;
}

/**
 * Wires Monaco to the Drafting LSP backend. Returns a dispose function.
 *
 * Responsibilities:
 *   - Diagnostics listener: pushes markers into Monaco models keyed by URI.
 *   - Providers: completion, hover, definition for ts/js languages.
 *
 * didOpen/didChange/didClose are driven externally (see openDocument/changeDocument/closeDocument).
 */
export function installLspBridge(
  monacoApi: Monaco,
  options: BridgeOptions,
): () => void {
  const disposables: Array<{ dispose: () => void }> = [];
  let diagnosticsUnlisten: (() => void) | null = null;

  // --- Diagnostics ----------------------------------------------------------
  onLspDiagnostics((payload) => applyDiagnostics(monacoApi, payload)).then(
    (unlisten) => {
      diagnosticsUnlisten = unlisten;
    },
  );

  // --- Completion -----------------------------------------------------------
  for (const lang of LSP_LANGS) {
    disposables.push(
      monacoApi.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: [".", "/", "@", "<", '"', "'", "`", " "],
        provideCompletionItems: async (model: any, position: any) => {
          const relPath = options.getActivePath();
          if (!relPath) return { suggestions: [] };
          try {
            const items = await lspCompletion(
              options.projectRoot,
              relPath,
              position.lineNumber - 1,
              position.column - 1,
            );
            const word = model.getWordUntilPosition(position);
            const range = new monacoApi.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn,
            );
            const suggestions = items.map((item) => ({
                label: item.label,
                kind: mapKind(monacoApi, item.kind),
                insertText: item.insertText ?? item.label,
                detail: item.detail,
                documentation: item.documentation,
                sortText: item.sortText,
                filterText: item.filterText,
                range,
              }),
            );
            return { suggestions };
          } catch (e) {
            console.warn("LSP completion failed", e);
            return { suggestions: [] };
          }
        },
      }),
    );

    // --- Hover --------------------------------------------------------------
    disposables.push(
      monacoApi.languages.registerHoverProvider(lang, {
        provideHover: async (_model: any, position: any) => {
          const relPath = options.getActivePath();
          if (!relPath) return null;
          try {
            const hover = await lspHover(
              options.projectRoot,
              relPath,
              position.lineNumber - 1,
              position.column - 1,
            );
            if (!hover || !hover.contents) return null;
            return {
              contents: [{ value: hover.contents }],
              range: hover.range
                ? new monacoApi.Range(
                    hover.range.start.line + 1,
                    hover.range.start.character + 1,
                    hover.range.end.line + 1,
                    hover.range.end.character + 1,
                  )
                : undefined,
            };
          } catch (e) {
            console.warn("LSP hover failed", e);
            return null;
          }
        },
      }),
    );

    // --- Definition ---------------------------------------------------------
    disposables.push(
      monacoApi.languages.registerDefinitionProvider(lang, {
        provideDefinition: async (_model: any, position: any) => {
          const relPath = options.getActivePath();
          if (!relPath) return null;
          try {
            const locs = await lspDefinition(
              options.projectRoot,
              relPath,
              position.lineNumber - 1,
              position.column - 1,
            );
            if (!locs.length) return null;
            return locs.map((loc) => ({
              uri: monacoApi.Uri.parse(loc.uri),
              range: new monacoApi.Range(
                loc.range.start.line + 1,
                loc.range.start.character + 1,
                loc.range.end.line + 1,
                loc.range.end.character + 1,
              ),
            }));
          } catch (e) {
            console.warn("LSP definition failed", e);
            return null;
          }
        },
      }),
    );
  }

  return () => {
    diagnosticsUnlisten?.();
    for (const d of disposables) d.dispose();
  };
}

function applyDiagnostics(monacoApi: Monaco, payload: LspDiagnosticsPayload) {
  const models = monacoApi.editor.getModels();
  // Match by URI exactly first, then by suffix path (handles file:// vs different roots).
  let model = models.find((m: any) => m.uri.toString() === payload.uri);
  if (!model) {
    const tail = payload.uri.replace(/^file:\/\//, "");
    model = models.find(
      (m: any) =>
        m.uri.toString().endsWith(tail) || tail.endsWith(m.uri.path),
    );
  }
  if (!model) return;

  const markers = payload.diagnostics.map((d: LspDiagnostic) => ({
    severity: mapSeverity(monacoApi, d.severity),
    message: d.message,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    source: d.source,
  }));

  monacoApi.editor.setModelMarkers(model, "drafting-lsp", markers);
}

// --- Document lifecycle ------------------------------------------------------

const versions = new Map<string, number>();

function nextVersion(key: string): number {
  const v = (versions.get(key) ?? 0) + 1;
  versions.set(key, v);
  return v;
}

export async function openDocument(
  projectRoot: string,
  relPath: string,
  text: string,
): Promise<void> {
  const version = nextVersion(`${projectRoot}::${relPath}`);
  try {
    await lspDidOpen(projectRoot, relPath, text, version);
  } catch (e) {
    console.warn("lsp_did_open failed", e);
  }
}

export async function changeDocument(
  projectRoot: string,
  relPath: string,
  text: string,
): Promise<void> {
  const version = nextVersion(`${projectRoot}::${relPath}`);
  try {
    await lspDidChange(projectRoot, relPath, text, version);
  } catch (e) {
    console.warn("lsp_did_change failed", e);
  }
}

export async function closeDocument(
  projectRoot: string,
  relPath: string,
): Promise<void> {
  versions.delete(`${projectRoot}::${relPath}`);
  try {
    await lspDidClose(projectRoot, relPath);
  } catch (e) {
    console.warn("lsp_did_close failed", e);
  }
}
