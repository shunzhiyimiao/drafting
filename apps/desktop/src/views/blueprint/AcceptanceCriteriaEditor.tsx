import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { AcceptanceCriterion, Estimate } from "../../types/blueprint-types";
import { useT } from "../../lib/i18n";

interface Props {
  criteria: AcceptanceCriterion[];
  /** S6 feedback surface: per-criterion estimates (verdict + why + drift). */
  estimates?: Estimate[];
  onToggle: (index: number, checked: boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onTextChange: (index: number, text: string) => void;
}

/** Verdict label + color for a criterion (S6). Drift takes visual priority
 *  (an established verdict gone suspect), then the verdict, then stale. */
function verdictBadge(est: Estimate): { label: string; cls: string } | null {
  if (!est.verdict && !est.drifted && !est.stale) return null;
  const [label, cls] = est.drifted
    ? ["drift", "bg-error/20 text-error border-error/40"]
    : est.verdict === "pass"
      ? ["pass", "bg-success/20 text-success border-success/40"]
      : est.verdict === "fail"
        ? ["fail", "bg-error/20 text-error border-error/40"]
        : est.verdict === "unclear"
          ? ["unclear", "bg-warning/20 text-warning border-warning/40"]
          : ["stale", "bg-bg-hover text-text-muted border-border"];
  return { label: est.stale && !est.drifted ? `${label} ·` : label, cls };
}

export function AcceptanceCriteriaEditor({
  criteria,
  estimates,
  onToggle,
  onAdd,
  onRemove,
  onTextChange,
}: Props) {
  const t = useT();
  // Which criterion's explanation is expanded (by criterion id).
  const [openId, setOpenId] = useState<string | null>(null);
  const estFor = (id?: string) =>
    id ? estimates?.find((e) => e.criterionId === id) : undefined;
  return (
    <div className="flex flex-col gap-1">
      {criteria.map((c, i) => {
        const est = estFor(c.id);
        const badge = est ? verdictBadge(est) : null;
        const expanded = !!c.id && openId === c.id;
        return (
          <div key={i} className="flex flex-col">
            <div className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={c.checked}
                onChange={(e) => onToggle(i, e.target.checked)}
                className="w-3.5 h-3.5 accent-accent shrink-0"
              />
              <input
                value={c.text}
                onChange={(e) => onTextChange(i, e.target.value)}
                className={`flex-1 bg-transparent text-xs text-text-primary border-none focus:outline-none focus:bg-bg-primary px-1 py-0.5 rounded ${
                  c.checked ? "line-through text-text-muted" : ""
                }`}
              />
              {badge && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenId(expanded ? null : (c.id ?? null))
                  }
                  title={est?.explanation ?? undefined}
                  className={`shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border cursor-pointer ${badge.cls} ${
                    est?.stale && !est?.drifted ? "opacity-60" : ""
                  }`}
                >
                  {badge.label}
                </button>
              )}
              <button
                onClick={() => onRemove(i)}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
                title={t("blueprint.criterionRemove")}
              >
                <X size={12} />
              </button>
            </div>
            {expanded && est?.explanation && (
              <div className="ml-6 mr-2 mb-1 text-[11px] leading-relaxed text-text-secondary bg-bg-secondary border border-border rounded px-2 py-1.5">
                {est.explanation}
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary mt-1 self-start"
      >
        <Plus size={10} />
        Add criterion
      </button>
    </div>
  );
}
