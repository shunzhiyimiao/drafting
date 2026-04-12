import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { BlueprintListPanel } from "./BlueprintListPanel";
import { BlueprintToolbar } from "./BlueprintToolbar";
import { RawMdView } from "./RawMdView";
import { StructuredView } from "./StructuredView";
import { TemplatePickerDialog } from "./TemplatePickerDialog";

export function BlueprintView() {
  const initialized = useBlueprintStore((s) => s.initialized);
  const initialize = useBlueprintStore((s) => s.initialize);
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const viewMode = useBlueprintStore((s) => s.viewMode);
  const deleteBlueprint = useBlueprintStore((s) => s.deleteBlueprint);
  const lightweightCheck = useBlueprintStore((s) => s.lightweightCheck);

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      initialize(".");
    }
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
              title="Create from Template"
            >
              <Plus size={20} />
            </button>
          </div>
        )}
      </div>

      {showTemplatePicker && (
        <TemplatePickerDialog onClose={() => setShowTemplatePicker(false)} />
      )}
    </div>
  );
}
