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

/// Verdict + freshness badge for one criterion (S6). Drift takes visual
/// priority (an established verdict gone suspect). `title` shows the rationale.
function VerdictBadge({ est }: { est?: Estimate }) {
  if (!est) return null;
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

  return (
    <span
      title={est.explanation ?? undefined}
      className={`shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls} ${
        est.stale && !est.drifted ? "opacity-60" : ""
      }`}
    >
      {label}
      {est.stale && !est.drifted ? " ·" : ""}
    </span>
  );
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
  const estFor = (id?: string) =>
    id ? estimates?.find((e) => e.criterionId === id) : undefined;
  return (
    <div className="flex flex-col gap-1">
      {criteria.map((c, i) => (
        <div
          key={i}
          className="flex items-center gap-2 group"
        >
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
          <VerdictBadge est={estFor(c.id)} />
          <button
            onClick={() => onRemove(i)}
            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-opacity"
            title={t("blueprint.criterionRemove")}
          >
            <X size={12} />
          </button>
        </div>
      ))}
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
