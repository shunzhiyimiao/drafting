/**
 * The criterion↔sketch-node binding surface's shared half — extracted from
 * the (now unrouted) designer Inspector so Lite's preview panel and any
 * future surface write bindings through ONE implementation.
 *
 * §6 write invariant: Sketch never writes `.blueprint.md` — bind/unbind
 * edits the CRITERION through the blueprint API, spreading the original
 * sections so ids/markerExtras/sketchNode survive (the 9eada7c discipline).
 * Write ORDER: the sketch domain persists the node's sk:id (and flushes the
 * file) BEFORE the blueprint domain writes the criterion marker.
 */
import { useCallback, useEffect, useState } from "react";
import { getBlueprint, updateBlueprintStructured } from "../../lib/blueprint-api";
import type { AcceptanceCriterion, Blueprint, BlueprintSection } from "../../types/blueprint-types";
import { useSketchStore } from "../../stores/sketch-store";

/** Load the ACTIVE sketch's bound feature blueprint (null = unbound). */
export function useBoundFeature(): [Blueprint | null, () => Promise<void>] {
  const active = useSketchStore((s) => s.active);
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const [feature, setFeature] = useState<Blueprint | null>(null);

  const reload = useCallback(async () => {
    if (!projectRoot || !active?.blueprintRef) {
      setFeature(null);
      return;
    }
    try {
      setFeature(await getBlueprint(projectRoot, active.blueprintRef));
    } catch {
      setFeature(null);
    }
  }, [projectRoot, active?.blueprintRef]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return [feature, reload];
}

export async function setCriterionBinding(
  projectRoot: string,
  feature: Blueprint,
  criterionId: string,
  sketchNode: { sketchId: string; nodeId: string } | undefined,
) {
  const sections = feature.sections.map((s: BlueprintSection) =>
    s.kind.kind === "acceptanceCriteria"
      ? {
          ...s,
          criteria: s.criteria.map((c: AcceptanceCriterion) =>
            c.id === criterionId ? { ...c, sketchNode } : c,
          ),
        }
      : s,
  );
  await updateBlueprintStructured(
    projectRoot,
    feature.frontMatter.blueprintId,
    feature.frontMatter,
    sections,
  );
}
