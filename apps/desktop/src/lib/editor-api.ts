import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AdvancedSearchResult,
  DirEntry,
  FileContent,
  FileIdentity,
  SearchOptions,
  SearchProgressPayload,
  SearchResult,
} from "../types/editor-types";

export async function listDir(
  projectRoot: string,
  relPath: string,
): Promise<DirEntry[]> {
  return invoke("editor_list_dir", { projectRoot, relPath });
}

export async function readFile(
  projectRoot: string,
  relPath: string,
): Promise<FileContent> {
  return invoke("editor_read_file", { projectRoot, relPath });
}

export async function writeFile(
  projectRoot: string,
  relPath: string,
  content: string,
): Promise<void> {
  return invoke("editor_write_file", { projectRoot, relPath, content });
}

export async function searchFiles(
  projectRoot: string,
  query: string,
  caseSensitive: boolean,
): Promise<SearchResult> {
  return invoke("editor_search", { projectRoot, query, caseSensitive });
}

export async function getFileIdentity(
  projectRoot: string,
  relPath: string,
): Promise<FileIdentity> {
  return invoke("editor_get_identity", { projectRoot, relPath });
}

// --- Advanced search --------------------------------------------------------

export async function searchAdvanced(
  projectRoot: string,
  options: SearchOptions,
): Promise<AdvancedSearchResult> {
  return invoke("editor_search_advanced", { projectRoot, options });
}

export async function cancelSearch(searchId: string): Promise<boolean> {
  return invoke("editor_cancel_search", { searchId });
}

export async function onSearchProgress(
  cb: (payload: SearchProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<SearchProgressPayload>("editor://search-progress", (e) =>
    cb(e.payload),
  );
}
