/**
 * Drag interaction types (S1): ONE lifecycle for both drag origins.
 * The session is pure data; transitions live in drag-session.ts and are
 * governed by the ten laws (see that file's header).
 */
import type { SketchNode } from "@drafting/sketch-core";
import type { DropPlan } from "../insertion";

export type NodeKind = SketchNode["kind"];

export type DragSource =
  | {
      type: "existing-node";
      nodeId: string;
      /** Ghost chip text (the node's kind). */
      label: string;
      /** The dragged subtree — never a drop target for itself. */
      excludeNodeIds: Set<string>;
    }
  | {
      type: "palette";
      kind: NodeKind;
    }
  | {
      /** Magic Frame (Phase 2): a marquee drawn from empty canvas space.
       *  Its only possible outcome is ONE wrap mutation or nothing — it
       *  NEVER produces persistent multi-selection. */
      type: "marquee";
    };

export type DragPhase = "pending" | "dragging" | "committed" | "cancelled";

export interface DragSession {
  /** Unique per gesture (diagnostics + React keys). */
  id: string;
  /** Only events from THIS pointer may drive the session (law 8). */
  pointerId: number;
  source: DragSource;
  phase: DragPhase;
  start: { clientX: number; clientY: number };
  current: { clientX: number; clientY: number };
  /** The drop decision under the current pointer; null = no-op drop. */
  plan: DropPlan | null;
  /** Latched on the first successful commit — the exactly-once guarantee
   *  survives even a hypothetical phase mishap (belt and braces, law 7). */
  committed: boolean;
}
