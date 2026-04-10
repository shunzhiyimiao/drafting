import { invoke } from "@tauri-apps/api/core";
import type {
  DirEntry,
  FileContent,
  FileIdentity,
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
