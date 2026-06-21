import { invoke } from "@tauri-apps/api/core";
import type {
  Blueprint,
  BlueprintFrontMatter,
  BlueprintIndex,
  BlueprintSection,
  CheckResult,
  Estimate,
  TemplateInfo,
  ValidationResult,
} from "../types/blueprint-types";

// Initialization
export async function blueprintInit(projectRoot: string): Promise<void> {
  return invoke("blueprint_init", { projectRoot });
}

// CRUD
export async function listBlueprints(
  projectRoot: string,
): Promise<BlueprintIndex> {
  return invoke("blueprint_list", { projectRoot });
}

export async function getBlueprint(
  projectRoot: string,
  blueprintId: string,
): Promise<Blueprint> {
  return invoke("blueprint_get", { projectRoot, blueprintId });
}

export async function getBlueprintRaw(
  projectRoot: string,
  blueprintId: string,
): Promise<string> {
  return invoke("blueprint_get_raw", { projectRoot, blueprintId });
}

export async function createBlueprint(
  projectRoot: string,
  rawMd: string,
): Promise<Blueprint> {
  return invoke("blueprint_create", { projectRoot, rawMd });
}

export async function createFromTemplate(
  projectRoot: string,
  templateName: string,
  variables: Record<string, unknown>,
): Promise<Blueprint> {
  return invoke("blueprint_create_from_template", {
    projectRoot,
    templateName,
    variables,
  });
}

export async function updateBlueprint(
  projectRoot: string,
  blueprintId: string,
  rawMd: string,
): Promise<Blueprint> {
  return invoke("blueprint_update", { projectRoot, blueprintId, rawMd });
}

export async function updateBlueprintStructured(
  projectRoot: string,
  blueprintId: string,
  frontMatter: BlueprintFrontMatter,
  sections: BlueprintSection[],
): Promise<Blueprint> {
  return invoke("blueprint_update_structured", {
    projectRoot,
    blueprintId,
    frontMatter,
    sections,
  });
}

export async function deleteBlueprint(
  projectRoot: string,
  blueprintId: string,
): Promise<void> {
  return invoke("blueprint_delete", { projectRoot, blueprintId });
}

export async function toggleCriterion(
  projectRoot: string,
  blueprintId: string,
  criterionIndex: number,
  checked: boolean,
): Promise<Blueprint> {
  return invoke("blueprint_toggle_criterion", {
    projectRoot,
    blueprintId,
    criterionIndex,
    checked,
  });
}

// Templates
export async function listTemplates(): Promise<TemplateInfo[]> {
  return invoke("blueprint_list_templates");
}

export async function previewTemplate(
  templateName: string,
  variables: Record<string, unknown>,
): Promise<string> {
  return invoke("blueprint_preview_template", { templateName, variables });
}

// Check framework
export async function lightweightCheck(
  projectRoot: string,
  blueprintId: string,
): Promise<ValidationResult> {
  return invoke("blueprint_lightweight_check", { projectRoot, blueprintId });
}

export async function requestCheck(
  projectRoot: string,
  blueprintId: string,
): Promise<void> {
  return invoke("blueprint_request_check", { projectRoot, blueprintId });
}

export async function getCheckResults(
  projectRoot: string,
  blueprintId: string,
): Promise<CheckResult[]> {
  return invoke("blueprint_get_check_results", { projectRoot, blueprintId });
}

export async function getEstimates(
  projectRoot: string,
  blueprintId: string,
): Promise<Estimate[]> {
  return invoke("blueprint_get_estimates", { projectRoot, blueprintId });
}

export async function rebuildIndex(
  projectRoot: string,
): Promise<BlueprintIndex> {
  return invoke("blueprint_rebuild_index", { projectRoot });
}
