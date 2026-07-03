# Sketch — Design Spec (Drafting v2 subsystem)

**Status:** Design locked across a six-spade pass (Spec → codegen → token → storage → editor → IR split). **Rev 2 (2026-07-02, review pass):** K3 hardened to single-codebase (no Rust port of the class core), `criterion.sketch_node` serialization pinned, generated-file landing + constitution deltas recorded, v1.5 loop seams made explicit (publisher + `artifacts_for`), canvas safelist note, literal-key handlers type, structure-assertion sensor parked, `schemaVersion`/`blueprintRef` edge policies. **Rev 3 (2026-07-03, two-spade build pass):** `list` + data binding un-parked and shipped (schema v2 — §3.1, §4 repeat rules, §7 validate surface); free-drag un-parked at a narrowed scope (drag expresses tree ops, never infers structure — §7.1). This is the authoritative spec for building Sketch; it supersedes chat discussion. Positioned as **layer 2** of the v2 four-layer model:

```
想清楚      画出来      装起来       看明白
Blueprint → Sketch  →  Patchboard → Atlas
产品意图     界面结构     系统架构       代码现状
(prescriptive ─────────────────►)   (descriptive return edge)
```

Reference implementation (TypeScript — and per the K3 corollary, the implementation that *ships*; Rust mirrors only the Spec data model): `packages/sketch-core` (`spec.ts` / `theme.ts` / `emit.ts` / `to-element.ts` / `validate.ts`). Suite as of Rev 3: **34 green** (codegen + parity incl. repeat + validate), **145 enumerated finite-alphabet points**.

---

## 1. What Sketch is — and isn't

- Sketch is the **界面结构** layer. It is **domain-relevant, not universal**: backends, CLIs, and data pipelines have no UI, so their Sketch layer is *empty* (Drafting's own Rust backend has none). **The model must allow a layer to be absent.**
- The three prescriptive layers are **projections in a loop, not stages in a pipeline**. Blueprint/Sketch/Patchboard are top-down (what you're designing); Atlas is bottom-up (what the code is). Sketch → generated code → Atlas → verdict closes the diagram on itself.
- **Build decision — lean (A): Sketch ships as a standalone subsystem** (own Spec, storage, codegen; bound to Blueprint by reference), *not* as a projection of a unified typed model. Rationale: Drafting has **no** unified typed model today — Blueprint (`.blueprint.md`) and Patchboard (Socket/Adapter registry) are SyncBus-coordinated **independent subsystems**, never built as projections. "One model, three projections" is a north star; unifying it is a **separate v2.x+ architecture effort** (likely where the Polaris typed-model line converges). Sketch must not be the one forced to pioneer it. This matches how Blueprint/Patchboard were actually built.

## 2. Three keystones (the load-bearing invariants)

**K1 — The tree is truth.** Layout is an **auto-layout tree** (containers + `hug`/`fill`/`fixed` sizing), **never absolute coordinates**. Coordinates (`x=40,y=220`) don't encode intent; a good `<button>` from coordinates needs a heuristic/AI to *guess* the layout — reinjecting the very probabilistic step the design exists to remove. A tree → Tailwind flex is a pure, total, byte-stable map. The editor may let you drag freely, but the drag **snaps into the tree**; the stored `.sketch.json` is the tree, not coordinates.

**K2 — Codegen is a finite, pure fold.** tree → React/Tailwind is a structural recursion over **finitely many node kinds**; each kind's class emission is a pure function over a **finite attribute alphabet**. The only downward context is the parent's `{direction, crossAxis}` (a fixed 2-tuple). **AI appears nowhere on this path.** Because the alphabet is finite, the fold is **finite-state deterministic** → each mapping function's domain is *exhaustively* testable and codegen correctness is decidable. (The one open dimension — `fixed` px — is isolated in a single escape hatch and doesn't break this.)

**K3 — One IR, two serializers.** `toIR` (the design's `describe`) is the **only** place that decides tag + className + nesting. `toJsxString` (→ file/codegen) and `toElement` (→ editor canvas) are **trivial projections** of that IR. So the canvas and the shipped code share every structural decision — **WYSIWYG is constructional, not a hope the tests protect.** Parity test = "both serializers yield identical `(tag, className, data-sk)` from one IR," which is near-tautological by design.

**K3 corollary — one codebase, not just one function.** The IR decider ships as a single shared TS package consumed by **both** the editor canvas (frontend) and codegen (the existing Node codegen-server). There is deliberately **no Rust port** of `toIR`/emit: a second-language implementation would split "the only place that decides" across languages, explode the parity matrix (2 languages × 2 serializers), and reintroduce hand-sync drift at the *behavior* level — the exact bug class K3 exists to foreclose. Rust owns Spec serde + storage + index only; **it never computes a className.**

## 3. The Spec (data model)

Stored as `sketches/*.sketch.json`. TS below is authoritative; the Rust `serde` mirror is isomorphic.

```typescript
// A Sketch = one screen, bound to a Blueprint feature (child-points-to-parent).
interface Sketch { id: SketchId; name: string; blueprintRef: FeatureId | null; root: Container; schemaVersion: number; }

type Node = Container | Primitive;   // the auto-layout tree

interface Container {
  kind: "stack";                     // grid PARKED (needs its own track-sizing model)
  id: string;                        // stable ULID — see §6 addressing
  layout: Layout; sizing: Sizing; style?: Style; children: Node[];
}
interface TextP   { kind: "text";   id: string; role: TypeToken; content: string; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
interface ButtonP { kind: "button"; id: string; label: string; variant: ButtonVariant; sizing: Sizing; style?: Style; intent?: Intent; semantics?: SemanticDecl; }
interface InputP  { kind: "input";  id: string; label: string; placeholder?: string; type: "text"|"email"|"password"; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
interface ImageP  { kind: "image";  id: string; src: string; alt: string; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
type Primitive = TextP | ButtonP | InputP | ImageP;   // MVP primitive set: 4 atoms

interface Layout { direction: "row"|"col"; gap: SpacingStep; padding: Edges;
  mainAxis: "start"|"center"|"end"|"between"; crossAxis: "start"|"center"|"end"|"stretch"; }
interface Edges  { top: SpacingStep; right: SpacingStep; bottom: SpacingStep; left: SpacingStep; }

// Sizing: hug/fill/fixed. Fixed px is the ONE open escape hatch (§5).
type Size = { mode:"hug" } | { mode:"fill" } | { mode:"fixed"; px:number };
interface Sizing { width: Size; height: Size; }

// Style is FULLY tokenized (no raw values, no classes) — see §5.
interface Style { bg?: ColorToken; fg?: ColorToken; border?: { width:"none"|"thin"|"thick"; color: ColorToken }; radius?: RadiusToken; }

// Intent = the visual/interaction fact. NOT which adapter it calls (that's Patchboard).
type Intent = { kind:"navigate"; to: SketchId|null } | { kind:"submit" } | { kind:"none" };

// Inspector data shape — the "human declares what machines can't infer" half.
interface SemanticDecl { declared: string; proposed?: string; }  // preset-primitive MVP: declared=kind, proposed absent

// Finite alphabets
type SpacingStep = 0|1|2|3|4|6|8|12|16|24;                 // == tailwind spacing numbers
type RadiusToken = "none"|"sm"|"md"|"lg"|"xl"|"full";
type TypeToken   = "heading"|"subhead"|"body"|"caption";
type ColorToken  = "surface"|"raised"|"text"|"muted"|"primary"|"on-primary"|"border"|"danger"|"on-danger"|"transparent";
type ButtonVariant = "primary"|"secondary"|"ghost";
```

**Notes.** `card` is not a primitive — it's a `Container` with padding/border/bg. `text.role` *is* a `TypeToken` directly. Node ids are ULIDs; they survive move/edit and only die on real delete.

### 3.1 `list` + data binding (schema v2)

`list` shipped in Rev 3 without waiting for Blueprint-side data modeling — the shape is declared **inline** on the node; a future spade may add a child-points-to-parent `blueprintRef` per `ItemField` (shape declared by/checked against Blueprint data). That seam is reserved in comments, not built.

```typescript
type Node = Container | ListP | Primitive;          // Rev 3: + list

interface ItemField { name: string; type: "string"|"number"|"boolean"|"image"; isKey?: boolean }
interface ListP {
  kind: "list"; id: string;
  itemShape: ItemField[];                            // inline, finite type alphabet
  dataKey: string;                                   // component reads data.<dataKey>
  template: Container;                               // the single-root repeated unit
  sampleRows: Record<string, unknown>[];             // canvas sample data — IN the Spec
  sizing: Sizing; style?: Style;
}
// Binding expressions — legal ONLY inside a template subtree:
//   text.content / image.src : string | { bind: string }   // bind names an itemShape field
```

Load-bearing decisions:

- **Boundary: the list only renders.** No fetching, no sorting, no filtering, no pagination — all of it is the user-owned sibling's job, delivered through the generated component's typed `data.<dataKey>` prop. Anything smarter than "map rows through a template" does not belong to Sketch.
- **`sampleRows` live in the Spec** so the canvas stays a pure function of the file (K2 reproducibility: no runtime randomness/clock on the render path). They are design data, versioned like the rest of the tree.
- **Item type name is derived, never stored:** `PascalCase(dataKey) + "Item"` (`inbox → InboxItem`). One fewer field to drift.
- **`schemaVersion` bumped to 2.** v1 → v2 is the identity migration (v2 only *added* a kind); the loader migrates forward and heal-writes the version back through the existing id-healing channel.
- **Semantic validation is sketch-core's, single-implementation** (`validate(sketch) → ValidationError[]`; Rust stays structural serde). Pinned rules: a bind must name a declared itemShape field; exactly one `isKey` per list; every sampleRow's keys ⊆ itemShape with type-matching values. Decidability prerequisites that ride along: binds outside a template are errors; nested lists are rejected (parked — a nested repeat would shadow the generated `item`); `dataKey`/field names must be JS identifiers and `dataKey` unique per sketch (they become `data.<dataKey>` / `item.<name>` and the derived type name). The editor Inspector surfaces the list; the fold stays total regardless (invalid Specs still fold deterministically and fail tsc downstream).
- **In-spade parks (explicitly not built):** nested lists, empty-state slot, separators, virtual scrolling.

**Edge policies.** `schemaVersion`: the loader migrates older versions forward on load and heal-writes the migrated form back (the same write-back channel as id healing); a version *newer* than the app understands opens read-only with a warning — never a rewrite. `blueprintRef` dangling mirrors the criterion rule (§6): a deleted feature leaves the sketch in a `dangling` state surfaced in the Inspector for a human to re-bind or null — signal, not error, never cascade.

## 4. Codegen (the fold)

Full map is in `emit.ts`; the load-bearing rules:

- **Container className** — fixed 6-segment order + sizing + style, then dedup → byte-stable string: `base(flex) · direction · gap · padding · justify · items`. `SpacingStep` maps 1:1 to the tailwind number (`gap-6`, `p-4`). Padding collapses `p-` / `px-,py-` / per-edge.
- **Sizing, relative to parent main axis.** Main dim: `hug→shrink-0`, `fill→flex-1`, `fixed→w/h-[Npx] shrink-0`. Cross dim: `hug→self-start` **iff** parent `crossAxis==="stretch"` (else nothing), `fill→self-stretch`, `fixed→h/w-[Npx]`. (The cross-hug rule is why K2's downward context is the 2-tuple, not just direction.)
- **Primitives:** text `role→h2/h3/p/span` + type-token classes; button base + `variant` bundle; input = `<label>` + `<span>` + `<input type>`; image = `<img src alt>`.
- **Intent → id-keyed handler map, typed with literal keys.** The generated file exports `type SketchHandlers = { "<node-id>"?: () => void; … }` — a literal-key type over exactly the `intent≠none` nodes — and the component takes `handlers: SketchHandlers`; those nodes emit `onClick={handlers["<id>"]}`. Literal keys make stale wiring a **compile error**: delete/recreate a node and the sibling file's dead handler is caught by tsc — i.e. by the v1.5 TS compile gate, not by runtime silence. The Spec does **not** know who handlers connect to. In the MVP the consumer is the **human sibling file**; a Patchboard-side "wire adapter to handler" feature is a *reserved seam* (v2.x) — this is the boundary type, not a claim that Patchboard already plugs in.
- **Determinism guarantees:** canonical class order + dedup + pinned Prettier (in the existing `codegen-server.cjs`) → byte-stable file. **Generated files are write-only** (`*.generated.tsx`); hand code + handler wiring live in a **sibling** file that imports it → codegen stays a pure function of the Spec; regeneration never touches human code; diffs are meaningful. Every element carries `data-sk={id}` (§6).
- **Testing discipline:** exhaustive over the finite alphabet (141 points: sizing 72, align 16, gap 10, color 30, radius/type/variant 13; Rev 3 adds the 4-point item-field-type map) + a handful of goldens + parity. **Assert semantic class-groups, never full HTML strings** (kills brittleness / premature calcification).
- **Repeat (Rev 3).** The IR gains a `repeat` node on the list's wrapper (`flex flex-col` + sizing/style — no Layout by design, so no new classes; row spacing belongs to the template's own padding). Its single child is the template, folded ONCE. Both serializers project the same IR: `toJsxString` emits `{data.<dataKey>.map((item) => (…))}` with `key={item.<keyField>}` and `{item.<field>}` interpolations; `toElement` renders one instance per `sampleRows` row with values substituted. Every instance carries the template node's `data-sk` — **plural addressing**: selection/criteria address the template node, all instances light up. Parity extends: each canvas instance must equal the JSX template's `(tag, className, data-sk)` triples.
- **Handler payload evolution (Rev 3).** A handler *inside* a template types as `(item: <X>Item) => void` and emits `onClick={() => handlers["<id>"]?.(item)}` — the row is the payload; outside templates the `() => void` form is unchanged. The component signature gains `data` **only when lists exist** (`{ data, handlers }`, `data: { <dataKey>: <X>Item[] }`, one key per distinct list) — a list-free Spec regenerates byte-identically to pre-Rev-3 output. K2 note: `ParentCtx` carries an optional enclosing-repeat marker that feeds handler typing ONLY; class emission still depends on exactly the `{direction, crossAxis}` 2-tuple, so the finite-alphabet decidability argument is untouched.

## 5. Token system

**Style stores semantic token references** — not raw values, not classes. Two payoffs: (1) the value domain collapses to a **finite enumerable name set** → token→class is pure lookup → feeds K2's decidability; (2) theming/dark/reskin is **free** (swap the token→value binding table; Spec unchanged).

- **Spacing snap (correction to an earlier raw-px draft):** `gap`/`padding` snap to the ramp → standard classes (`gap-4`, not `gap-[17px]`); a design-system tool *should* snap. The **only** raw-px survivor is `fixed` sizing (`w-[240px]`) — fixed dimensions are legitimately open (avatar 48, sidebar 240). **Rhythm finite, fixed dimensions open — one hole, isolated.**
- **Default theme** (`tokens.default.json`, slate+blue): colors `surface→white, raised→slate-50, text→slate-900, muted→slate-500, primary→blue-600, on-primary→white, border→slate-200, danger→red-600, on-danger→white, transparent`. Spacing ramp `0 1 2 3 4 6 8 12 16 24`. Radius `none→…→full`. Type tokens: `heading→text-xl/semibold/tight`, `subhead→text-lg/medium/snug`, `body→text-base/normal`, `caption→text-sm` (defaults fg=muted).
- **variant / role are named token bundles, not new mechanisms.** `primary = {bg:primary, fg:on-primary, radius:md}`, `secondary = {bg:raised, fg:text, border:thin/border, radius:md}`, `ghost = {bg:transparent, fg:primary, radius:md}`. User `style` overrides the variant.
- **resolve = second pure lookup:** `resolve(token, theme) → class`. `theme` is a swappable binding table. **MVP ships one light theme**; dark = same token names, different bindings (Spec zero-change). Multi-theme + per-project override **parked**.

## 6. Storage & binding

**Keystone: no separate binding file. All relationships live on entities; the index is a pure, rebuildable cache.** (Direct reuse of the Blueprint pattern shipped for criteria.)

- **Files:** `sketches/*.sketch.json`, flat (no nested dirs — parallel to flat blueprint features), **in git**. Also in git: `.sketch.json` trees, `criterion.sketch_node` (inside `.blueprint.md`), generated React, `tokens.default.json`. Everything needed to use the project is versioned.
- **Generated-file landing & ownership (constitution delta):** one file per sketch at `packages/ui/src/generated/<sketch>.generated.tsx` (package name lean: `ui`) — **tool-owned, regenerated wholesale** (the sockets/wiring rule); a sibling `packages/ui/src/<sketch>.tsx` (imports the generated component, owns handler wiring) is **generated once, then user-owned** (the adapter-skeleton rule). Two v2 amendments to the v1 constitution follow and are recorded here so they're a decision, not an accident: Part 6 §2 ("only Patchboard writes `packages/`") gains Sketch's generated zone, and the package-ownership table gains `packages/ui` (`src/generated/` tool-owned, rest user-owned).
- **Bindings — child-points-to-parent is the *only* authoritative edge:**
  - Sketch→feature: `Sketch.blueprintRef` authoritative. Feature does not back-point.
  - criterion→node: **`criterion.sketch_node = {sketch_id, node_id}`** authoritative. Node doesn't know who verifies it.
  - **`sketch_node` serialization (pinned):** it rides the criterion's *existing* end-of-line marker comment, extended to a field grammar — `<!-- #01ULID sk:sk_a1/node_8f3a -->`, i.e. `#<criterion-id>` followed by space-separated `key:value` fields, **unknown fields preserved verbatim on round-trip**. One marker channel, one grammar — no second comment to escort through the parser. Three obligations, all zero-debt-zone tested: (1) the marker parser accepts and re-serializes unknown fields byte-identically (round-trip safety, Blueprint constraint 23); (2) the **frontend `AcceptanceCriterion` type carries `sketchNode?`** and structured-view saves preserve it — the 9eada7c lesson verbatim: an optional field the frontend doesn't carry is a field the next save silently deletes; (3) writes stay blueprint-domain (the file is `.blueprint.md`).
  - All reverse lookups (a feature's sketches; a node's criteria) come **from the index only**, never stored as a second truth. This structurally forecloses "two places written, mismatched" — the same-family bug as the S5 placeholder.
- **`.sketch-index.json` — pure cache, NOT in git.** It's 100% recomputable from the entities; `rebuild_index` is that function. Git should store the **non-recomputable** (truth); versioning a derived file duplicates information and produces (a) meaningless merge conflicts — the correct answer is "rescan the merged entities," not in either text side — and (b) **false consistency**: a text-merged index that's syntactically clean but semantically stale = silent drift. Rebuild on load, hooked to the existing startup-rebuild (with a `sketches/` guard, same as the blueprint `blueprints/` guard). *(Contrast: the Blueprint `index.json` IS in git — justified by offline-readability. `.sketch-index.json` is a reverse-lookup table, useless without tooling → cache, not document. Different treatment is deliberate, not an inconsistency.)*
- **Git recovery uses zero AI.** `rebuild_index` is a deterministic file scan (ms, no network). Once a Spec is `.sketch.json`, everything downstream (`.sketch.json` → codegen → React) is the finite pure fold. Anyone, anytime, restoring from git gets the identical deterministic product. AI is *not* on the recovery path — that's the payoff of confining AI to one upstream cell.
- **Node-id stability (criteria's anchor):**
  1. **heal-on-load** — on loading `.sketch.json`, any id-less node mints a ULID and is **written back to disk** (copy of `load_blueprint_self_heals`); ids are stable from first load.
  2. **delete → dangling, not cascade** — a criterion pointing at a deleted node enters a `dangling` state; the Inspector surfaces "the node it verified is gone" for a human to re-bind/drop. Dangling is a signal, not an error.
  3. ids are invariant across move/attribute-edit; only real delete invalidates.
- **Write invariant (satisfies the parked read/write review):** Sketch storage writes only `sketches/**` + the index; `criterion.sketch_node` is written by **blueprint** storage (it already owns `.blueprint.md` write-back). **No cross-writes.** A bind action (Inspector: bind criterion→node) writes the **criterion half** (blueprint domain); the Sketch domain only *reads* whether the node exists. The boundary is "who writes whose directory."

**Index shape** (cache, rebuildable):
```jsonc
{ "byFeature":      { "feat_login": ["sk_a1"] },              // feature -> sketches (reverse)
  "criteriaByNode": { "sk_a1:btn_8f3a": ["crit_x2"] },        // node -> criteria (reverse)
  "dangling":       ["crit_z9"] }                             // criteria pointing at a deleted node
```

## 7. Editor

**Tree-native minimal** (the few-days version that unblocks authoring): three panes — **outline** (tree), **canvas** (rendered via `toElement`, the same class-core), **Inspector** (right panel). Structured add/move/delete (no free-drag), autosave.

- **Inspector = finite selectors only.** Every control is an enumerated dropdown/toggle: sizing hug/fill/fixed (fixed reveals a px field — the lone open hatch); gap/padding = the 10 ramp steps; color/radius/type/variant = token dropdowns. Result: **the editor cannot structurally produce an off-token or out-of-scale Spec.** The finite alphabet's discipline reaches all the way to what the UI can express. Declarations write **onto the entity**; `semantics.proposed` (the AI-input reconcile field) stays dormant in the preset-primitive MVP.
- **Three reuses prove it's not bolted on:**
  1. **Canvas selection reads `data-sk`.** Click canvas → nearest `data-sk` ancestor = selected node. `data-sk` now serves **three** consumers: criteria verification, Atlas addressing, editor selection. One stable addressing (the criterion discipline), three uses.
  2. **Autosave → FileSaved bus → codegen → Atlas → criterion re-verify.** The editor is just another **producer** on the v1.5 loop (S2's FileSaved), not a new loop. Edit a Sketch, save, and the loop tells you whether "login screen has a submit button" is satisfied.
  3. **Inspector = the criterion attestation RightPanel** — same surface, content follows selection.
- **Canvas Tailwind safelist (implementation note):** the canvas runs `toElement` inside Drafting's own webview, composing classes at *runtime* — invisible to Tailwind's static scan. K2 already contains the fix: the emitted class universe is finite, so Drafting's tailwind config **generates its safelist by enumerating the alphabet** (a build-time script over the same tables the exhaustive tests enumerate). User projects are unaffected — generated files carry literal class strings.
- **Editor keystone = the IR split (K3):** canvas and ship can't drift.

### 7.1 Free-drag, narrowed (Rev 3)

The parked §9.1 interaction shipped at a deliberately smaller scope. **Scope law: drag only *expresses* tree operations; it never *infers* structure.**

- **In:** palette → canvas insertion; existing-node drag for same-parent reorder and cross-container reparent — one indicator (nearest gap on the target's main axis, deepest stack container under the pointer wins); landing on a primitive means "its parent container, at that child's slot"; an explicit **Wrap in Stack** command on the selection replaces every auto-wrap heuristic.
- **Out (delete on sight):** dropping on empty canvas creating structure (it's a no-op — `computeInsertion` returns null), marquee selection, auto-wrap / layout inference of any kind.
- **Mechanics:** the decision is a pure function — `computeInsertion(point, layoutBoxes) → { containerId, index }` (+`indicatorRect`), DOM-free and unit-tested (row/col, edges, nesting, empty containers, subtree exclusion). The event layer only collects the pointer, measures rendered `[data-sk]` boxes once per drag, and dispatches the *existing* tree ops (`insertNodeAt` / `moveNodeTo`). Boxes are per rendered element, so template instances (plural data-sk) resolve to the template container — dropping into any instance edits the template, and all instances update. Pointer events, not HTML5 DnD (the Tauri webview intercepts native drag/drop). Self-nesting is excluded at candidacy (the dragged subtree can't receive itself); the sketch root and template roots don't drag.

## 8. How Sketch closes into v1.5

Generated React becomes 代码现状 (Atlas) the moment it lands; criteria verify UI acceptance conditions against it via `data-sk`. **Sketch sits *on* the intent↔reality loop, not beside it.** Editor autosave is one more FileSaved producer feeding the same verdict/drift machinery (S2–S6).

Three seams make this real rather than aspirational (the first is S2's lesson — an event type without a publisher is a dead wire; the second is the S0.2 signature seam doing what it was left open for):

- **Sketch storage publishes its own FileSaved.** Editor autosave goes through the Sketch save command (Rust), which publishes `FileSaved{sketches/x.sketch.json}` on the bus — it does **not** ride `editor_write_file`. Regeneration subscribes **debounced** (lean: 500ms trailing) so an autosave burst costs one codegen.
- **Binding resolution extends `artifacts_for` (the S0.2 signature seam).** A sketch-bound criterion's artifact set resolves to `[sketches/<sketch>.sketch.json, <generated file>]` — then the S0.3 reverse index, S5 drift, and the estimator work **unchanged**: edit a sketch (or its generated file) and bound criteria go stale/drift exactly like code-bound ones.
- **MVP already ships one deterministic signal:** dangling detection ("the bound node exists") is a decidable check on the Spec tree, surfaced in the Inspector and as check evidence. Richer structure assertions are parked (§9.6).

## 9. Parked (explicit, ordered)

1. **Free-drag snap-into-tree** — ~~parked~~ **shipped in Rev 3 at a narrowed scope** (§7.1: drag expresses tree ops; no structure inference). Still parked from the original ambition: new-container-vs-merge drop heuristics, marquee selection, drag-drawn containers.
2. **AI input chain** — hand-draw → geometry recognition → AI semantics → `proposed` + Inspector reconcile. The **only** probabilistic cell in Sketch; upstream and **optional** (preset primitives skip it, landing directly in the Spec).
3. **typed-patch undo** — vs snapshot (see §10). Aligns with the Polaris typed-model motif.
4. **sketch-embeds-sketch component reuse**; multi-feature dashboard pages (compose via sketch composition, since binding is sketch-level).
5. **grid** container (own track-sizing model); breakpoints/responsive; multi-theme + per-project token override; `navigate` target payload; index incremental update.
6. **Structure-assertion sensor** — a tiny decidable assertion language over the Spec tree (`node exists ∧ kind==button ∧ intent==submit`) as a Sketch-native deterministic leg for sketch-bound criteria, feeding the S4 fusion ahead of the LLM. MVP ships only the existence check (= dangling detection); the assertion language needs its own design spade.

## 10. Deferred micro-decisions (non-blocking; current leans)

- **`.sketch-index.json` in git:** **resolved — NO** (cache; see §6).
- **Dangling criterion presentation:** lean per-selection in Inspector (follows selection), not a top-of-load banner.
- **Undo strategy:** lean snapshot first, typed-patch later.
- **Canvas in-place edit** (double-click text): lean Inspector-only first (single write path), in-place later.

## Appendix — reference implementation status

The TS reference (`emit.ts` = class core + `toIR` + `toJsxString`; `to-element.ts` = the injected-`createElement` serializer; `spec.ts`; `theme.ts`) is, per the K3 corollary, the implementation that ships — extracted into a shared TS package consumed by both the frontend canvas and the codegen-server. Tests: **27 codegen** (141 finite-alphabet points enumerated for totality + goldens) + **3 parity** (both serializers, one IR) = **30 green**. Next build step when resumed: extract the reference into the shared package (**no Rust port of the class core**), then `apps/desktop` Rust gets Spec serde + storage (heal-on-load, write-back) + index rebuild only, with serde round-trip tests; the exhaustive + parity suites stay in TS, where the fold lives.
