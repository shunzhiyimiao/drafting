/**
 * persist-on-need (Rev 4 §6, revising Rev 3's heal-on-load): a node's id is
 * written to the file as `sk:id` only when something EXTERNAL needs it to be
 * stable — the x:Name precedent. Everything else carries a session-temp id
 * (`~N`, doc order) that never reaches disk, so unedited nodes never churn
 * handler keys or diffs just because the document reflowed.
 *
 * The needs, and where each is enforced:
 *  (a) bound by a criterion         — an external ACTION, not derivable from
 *      the tree; the bind call-site mints explicitly before the criterion
 *      marker is written (sketch domain persists first — §6 write order).
 *  (b) intent ≠ none                — the generated SketchHandlers literal
 *      key must survive reprints (this module).
 *  (c) inside a template, carrying  — plural data-sk addressing for bound
 *      {Bind} or an intent            rows must stay stable (this module).
 *
 * Existing ULIDs are never touched (migration keeps every v2 id); an
 * "unreferenced-id cleanup" is a future EXPLICIT command, not behavior.
 */
import type { Sketch, SketchNode } from "./spec.js";
import { isBind } from "./spec.js";
import { isTempId } from "./markup.js";

/** Does the TREE say this node needs a persistent id? (Case (a) — criterion
 *  binding — is an external action and is minted at the bind call-site.) */
export function needsPersistentId(node: SketchNode, inTemplate: boolean): boolean {
  if (node.kind === "button" && node.intent !== undefined && node.intent.kind !== "none") {
    return true;
  }
  if (inTemplate) {
    if (node.kind === "text" && isBind(node.content)) return true;
    if (node.kind === "image" && isBind(node.src)) return true;
  }
  return false;
}

export interface EnsureIdsResult {
  sketch: Sketch;
  /** Ids that were minted this pass (empty = nothing needed persisting). */
  minted: string[];
}

/**
 * Mint persistent ids for every node the policy says needs one but which
 * still carries a session-temp id. Pure (the input tree is not mutated),
 * idempotent, and conservative: existing persistent ids are never replaced.
 * `mint` is injected so this package stays dependency-free (frontend passes
 * its ULID generator; tests pass a counter).
 */
export function ensurePersistentIds(sketch: Sketch, mint: () => string): EnsureIdsResult {
  const minted: string[] = [];
  const walk = (n: SketchNode, inTemplate: boolean): SketchNode => {
    let id = n.id;
    if ((id === "" || isTempId(id)) && needsPersistentId(n, inTemplate)) {
      id = mint();
      minted.push(id);
    }
    if (n.kind === "stack") {
      return { ...n, id, children: n.children.map((c) => walk(c, inTemplate)) };
    }
    if (n.kind === "list") {
      return { ...n, id, template: walk(n.template, true) as typeof n.template };
    }
    return { ...n, id };
  };
  const root = walk(sketch.root, false);
  return { sketch: { ...sketch, root: root as Sketch["root"] }, minted };
}
