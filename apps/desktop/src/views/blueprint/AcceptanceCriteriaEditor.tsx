import { Plus, X } from "lucide-react";
import type { AcceptanceCriterion } from "../../types/blueprint-types";
import { useT } from "../../lib/i18n";

interface Props {
  criteria: AcceptanceCriterion[];
  onToggle: (index: number, checked: boolean) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onTextChange: (index: number, text: string) => void;
}

export function AcceptanceCriteriaEditor({
  criteria,
  onToggle,
  onAdd,
  onRemove,
  onTextChange,
}: Props) {
  const t = useT();
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
