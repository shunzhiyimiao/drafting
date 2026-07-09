import { invoke } from "@tauri-apps/api/core";

/** Tauri command wrappers for the Sketch backend (Rev 4, text-as-truth).
 *  The `.sketch` TEXT is the document: Rust stores bytes and keeps the
 *  derived index; the frontend parses/prints with sketch-core itself, so no
 *  Spec tree crosses this boundary — only entity metadata and text. */

export interface SketchMeta {
  /** Project-relative file, e.g. "sketches/inbox.sketch". */
  file: string;
  id: string;
  name: string;
  blueprintRef: string | null;
}

export interface SketchMigrationReport {
  migrated: string[];
  skipped: string[];
  failed: { file: string; reason: string }[];
}

export async function listSketches(projectRoot: string): Promise<SketchMeta[]> {
  return invoke("sketch_list_meta", { projectRoot });
}

export async function readSketchText(projectRoot: string, file: string): Promise<string> {
  return invoke("sketch_read", { projectRoot, file });
}

/** Persists the text, rebuilds the index and publishes FileSaved — which
 *  drives both the debounced codegen pipeline (§8) and criterion
 *  stale/drift for sketch-bound criteria. */
export async function saveSketchText(
  projectRoot: string,
  file: string,
  text: string,
): Promise<void> {
  return invoke("sketch_save_text", { projectRoot, file, text });
}

export async function createSketch(
  projectRoot: string,
  name: string,
  blueprintRef: string | null,
): Promise<SketchMeta> {
  return invoke("sketch_create", { projectRoot, name, blueprintRef });
}

/** Deletes the sketch and its tool-owned generated half; the user-owned
 *  sibling stays, and bound criteria go dangling (§6 — signal, not cascade). */
export async function deleteSketch(projectRoot: string, sketchId: string): Promise<void> {
  return invoke("sketch_delete", { projectRoot, sketchId });
}
