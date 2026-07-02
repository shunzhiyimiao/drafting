import { invoke } from "@tauri-apps/api/core";
import type { Sketch } from "@drafting/sketch-core";

/** Tauri command wrappers for the Sketch backend. The Rust serde mirror is
 *  isomorphic to sketch-core's Spec types, so the shared package's types are
 *  used directly — no hand-written mirror to drift. */

export async function listSketches(projectRoot: string): Promise<Sketch[]> {
  return invoke("sketch_list", { projectRoot });
}

export async function getSketch(projectRoot: string, sketchId: string): Promise<Sketch> {
  return invoke("sketch_get", { projectRoot, sketchId });
}

export async function createSketch(
  projectRoot: string,
  name: string,
  blueprintRef: string | null,
): Promise<Sketch> {
  return invoke("sketch_create", { projectRoot, name, blueprintRef });
}

/** Saves, rebuilds the index, and publishes FileSaved — which drives both
 *  the codegen pipeline (§8 debounced regeneration) and criterion
 *  stale/drift for sketch-bound criteria. */
export async function saveSketch(projectRoot: string, sketch: Sketch): Promise<void> {
  return invoke("sketch_save", { projectRoot, sketch });
}

/** Deletes the sketch and its tool-owned generated half; the user-owned
 *  sibling stays, and bound criteria go dangling (§6 — signal, not cascade). */
export async function deleteSketch(projectRoot: string, sketchId: string): Promise<void> {
  return invoke("sketch_delete", { projectRoot, sketchId });
}
