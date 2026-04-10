import { useEffect, useState, useCallback } from "react";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getBlueprintRaw } from "../../lib/blueprint-api";

export function RawMdView() {
  const projectRoot = useBlueprintStore((s) => s.projectRoot);
  const activeBlueprint = useBlueprintStore((s) => s.activeBlueprint);
  const updateRaw = useBlueprintStore((s) => s.updateRaw);

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!projectRoot || !activeBlueprint) return;
    setLoading(true);
    getBlueprintRaw(projectRoot, activeBlueprint.frontMatter.blueprintId)
      .then((raw) => {
        setContent(raw);
        setDirty(false);
      })
      .finally(() => setLoading(false));
  }, [projectRoot, activeBlueprint]);

  const handleSave = useCallback(async () => {
    if (!activeBlueprint || !dirty) return;
    await updateRaw(activeBlueprint.frontMatter.blueprintId, content);
    setDirty(false);
  }, [activeBlueprint, content, dirty, updateRaw]);

  // Auto-save on blur (Ctrl+S also works via keydown)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  if (loading) {
    return <div className="p-4 text-text-muted text-xs">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {dirty && (
        <div className="px-3 py-1 text-[10px] text-warning bg-warning/10 border-b border-border">
          Unsaved changes · Cmd+S to save
        </div>
      )}
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="flex-1 w-full p-4 bg-bg-primary text-text-primary text-xs font-mono resize-none focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}
