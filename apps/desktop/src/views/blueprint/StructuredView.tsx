import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { AcceptanceCriteriaEditor } from "./AcceptanceCriteriaEditor";
import { AiGenerateDialog } from "../../components/AiGenerateDialog";
import { Dropdown } from "../../components/Dropdown";
import { subscribeSyncBus } from "../../lib/sync-bus";
import type {
  Blueprint,
  BlueprintSection,
  BlueprintStatus,
  BlueprintPriority,
  AcceptanceCriterion,
} from "../../types/blueprint-types";
import { useT } from "../../lib/i18n";

const CRITERIA_SYSTEM_PROMPT = `You are helping a software engineer write acceptance criteria for a feature.

Given the feature Goal, propose 3 to 5 acceptance criteria. Each must be:
- Concrete and verifiable (no fuzzy words like "fast", "robust", "user-friendly")
- A single observable behavior (no compound criteria joined by "and")
- Testable by an automated test or manual procedure

Output one criterion per line. No numbering, no bullets, no preamble — just the criteria text.`;

function parseCriteriaList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        // strip leading bullets / numbers / markers
        .replace(/^[-*•·]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/^\[\s?\]\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 2);
}

export function StructuredView() {
  const t = useT();
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const updateStructured = useBlueprintStore((s) => s.updateStructured);
  const toggleCriterion = useBlueprintStore((s) => s.toggleCriterion);
  const projectRoot = useBlueprintStore((s) => s.projectRoot ?? "");
  const estimatesByBp = useBlueprintStore((s) => s.estimates);
  const loadEstimates = useBlueprintStore((s) => s.loadEstimates);
  const estimates = activeBlueprint
    ? estimatesByBp[activeBlueprint.frontMatter.blueprintId]
    : undefined;

  // S6: live-refresh the feedback surface when this blueprint's verdicts drift
  // (S5) or a check completes — so badges re-render without a manual reload.
  const activeId = activeBlueprint?.frontMatter.blueprintId;
  useEffect(() => {
    if (!activeId) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void subscribeSyncBus((env) => {
      const p = env.payload as
        | { domain?: string; event?: { type?: string; data?: { feature_id?: string } } }
        | undefined;
      if (p?.domain !== "Blueprint") return;
      const t = p.event?.type;
      if (t !== "DriftDetected" && t !== "CheckCompleted") return;
      if (p.event?.data?.feature_id === activeId) void loadEstimates(activeId);
    }).then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeId, loadEstimates]);
  const [criteriaAiSectionIdx, setCriteriaAiSectionIdx] = useState<number | null>(null);

  const saveChanges = useCallback(
    (updated: Blueprint) => {
      updateStructured(
        updated.frontMatter.blueprintId,
        updated.frontMatter,
        updated.sections,
      );
    },
    [updateStructured],
  );

  if (!activeBlueprint) return null;

  const fm = activeBlueprint.frontMatter;

  const updateField = <K extends keyof typeof fm>(
    key: K,
    value: (typeof fm)[K],
  ) => {
    saveChanges({
      ...activeBlueprint,
      frontMatter: { ...fm, [key]: value },
    });
  };

  const updateSection = (idx: number, patch: Partial<BlueprintSection>) => {
    const newSections = activeBlueprint.sections.map((s, i) =>
      i === idx ? { ...s, ...patch } : s,
    );
    saveChanges({ ...activeBlueprint, sections: newSections });
  };

  const handleCriteriaChange = (
    sectionIdx: number,
    newCriteria: AcceptanceCriterion[],
  ) => {
    updateSection(sectionIdx, { criteria: newCriteria });
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {/* Front matter */}
        <div className="bg-bg-secondary rounded-lg border border-border p-4">
          <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-3">
            Metadata
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display Name">
              <input
                value={fm.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
                className="w-full px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
              />
            </Field>
            <Field label="Status">
              <Dropdown
                className="w-full"
                value={fm.status}
                options={["draft", "in-progress", "completed", "deprecated"].map(
                  (v) => ({ value: v, label: v }),
                )}
                onChange={(v) => updateField("status", v as BlueprintStatus)}
              />
            </Field>
            <Field label="Priority">
              <Dropdown
                className="w-full"
                value={fm.priority}
                options={["low", "medium", "high", "critical"].map((v) => ({
                  value: v,
                  label: v,
                }))}
                onChange={(v) => updateField("priority", v as BlueprintPriority)}
              />
            </Field>
            <Field label="Owner">
              <Dropdown
                className="w-full"
                value={fm.owner}
                options={["human", "ai", "collaborative"].map((v) => ({
                  value: v,
                  label: v,
                }))}
                onChange={(v) => updateField("owner", v as typeof fm.owner)}
              />
            </Field>
            <Field label="Tags">
              <input
                value={fm.tags.join(", ")}
                onChange={(e) =>
                  updateField(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  )
                }
                placeholder={t("blueprint.tagsPlaceholder")}
                className="w-full px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
              />
            </Field>
            {fm.type === "file" && (
              <Field label="Target File">
                <input
                  value={fm.targetFile ?? ""}
                  onChange={(e) => updateField("targetFile", e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none"
                />
              </Field>
            )}
          </div>
        </div>

        {/* Sections */}
        {activeBlueprint.sections.map((section, idx) => (
          <div
            key={idx}
            className="bg-bg-secondary rounded-lg border border-border p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">
                {section.headingText}
              </h3>
              {section.kind.kind === "acceptanceCriteria" && (
                <button
                  onClick={() => setCriteriaAiSectionIdx(idx)}
                  disabled={!projectRoot}
                  className="text-[10px] text-accent hover:text-accent/80 disabled:opacity-40 inline-flex items-center gap-1"
                  title={t("blueprint.ai.suggestCriteriaTitle")}
                >
                  <Sparkles size={11} />
                  {t("blueprint.ai.suggestCriteriaButton")}
                </button>
              )}
            </div>
            {section.kind.kind === "acceptanceCriteria" ? (
              <AcceptanceCriteriaEditor
                criteria={section.criteria}
                estimates={estimates}
                onToggle={(ci, checked) => {
                  toggleCriterion(fm.blueprintId, ci, checked);
                }}
                onAdd={() => {
                  const newCriteria = [
                    ...section.criteria,
                    { text: "New criterion", checked: false },
                  ];
                  handleCriteriaChange(idx, newCriteria);
                }}
                onRemove={(ci) => {
                  const newCriteria = section.criteria.filter(
                    (_, i) => i !== ci,
                  );
                  handleCriteriaChange(idx, newCriteria);
                }}
                onTextChange={(ci, text) => {
                  const newCriteria = section.criteria.map((c, i) =>
                    i === ci ? { ...c, text } : c,
                  );
                  handleCriteriaChange(idx, newCriteria);
                }}
              />
            ) : (
              <textarea
                value={section.content}
                onChange={(e) =>
                  updateSection(idx, { content: e.target.value })
                }
                className="w-full min-h-[80px] px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary focus:border-accent focus:outline-none resize-vertical"
              />
            )}
          </div>
        ))}
      </div>

      {criteriaAiSectionIdx !== null && (
        <AiGenerateDialog
          open
          onClose={() => setCriteriaAiSectionIdx(null)}
          title={t("blueprint.ai.suggestCriteriaTitle")}
          taskId="blueprintSuggestCriteria"
          projectRoot={projectRoot}
          systemPrompt={CRITERIA_SYSTEM_PROMPT}
          userPromptBuilder={(goal) =>
            `Feature: ${activeBlueprint.frontMatter.displayName}\n\nGoal:\n${goal}\n\nGenerate the acceptance criteria now.`
          }
          inputLabel={t("blueprint.ai.suggestCriteriaInputLabel")}
          inputPlaceholder={t("blueprint.ai.suggestCriteriaInputPlaceholder")}
          initialInput={
            activeBlueprint.sections.find((s) => s.kind.kind === "goal")
              ?.content ?? ""
          }
          temperature={0.4}
          maxTokens={800}
          onAccept={(text) => {
            const items = parseCriteriaList(text);
            if (items.length === 0) {
              setCriteriaAiSectionIdx(null);
              return;
            }
            const sectionIdx = criteriaAiSectionIdx;
            const section = activeBlueprint.sections[sectionIdx];
            if (!section) return;
            const newCriteria = [
              ...section.criteria,
              ...items.map((text) => ({ text, checked: false })),
            ];
            handleCriteriaChange(sectionIdx, newCriteria);
            setCriteriaAiSectionIdx(null);
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
