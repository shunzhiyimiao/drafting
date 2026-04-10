import { invoke } from "@tauri-apps/api/core";
import type { FileMap } from "../types/atlas-types";

export async function parseFile(
  projectRoot: string,
  relPath: string,
): Promise<FileMap> {
  return invoke("atlas_parse_file", { projectRoot, relPath });
}
