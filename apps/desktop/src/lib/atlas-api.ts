import { invoke } from "@tauri-apps/api/core";
import type { FileMap } from "../types/atlas-types";

export async function parseFile(
  projectRoot: string,
  relPath: string,
): Promise<FileMap> {
  return invoke("atlas_parse_file", { projectRoot, relPath });
}

// ---------------------------------------------------------------------------
// Atlas 测绘 (B-spade) — mirrors atlas/survey.rs + the report-card commands.
// ---------------------------------------------------------------------------

export interface TraitImpl {
  traitName: string;
  typeName: string;
}

export interface RouteEntry {
  method: string;
  path: string;
  handler: string;
}

export interface CrateSurvey {
  name: string;
  manifestDir: string;
  deps: string[];
  pubFns: string[];
  pubStructs: string[];
  pubTraits: string[];
  traitImpls: TraitImpl[];
  routes: RouteEntry[];
}

export interface TsEdge {
  from: string;
  to: string;
}

export interface TsPackage {
  name: string;
  dir: string;
  deps: string[];
  fileCount: number;
  internalEdges: TsEdge[];
  externalImports: string[];
}

export interface AtlasMap {
  version: number;
  generatedAtMs: number;
  rust: { members: CrateSurvey[] } | null;
  ts: { packages: TsPackage[] } | null;
  warnings: string[];
}

export interface AtlasHealth {
  gate: "passed" | "failed" | "unavailable";
  gateDiagnostics: string[];
  tests: { testedModules: number; failedModules: string[] } | null;
}

export interface AtlasObservability {
  totalCriteria: number;
  boundCriteria: number;
  checkedCriteria: number;
  neverCheckedRatio: number;
}

export async function surveyRead(projectRoot: string): Promise<AtlasMap | null> {
  return invoke("atlas_survey_read", { projectRoot });
}

export async function surveyRebuild(projectRoot: string): Promise<AtlasMap> {
  return invoke("atlas_survey_rebuild", { projectRoot });
}

export async function surveyHealth(projectRoot: string): Promise<AtlasHealth> {
  return invoke("atlas_health", { projectRoot });
}

export async function surveyObservability(projectRoot: string): Promise<AtlasObservability> {
  return invoke("atlas_observability", { projectRoot });
}
