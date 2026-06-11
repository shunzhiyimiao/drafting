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

const DRAFT_SYSTEM_PROMPT = `You are drafting a feature Blueprint as a Markdown file for the Drafting IDE.

You MUST output a complete document that contains:
  1. A YAML front matter block (between two \`---\` lines)
  2. Five non-empty body sections: "# Goal", "# Context", "# Acceptance Criteria", "# Constraints", "# Out of Scope"

The YAML front matter MUST contain at minimum these keys (omit blueprintId, the tool assigns it):
  type: feature
  displayName: <a short name, 4-20 chars, inferred from description>
  status: draft
  priority: medium
  owner: collaborative

Each body section MUST have substantive content:
  - "# Goal": 1-2 paragraphs explaining what this feature does and why it matters.
  - "# Context": background, who uses it, what existing systems it touches.
  - "# Acceptance Criteria": a GFM task list with 3-6 items, EACH item written as a concrete observable behavior testable by hand or by automation. Use the syntax \`- [ ] <criterion>\`.
  - "# Constraints": technical, business, or scope constraints. At least 2 bullets.
  - "# Out of Scope": what this feature explicitly does NOT do. At least 2 bullets.

Hard rules:
  - Output ONLY the markdown document. NO surrounding prose, NO code fences around the whole document, NO commentary.
  - Stopping after the YAML closing \`---\` is FAILURE. You must continue with the body sections.
  - Keep the natural language matching the user's description (Chinese description → Chinese body; English description → English body).
  - Do not invent a blueprintId.

A minimal valid example (in English; mirror this skeleton with real content):

---
type: feature
displayName: Email Subscription
status: draft
priority: medium
owner: collaborative
---

# Goal

Provide users with a way to subscribe to product newsletters by email...

# Context

The marketing team needs an opt-in pipeline that integrates with...

# Acceptance Criteria

- [ ] User can submit an email address and receive a confirmation email within 60 seconds.
- [ ] Clicking the confirmation link marks the subscription as active.
- [ ] Submitting an already-subscribed email returns a clear "already subscribed" message instead of duplicating.

# Constraints

- Must comply with GDPR double-opt-in.
- Confirmation emails sent through the existing SendGrid pool.

# Out of Scope

- Designing the email template (handled by marketing).
- Subscriber segmentation logic.`;

export function BlueprintView() {
  const t = useT();
  const initialize = useBlueprintStore((s) => s.initialize);
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const viewMode = useBlueprintStore((s) => s.viewMode);
  const deleteBlueprint = useBlueprintStore((s) => s.deleteBlueprint);
  const lightweightCheck = useBlueprintStore((s) => s.lightweightCheck);
  const requestCheck = useBlueprintStore((s) => s.requestCheck);
  const [aiChecking, setAiChecking] = useState(false);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [projectRoot, setProjectRoot] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const refreshIndex = useBlueprintStore((s) => s.refreshIndex);

  useEffect(() => {
    getProjectRoot().then((root) => {
      setProjectRoot(root);
      // Always call initialize so a stale projectRoot in the store (e.g. from
      // an earlier workspace before a switch) gets overwritten with the
      // current one. The store's initialize is idempotent-safe.
      initialize(root);
    });
  }, [initialize]);

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

  const handleAiCheck = useCallback(async () => {
    if (!activeBlueprint || aiChecking) return;
    setAiChecking(true);
    setStatusMsg(t("blueprint.aiCheckRunning"));
    try {
      await requestCheck(activeBlueprint.frontMatter.blueprintId);
      setStatusMsg(t("blueprint.aiCheckDone"));
    } catch (e) {
      setStatusMsg(`AI check failed: ${String(e)}`);
    } finally {
      setAiChecking(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  }, [activeBlueprint, aiChecking, requestCheck, t]);

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
            <BlueprintToolbar
              onCheck={handleCheck}
              onAiCheck={handleAiCheck}
              aiChecking={aiChecking}
              onDelete={handleDelete}
            />
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
          onAccept={async (text, userInput) => {
            // 1. Clean fences + skip preamble + repair YAML close
            let cleaned = stripOuterFence(text);
            // 2. If AI forgot displayName, derive one from the user's
            //    original description (first line, max 60 chars).
            cleaned = injectDisplayNameIfMissing(cleaned, userInput);
            // 3. Final sanity check (now mostly catches truly empty bodies)
            const reason = validateDraftedBlueprint(cleaned);
            if (reason) {
              throw new Error(
                `AI 输出不完整,请直接在预览区里补齐再 Accept: ${reason}`,
              );
            }
            const created = await createBlueprint(projectRoot, cleaned);
            await refreshIndex();
            // We already have the parsed blueprint — set it directly as
            // active instead of round-tripping through loadBlueprint(id),
            // which has hit "not found" races against the just-written index.
            useBlueprintStore.setState({
              activeBlueprint: created,
              activeBlueprintId: created.frontMatter.blueprintId,
              viewMode: "structured",
            });
            setShowAiDraft(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Extract and repair a Blueprint MD payload from an LLM response.
 * Handles common LLM contract violations:
 *   1. Outer ```markdown ... ``` fences
 *   2. Preamble prose before the YAML front matter (e.g. "好的,以下是 ...")
 *   3. Missing closing `---` on the YAML front matter — we insert one
 *      right before the first `# ` heading (or at end if there is none).
 */
/**
 * If the YAML front matter is missing a displayName key (or has an empty
 * one), inject one derived from the user's input description. We use the
 * first non-empty line, trimmed to 60 chars to keep the file system /
 * UI happy.
 */
function injectDisplayNameIfMissing(md: string, userInput: string): string {
  if (!md.startsWith("---")) return md;

  // Locate the YAML block (between first `---` and the next `---`).
  const closeMatch = md.slice(3).match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) return md;
  const yamlEnd = 3 + closeMatch.index; // index of the closing `---` line
  const yamlBlock = md.slice(0, yamlEnd);

  // Check if displayName already has a non-empty value.
  const nameMatch = yamlBlock.match(/^displayName:\s*(.+)$/m);
  if (nameMatch) {
    const v = nameMatch[1].trim().replace(/^['"]|['"]$/g, "").trim();
    if (v) return md; // already populated
  }

  const derived = (userInput.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "Untitled Feature")
    .trim()
    .slice(0, 60);
  // YAML-quote if it could be ambiguous (contains : or # or starts with -).
  const needsQuote = /[:#]|^-/.test(derived);
  const value = needsQuote ? `"${derived.replace(/"/g, '\\"')}"` : derived;
  const newLine = `displayName: ${value}\n`;

  if (nameMatch && nameMatch.index !== undefined) {
    // Replace the empty displayName line.
    const lineStart = md.lastIndexOf("\n", nameMatch.index) + 1;
    const lineEnd = md.indexOf("\n", nameMatch.index);
    return md.slice(0, lineStart) + newLine + md.slice(lineEnd + 1);
  }
  // No displayName line at all — insert right after the opening `---`.
  return md.replace(/^---\s*\n/, `---\n${newLine}`);
}

/**
 * Pre-flight check on AI-drafted Blueprint MD. Returns a human-readable
 * reason string if invalid, or null if it looks OK to save.
 * Catches the common LLM failure mode where the model emits only the YAML
 * scaffold with empty values and no body.
 */
function validateDraftedBlueprint(md: string): string | null {
  // Must start with front matter delimiter (post-cleaning).
  if (!md.startsWith("---")) {
    return "缺少 YAML front matter 起始 `---`";
  }
  // displayName must be present and non-empty (account for quoted values).
  const nameMatch = md.match(/^displayName:\s*(.+)$/m);
  if (!nameMatch) {
    return "front matter 中缺少 displayName 字段";
  }
  const nameValue = nameMatch[1].trim().replace(/^['"]|['"]$/g, "").trim();
  if (!nameValue) {
    return "displayName 为空";
  }
  // Body must contain a Goal section AND an Acceptance Criteria section
  // with at least one criterion line.
  const bodyStart = md.indexOf("\n---", 3); // search past opening delim
  const body = bodyStart >= 0 ? md.slice(bodyStart + 4) : "";
  const headings = Array.from(body.matchAll(/^#\s+(.+?)\s*$/gm)).map((m) =>
    m[1].trim().toLowerCase(),
  );
  if (headings.length === 0) {
    return "正文部分没有任何 `# ` 标题 —— AI 只输出了 YAML 没生成正文";
  }
  if (!headings.some((h) => h.includes("goal") || h === "目标")) {
    return "缺少 `# Goal` 章节";
  }
  if (
    !headings.some((h) =>
      /acceptance|criteria|验收|准则/i.test(h),
    )
  ) {
    return "缺少 `# Acceptance Criteria` 章节";
  }
  // Confirm at least one criterion line is present
  if (!/-\s*\[[\sxX]\]\s+\S/m.test(body)) {
    return "Acceptance Criteria 章节里没有任何 `- [ ]` 列表项";
  }
  return null;
}

function stripOuterFence(s: string): string {
  let out = s.trim();

  // 1. Strip ```markdown / ```md / ```yaml outer fence
  const fence = out.match(/^```(?:markdown|md|yaml)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) out = fence[1].trim();

  // 2. Skip preamble before the opening `---`
  const open = out.match(/^---\s*$/m);
  if (open && open.index !== undefined && open.index > 0) {
    out = out.slice(open.index).trim();
  }

  // 3. Repair missing closing `---`. Scan from after the opening `---`
  //    and find the FIRST of: another `^---$` line (already closed),
  //    or a `# ` markdown heading (missing close — repair).
  if (out.startsWith("---")) {
    const afterOpen = out.indexOf("\n") + 1; // start of YAML body
    const rest = out.slice(afterOpen);
    const closeMatch = rest.match(/^---\s*$/m);
    const headingMatch = rest.match(/^#\s/m);
    const closeIdx = closeMatch?.index ?? Infinity;
    const headingIdx = headingMatch?.index ?? Infinity;
    if (headingIdx < closeIdx) {
      // Heading appears before any closing delimiter — inject one.
      out =
        out.slice(0, afterOpen) +
        rest.slice(0, headingIdx).trimEnd() +
        "\n---\n\n" +
        rest.slice(headingIdx);
    } else if (!isFinite(closeIdx)) {
      // No close and no heading — append a close at the very end so the
      // backend parser at least sees a complete front matter block.
      out = out.trimEnd() + "\n---\n";
    }
  }

  return out.trim();
}
