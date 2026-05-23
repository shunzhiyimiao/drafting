import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { BlueprintListPanel } from "./BlueprintListPanel";
import { BlueprintToolbar } from "./BlueprintToolbar";
import { RawMdView } from "./RawMdView";
import { StructuredView } from "./StructuredView";
import { TemplatePickerDialog } from "./TemplatePickerDialog";
import { AiGenerateDialog } from "../../components/AiGenerateDialog";
import { createBlueprint } from "../../lib/blueprint-api";
import { getProjectRoot } from "../../lib/app-bootstrap";
import { useT } from "../../lib/i18n";

const DRAFT_SYSTEM_PROMPT = `You are helping a software engineer draft a feature Blueprint in Markdown.

The Blueprint MUST be a single Markdown file with this exact structure:

\`\`\`
---
type: feature
displayName: <inferred from description>
status: draft
priority: medium
owner: collaborative
---

# Goal

<one or two paragraphs describing what this feature does and why>

# Context

<background, who uses this, related systems>

# Acceptance Criteria

- [ ] <concrete verifiable criterion 1>
- [ ] <concrete verifiable criterion 2>
- [ ] <criterion 3>
- [ ] <criterion 4 if relevant>

# Constraints

<technical/business constraints>

# Out of Scope

<what this feature explicitly does NOT do>
\`\`\`

Rules:
- Output ONLY the markdown content, including the YAML front matter delimiters. No prose, no code fences around the whole thing, no explanation.
- Do NOT invent a blueprintId — the tool will assign it.
- Acceptance criteria must be concrete and testable.
- Keep the language matching the user's description (Chinese description → Chinese content).`;

export function BlueprintView() {
  const t = useT();
  const initialized = useBlueprintStore((s) => s.initialized);
  const initialize = useBlueprintStore((s) => s.initialize);
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const viewMode = useBlueprintStore((s) => s.viewMode);
  const deleteBlueprint = useBlueprintStore((s) => s.deleteBlueprint);
  const lightweightCheck = useBlueprintStore((s) => s.lightweightCheck);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [projectRoot, setProjectRoot] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint);
  const refreshIndex = useBlueprintStore((s) => s.refreshIndex);

  useEffect(() => {
    getProjectRoot().then((root) => {
      setProjectRoot(root);
      if (!initialized) initialize(root);
    });
  }, [initialized, initialize]);

  const handleCheck = useCallback(async () => {
    if (!activeBlueprint) return;
    const result = await lightweightCheck(activeBlueprint.frontMatter.blueprintId);
    if (result.valid) {
      setStatusMsg(
        result.warnings.length > 0
          ? `Valid. Warnings: ${result.warnings.join("; ")}`
          : "Blueprint is valid.",
      );
    } else {
      setStatusMsg(`Errors: ${result.errors.join("; ")}`);
    }
    setTimeout(() => setStatusMsg(null), 5000);
  }, [activeBlueprint, lightweightCheck]);

  const handleDelete = useCallback(async () => {
    if (!activeBlueprint) return;
    if (
      confirm(
        `Delete blueprint "${activeBlueprint.frontMatter.displayName}"?`,
      )
    ) {
      await deleteBlueprint(activeBlueprint.frontMatter.blueprintId);
    }
  }, [activeBlueprint, deleteBlueprint]);

  return (
    <div className="flex h-full">
      <div className="w-56 bg-bg-secondary border-r border-border flex flex-col shrink-0">
        <BlueprintListPanel
          onNewBlueprint={() => setShowTemplatePicker(true)}
          onAiDraft={() => setShowAiDraft(true)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {activeBlueprint ? (
          <>
            <BlueprintToolbar onCheck={handleCheck} onDelete={handleDelete} />
            {statusMsg && (
              <div className="px-3 py-1.5 text-xs bg-bg-hover border-b border-border text-text-secondary">
                {statusMsg}
              </div>
            )}
            {viewMode === "structured" ? <StructuredView /> : <RawMdView />}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-sm text-text-secondary mb-3">
              No blueprint selected
            </p>
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl glass-button-primary"
              title={t("blueprint.createFromTemplate")}
            >
              <Plus size={20} />
            </button>
          </div>
        )}
      </div>

      {showTemplatePicker && (
        <TemplatePickerDialog onClose={() => setShowTemplatePicker(false)} />
      )}

      {showAiDraft && (
        <AiGenerateDialog
          open
          onClose={() => setShowAiDraft(false)}
          title={t("blueprint.ai.draftTitle")}
          taskId="blueprintDraft"
          projectRoot={projectRoot}
          systemPrompt={DRAFT_SYSTEM_PROMPT}
          userPromptBuilder={(desc) =>
            `Draft a Blueprint for the following feature.\n\nDescription:\n${desc}`
          }
          inputLabel={t("blueprint.ai.draftInputLabel")}
          inputPlaceholder={t("blueprint.ai.draftInputPlaceholder")}
          temperature={0.5}
          maxTokens={2000}
          onAccept={async (text) => {
            try {
              // Strip a possible outer ```markdown ... ``` fence
              const cleaned = stripOuterFence(text);
              const created = await createBlueprint(projectRoot, cleaned);
              await refreshIndex();
              await loadBlueprint(created.frontMatter.blueprintId);
              setShowAiDraft(false);
            } catch (e: any) {
              setStatusMsg(`AI draft failed: ${e?.message ?? String(e)}`);
              setTimeout(() => setStatusMsg(null), 5000);
            }
          }}
        />
      )}
    </div>
  );
}

function stripOuterFence(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1].trim() : trimmed;
}
