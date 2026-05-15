import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspCompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface LspHover {
  contents: string;
  range?: LspRange;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDiagnostic {
  range: LspRange;
  message: string;
  severity?: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  source?: string;
  code?: unknown;
}

export interface LspDiagnosticsPayload {
  uri: string;
  diagnostics: LspDiagnostic[];
}

export async function lspDidOpen(
  projectRoot: string,
  relPath: string,
  text: string,
  version: number,
): Promise<boolean> {
  return invoke("lsp_did_open", { projectRoot, relPath, text, version });
}

export async function lspDidChange(
  projectRoot: string,
  relPath: string,
  text: string,
  version: number,
): Promise<boolean> {
  return invoke("lsp_did_change", { projectRoot, relPath, text, version });
}

export async function lspDidClose(
  projectRoot: string,
  relPath: string,
): Promise<boolean> {
  return invoke("lsp_did_close", { projectRoot, relPath });
}

export async function lspCompletion(
  projectRoot: string,
  relPath: string,
  line: number,
  character: number,
): Promise<LspCompletionItem[]> {
  return invoke("lsp_completion", { projectRoot, relPath, line, character });
}

export async function lspHover(
  projectRoot: string,
  relPath: string,
  line: number,
  character: number,
): Promise<LspHover | null> {
  return invoke("lsp_hover", { projectRoot, relPath, line, character });
}

export async function lspDefinition(
  projectRoot: string,
  relPath: string,
  line: number,
  character: number,
): Promise<LspLocation[]> {
  return invoke("lsp_definition", { projectRoot, relPath, line, character });
}

export async function lspReferences(
  projectRoot: string,
  relPath: string,
  line: number,
  character: number,
  includeDeclaration = false,
): Promise<LspLocation[]> {
  return invoke("lsp_references", {
    projectRoot,
    relPath,
    line,
    character,
    includeDeclaration,
  });
}

export async function onLspDiagnostics(
  cb: (payload: LspDiagnosticsPayload) => void,
): Promise<UnlistenFn> {
  return listen<LspDiagnosticsPayload>("lsp-diagnostics", (e) => cb(e.payload));
}
