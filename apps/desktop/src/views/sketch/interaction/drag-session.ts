/**
 * The drag session state machine (S1) — pure transitions, no DOM, no store.
 * The event layer feeds it pointer facts; it answers with the next session
 * and (on commit) the plan to apply AT MOST ONCE.
 *
 * The ten laws (encoded in drag-session.test.ts):
 *  1. pending  → dragging        (threshold crossed / palette first move)
 *  2. pending  → cancelled       (release or cancel before threshold)
 *  3. dragging → committed
 *  4. dragging → cancelled
 *  5. committed never becomes dragging again
 *  6. cancelled never commits
 *  7. committed never commits twice
 *  8. events from the wrong pointerId never mutate the session
 *  9. cancellation is idempotent
 * 10. commit is idempotent (a second commit yields NO plan)
 *
 * Current drop semantics are preserved: existing-node drags activate after
 * a 4px threshold (below = click/select); palette drags activate on their
 * first pointer move. `plan` may only change while dragging.
 */
import type { DropPlan } from "../insertion";
import type { DragPhase, DragSession, DragSource } from "./types";

/** Pixels of movement before a node press becomes a drag (below = click). */
export const NODE_DRAG_THRESHOLD = 4;

let seq = 0;

export function beginSession(
  pointerId: number,
  source: DragSource,
  clientX: number,
  clientY: number,
): DragSession {
  return {
    id: `drag-${++seq}`,
    pointerId,
    source,
    phase: "pending",
    start: { clientX, clientY },
    current: { clientX, clientY },
    plan: null,
    committed: false,
  };
}

function ended(phase: DragPhase): boolean {
  return phase === "committed" || phase === "cancelled";
}

function qualifies(session: DragSession, clientX: number, clientY: number): boolean {
  if (session.source.type === "palette") return true;
  // Marquee shares the node threshold: below it the press stays a click.
  return (
    Math.hypot(clientX - session.start.clientX, clientY - session.start.clientY) >=
    NODE_DRAG_THRESHOLD
  );
}

/** Pointer moved. Wrong pointer or an ended session: unchanged (laws 5, 8). */
export function move(
  session: DragSession,
  pointerId: number,
  clientX: number,
  clientY: number,
): DragSession {
  if (session.pointerId !== pointerId || ended(session.phase)) return session;
  const current = { clientX, clientY };
  if (session.phase === "pending") {
    return qualifies(session, clientX, clientY)
      ? { ...session, phase: "dragging", current }
      : { ...session, current };
  }
  return { ...session, current };
}

/** Attach the drop decision under the pointer — only meaningful mid-drag. */
export function setPlan(session: DragSession, plan: DropPlan | null): DragSession {
  if (session.phase !== "dragging") return session;
  return { ...session, plan };
}

export interface CommitResult {
  session: DragSession;
  /** Non-null EXACTLY ONCE per session: the plan the caller must apply.
   *  Null = nothing to apply (no-op drop, wrong pointer, already ended). */
  plan: DropPlan | null;
}

/** Pointer released. The only transition that can surface a plan — and it
 *  can do so at most once (laws 3, 6, 7, 10). A pending release is a click:
 *  the session ends cancelled with no plan (law 2). */
export function commit(session: DragSession, pointerId: number): CommitResult {
  if (session.pointerId !== pointerId || ended(session.phase) || session.committed) {
    return { session, plan: null };
  }
  if (session.phase === "pending") {
    return { session: { ...session, phase: "cancelled", plan: null }, plan: null };
  }
  return {
    session: { ...session, phase: "committed", committed: true },
    plan: session.plan,
  };
}

/** Cancel from any source (Escape, pointercancel, blur, hidden document).
 *  Idempotent; never un-commits; never mutates the document (law 5, 9). */
export function cancel(session: DragSession): DragSession {
  if (ended(session.phase)) return session;
  return { ...session, phase: "cancelled", plan: null };
}
