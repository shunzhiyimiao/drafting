/**
 * TypeScript mirror of Rust Blueprint types.
 * Matches serde camelCase JSON output.
 */

export type BlueprintType = "feature" | "file";
export type BlueprintStatus =
  | "draft"
  | "in-progress"
  | "completed"
  | "deprecated";
export type BlueprintPriority = "low" | "medium" | "high" | "critical";
export type BlueprintOwner = "human" | "ai" | "collaborative";
export type CheckVerdict = "pass" | "fail" | "unclear";

export interface AcceptanceCriterion {
  /** Stable id (ULID), persisted in the Markdown as a `<!-- #ULID -->` marker
   *  on the Rust side. Optional here: criteria loaded from the backend always
   *  carry it, and edits must preserve it (spread the original object); newly
   *  added criteria omit it and the backend mints one on save. Keeping it on
   *  the type stops a structured-view save from silently dropping the id and
   *  forcing a re-mint (which would break per-criterion state addressing). */
  id?: string;
  text: string;
  checked: boolean;
}

export type SectionKind =
  | { kind: "goal" }
  | { kind: "context" }
  | { kind: "acceptanceCriteria" }
  | { kind: "constraints" }
  | { kind: "outOfScope" }
  | { kind: "notes" }
  | { kind: "purpose" }
  | { kind: "responsibilities" }
  | { kind: "unknown"; original: string };

export interface BlueprintSection {
  kind: SectionKind;
  headingText: string;
  content: string;
  criteria: AcceptanceCriterion[];
}

export interface RelatedBlueprint {
  id: string;
  relation: string;
}

export interface BlueprintFrontMatter {
  blueprintId: string;
  type: BlueprintType;
  displayName: string;
  status: BlueprintStatus;
  priority: BlueprintPriority;
  owner: BlueprintOwner;
  relatedSockets: string[];
  relatedAdapters: string[];
  relatedFiles: string[];
  relatedBlueprints: RelatedBlueprint[];
  tags: string[];
  lastCheckedAt?: number | null;
  lastCheckedBy?: string | null;
  checkVersion?: number | null;
  targetFile?: string | null;
  parentBlueprints: string[];
  extras?: Record<string, unknown>;
}

export interface Blueprint {
  frontMatter: BlueprintFrontMatter;
  sections: BlueprintSection[];
  rawMd: string;
}

export interface BlueprintIndexEntry {
  blueprintId: string;
  type: BlueprintType;
  displayName: string;
  status: BlueprintStatus;
  priority: BlueprintPriority;
  filePath: string;
  criteriaTotal: number;
  criteriaDone: number;
  updatedAt: number;
}

export interface BlueprintIndex {
  version: number;
  blueprints: BlueprintIndexEntry[];
}

export interface CheckResult {
  blueprintId: string;
  criterionIndex: number;
  verdict: CheckVerdict;
  explanation: string;
  suggestion?: string | null;
  references: string[];
  checkedAt: number;
  stale: boolean;
  blueprintHash: string;
  codeHash: string;
  modelId: string;
}

export interface TemplateInfo {
  name: string;
  displayName: string;
  description: string;
  type: BlueprintType;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
