# Sketch — Design Spec (Drafting v2 subsystem)

**Status:** Design locked across a six-spade pass (Spec → codegen → token → storage → editor → IR split). **Rev 2 (2026-07-02, review pass):** K3 hardened to single-codebase (no Rust port of the class core), `criterion.sketch_node` serialization pinned, generated-file landing + constitution deltas recorded, v1.5 loop seams made explicit (publisher + `artifacts_for`), canvas safelist note, literal-key handlers type, structure-assertion sensor parked, `schemaVersion`/`blueprintRef` edge policies. **Rev 3 (2026-07-03, two-spade build pass):** `list` + data binding un-parked and shipped (schema v2 — §3.1, §4 repeat rules, §7 validate surface); free-drag un-parked at a narrowed scope (drag expresses tree ops, never infers structure — §7.1). **Rev 4 (2026-07-10, text-as-truth spade):** the truth serialization moves from `.sketch.json` to the `.sketch` **markup dialect** (schema v3 — §3.2); a fourth keystone lands (K4 — §2); the id policy revises to **persist-on-need** (§6); the editor inverts to a text-primary surface with ONE undo stack (§7.2); the Rust half narrows to text I/O + index (the K3 corollary extends: Rust never parses the dialect); the WPF reference ledger is recorded (§11). **Rev 5 (2026-07-12, Frame spade — the K1 amendment):** the long-parked coordinate decision lands as an explicit container, not a violation. A **`Frame`** is the ONE region where coordinates are truth: its direct children carry `pos {x,y}` — document attributes in the tree and the dialect (`<Frame w h>` with children bearing `x={n} y={n}`, always printed, default 0 on parse, positioned error anywhere else; negative legal, frames don't clip — WPF Canvas semantics). K1's statement refines to "the tree is truth, and x/y live IN the tree": no flow layout inside (no gap/pad/axes; child order = z-order, later paints on top), frame sizing is fill/fixed only (hug is a validate error — absolute children give no intrinsic size), frame children can't fill (validate error; the fold treats it as hug to stay total). K2's downward context grows to the `{direction, crossAxis, frame?}` 3-tuple — children of a frame emit `absolute left-[x] top-[y]` + fixed dims instead of flow-sizing classes; `relative` on the frame; still finite. Interaction: dropping into a frame consumes the pointer as the child's position (plain insert plan — no gaps/side-zones/flanks); dragging a frame child is an ATTRIBUTE gesture (S4-resize mold: dashed preview + x,y badge, Escape cancels, release = one updateNode = one undo unit); leaving the frame's box converts one-way into a tree drag, so pulling out (pos stripped) or into another frame rides the ordinary computeDrop path; entering a frame coerces fill→hug and defaults pos {8,8} when no point is given (Layers add). Inspector gains a position section and hides Spec-illegal sizing modes; the schema stays v3 (additive dialect growth — an older parser rejects `<Frame>` loudly, never corrupts silently). This is the authoritative spec for building Sketch; it supersedes chat discussion. Positioned as **layer 2** of the v2 four-layer model:

```
想清楚      画出来      装起来       看明白
Blueprint → Sketch  →  Patchboard → Atlas
产品意图     界面结构     系统架构       代码现状
(prescriptive ─────────────────►)   (descriptive return edge)
```

Reference implementation (TypeScript — and per the K3 corollary, the implementation that *ships*; since Rev 4 Rust holds no mirror at all): `packages/sketch-core` (`spec.ts` / `theme.ts` / `emit.ts` / `to-element.ts` / `validate.ts` / `markup.ts` / `id-policy.ts`). Suite as of Rev 4: **66 green** (codegen + parity incl. repeat + validate + the dialect's law suite + id policy), **149 enumerated finite-alphabet points**.

---

## 1. What Sketch is — and isn't

- Sketch is the **界面结构** layer. It is **domain-relevant, not universal**: backends, CLIs, and data pipelines have no UI, so their Sketch layer is *empty* (Drafting's own Rust backend has none). **The model must allow a layer to be absent.**
- The three prescriptive layers are **projections in a loop, not stages in a pipeline**. Blueprint/Sketch/Patchboard are top-down (what you're designing); Atlas is bottom-up (what the code is). Sketch → generated code → Atlas → verdict closes the diagram on itself.
- **Build decision — lean (A): Sketch ships as a standalone subsystem** (own Spec, storage, codegen; bound to Blueprint by reference), *not* as a projection of a unified typed model. Rationale: Drafting has **no** unified typed model today — Blueprint (`.blueprint.md`) and Patchboard (Socket/Adapter registry) are SyncBus-coordinated **independent subsystems**, never built as projections. "One model, three projections" is a north star; unifying it is a **separate v2.x+ architecture effort** (likely where the Polaris typed-model line converges). Sketch must not be the one forced to pioneer it. This matches how Blueprint/Patchboard were actually built.

## 2. Three keystones (the load-bearing invariants)

**K1 — The tree is truth.** Layout is an **auto-layout tree** (containers + `hug`/`fill`/`fixed` sizing), **never absolute coordinates**. Coordinates (`x=40,y=220`) don't encode intent; a good `<button>` from coordinates needs a heuristic/AI to *guess* the layout — reinjecting the very probabilistic step the design exists to remove. A tree → Tailwind flex is a pure, total, byte-stable map. The editor may let you drag freely, but the drag **snaps into the tree**; the stored `.sketch` document is the tree, not coordinates.

**K2 — Codegen is a finite, pure fold.** tree → React/Tailwind is a structural recursion over **finitely many node kinds**; each kind's class emission is a pure function over a **finite attribute alphabet**. The only downward context is the parent's `{direction, crossAxis}` (a fixed 2-tuple). **AI appears nowhere on this path.** Because the alphabet is finite, the fold is **finite-state deterministic** → each mapping function's domain is *exhaustively* testable and codegen correctness is decidable. (The one open dimension — `fixed` px — is isolated in a single escape hatch and doesn't break this.)

**K3 — One IR, two serializers.** `toIR` (the design's `describe`) is the **only** place that decides tag + className + nesting. `toJsxString` (→ file/codegen) and `toElement` (→ editor canvas) are **trivial projections** of that IR. So the canvas and the shipped code share every structural decision — **WYSIWYG is constructional, not a hope the tests protect.** Parity test = "both serializers yield identical `(tag, className, data-sk)` from one IR," which is near-tautological by design.

**K4 — The text is the document (Rev 4).** The `.sketch` markup file IS the sketch; canvas, Inspector, outline, and drag are **views** over it. Every structured edit routes parse → mutate → canonical print → write-back into the text buffer, so there is exactly ONE undo stack — the buffer's — shared with typing. The dialect's laws make this safe rather than hopeful: parse is total on the finite alphabet with positioned errors for everything outside it, the canonical printer is a fixpoint, and `parse∘print ≡ id`. Constraint 23 translates to text as **loud refusal**: the dialect has no "unknown attribute rides along" — anything it can't represent is a positioned error at parse time and a named refusal at migration time, never a silent drop. (This replaces the JSON mirror's flatten-extras fidelity model.)

**K3 corollary — one codebase, not just one function.** The IR decider ships as a single shared TS package consumed by **both** the editor canvas (frontend) and codegen (the existing Node codegen-server). There is deliberately **no Rust port** of `toIR`/emit: a second-language implementation would split "the only place that decides" across languages, explode the parity matrix (2 languages × 2 serializers), and reintroduce hand-sync drift at the *behavior* level — the exact bug class K3 exists to foreclose. Rust owns Spec serde + storage + index only; **it never computes a className.**

## 3. The Spec (data model)

Stored as `sketches/*.sketch` — the markup dialect (§3.2, schema v3). The TS types below remain authoritative for the tree's SHAPE; since Rev 4 the Rust serde mirror is retired (no Spec tree crosses the Tauri boundary — the frontend parses text itself, Rust exchanges entity metadata only).

```typescript
// A Sketch = one screen, bound to a Blueprint feature (child-points-to-parent).
interface Sketch { id: SketchId; name: string; blueprintRef: FeatureId | null; root: Container; schemaVersion: number; }

type Node = Container | ListP | Primitive;   // the auto-layout tree (ListP: §3.1)

interface Container {
  kind: "stack";                     // grid PARKED (needs its own track-sizing model)
  id: string;                        // stable ULID — see §6 addressing
  layout: Layout; sizing: Sizing; style?: Style; children: Node[];
}
interface TextP   { kind: "text";   id: string; role: TypeToken; content: string | Bind; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
interface ButtonP { kind: "button"; id: string; label: string; variant: ButtonVariant; sizing: Sizing; style?: Style; intent?: Intent; semantics?: SemanticDecl; }
interface InputP  { kind: "input";  id: string; label: string; placeholder?: string; type: "text"|"email"|"password"; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
interface ImageP  { kind: "image";  id: string; src: string | Bind; alt: string; sizing: Sizing; style?: Style; semantics?: SemanticDecl; }
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

### 3.2 The markup dialect (schema v3, Rev 4)

A restricted **XAML-shaped** text form — the shell is XAML's, the vocabulary is OURS (never WPF attribute names). Single implementation in `packages/sketch-core/src/markup.ts`; the reference implementation's law suite carried over.

```
<Sketch sk:id="…" name="…" blueprintRef="…"? schemaVersion={3}>   ← entity fields' home
  <Stack dir="row"? gap={4}? pad={6}? main="…"? cross="…"? w h bg fg border radius>
    <Text role="heading" …>content</Text>
    <Button variant intent …>label</Button>          intent = none|submit|navigate|navigate:<sketchId>
    <Input label type placeholder … />
    <Image src alt … />
    <List dataKey w h …>
      <ItemShape><Field name type key? /></ItemShape>   ← inline shape; key = the React row key
      <d:Sample field=value … />                        ← sample rows, typed by the shape
      <Template>…one Stack…</Template>                  ← binds: {Bind field}, lookup-only
    </List>
  </Stack>
</Sketch>
```

- **Laws:** parse total on the alphabet, positioned errors otherwise (unknown elements/attrs name the allowed set, enums name the alphabet, off-ramp spacing names the ramp, "the dialect has no expressions" is said in those words); canonical print = fixed attribute order, defaults omitted, 2-space indent, empty elements self-close; `parse∘print ≡ id`, print is a fixpoint.
- **Values:** strings `"…"` (XML entities; `{` escapes as `&#123;`), numbers `{N}`, binds `{Bind field}` (template-only; undeclared fields are positioned errors). `w/h`: `"hug" | "fill" | {px}`. `pad`: `{N}` uniform (canonical) | `"v h"` | `"t r b l"` — the Spec's Edges are per-edge; a uniform-only pad would strand non-uniform v2 documents. `border="thin|thick <color>"`. `d:Sample` booleans are `"true"/"false"`, numbers `{N}`.
- **Reserved prefixes** (parser-validated, not real namespaces): `sk:id` = persisted identity (§6); `d:` = design-time data.
- **No comments in v3** — `<!--` is a positioned rejection; comments stay parked (a future rev needs a preservation story before admitting them: K4's round-trip law must hold).
- **`semantics` has no spelling** — nothing writes it today; the migrator refuses such files loudly.
- **Migration (v2→v3):** at project open, each `*.sketch.json` is parsed, canonically printed, REPARSED and verified tree-equivalent (key-order-independent, every ULID preserved, spelling variants canonicalized: absent intent ≡ none, none-border ≡ absent, empty placeholder/style ≡ absent) before the `.sketch` is written and the original renamed to `.sketch.json.bak` — kept, never deleted. Refusals (unparsable JSON, semantics, equivalence failure) leave originals untouched and reach the user in the migration report toast. Idempotent.

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

- **Files:** `sketches/*.sketch` (markup, §3.2), flat (no nested dirs — parallel to flat blueprint features), **in git**. Also in git: `criterion.sketch_node` (inside `.blueprint.md`), generated React, `tokens.default.json`, and post-migration `.sketch.json.bak` originals until the user removes them. Everything needed to use the project is versioned.
- **Generated-file landing & ownership (constitution delta):** one file per sketch at `packages/ui/src/generated/<sketch>.generated.tsx` (package name lean: `ui`) — **tool-owned, regenerated wholesale** (the sockets/wiring rule); a sibling `packages/ui/src/<sketch>.tsx` (imports the generated component, owns handler wiring) is **generated once, then user-owned** (the adapter-skeleton rule). **Off-monorepo self-heal (Rev 3, smoke-rehearsal decision A):** the landing convention is layout-independent; the *scaffold* adapts — a host without `tsconfig.base.json` gets a self-contained inline ui tsconfig (extending a missing file is an instant TS5083), and a host without `pnpm-workspace.yaml` gets the wiring instructions in the sibling's header comment. Note the landing path is currently derived in three places (codegen-server, `blueprint/bindings.rs` artifact resolution, `sketch/storage.rs` delete) — change all three together or hoist a shared constant first. Two v2 amendments to the v1 constitution follow and are recorded here so they're a decision, not an accident: Part 6 §2 ("only Patchboard writes `packages/`") gains Sketch's generated zone, and the package-ownership table gains `packages/ui` (`src/generated/` tool-owned, rest user-owned).
- **Bindings — child-points-to-parent is the *only* authoritative edge:**
  - Sketch→feature: `Sketch.blueprintRef` authoritative. Feature does not back-point.
  - criterion→node: **`criterion.sketch_node = {sketch_id, node_id}`** authoritative. Node doesn't know who verifies it.
  - **`sketch_node` serialization (pinned):** it rides the criterion's *existing* end-of-line marker comment, extended to a field grammar — `<!-- #01ULID sk:sk_a1/node_8f3a -->`, i.e. `#<criterion-id>` followed by space-separated `key:value` fields, **unknown fields preserved verbatim on round-trip**. One marker channel, one grammar — no second comment to escort through the parser. Three obligations, all zero-debt-zone tested: (1) the marker parser accepts and re-serializes unknown fields byte-identically (round-trip safety, Blueprint constraint 23); (2) the **frontend `AcceptanceCriterion` type carries `sketchNode?`** and structured-view saves preserve it — the 9eada7c lesson verbatim: an optional field the frontend doesn't carry is a field the next save silently deletes; (3) writes stay blueprint-domain (the file is `.blueprint.md`).
  - All reverse lookups (a feature's sketches; a node's criteria) come **from the index only**, never stored as a second truth. This structurally forecloses "two places written, mismatched" — the same-family bug as the S5 placeholder.
- **`.sketch-index.json` — pure cache, NOT in git.** It's 100% recomputable from the entities; `rebuild_index` is that function. Git should store the **non-recomputable** (truth); versioning a derived file duplicates information and produces (a) meaningless merge conflicts — the correct answer is "rescan the merged entities," not in either text side — and (b) **false consistency**: a text-merged index that's syntactically clean but semantically stale = silent drift. Rebuild on load, hooked to the existing startup-rebuild (with a `sketches/` guard, same as the blueprint `blueprints/` guard). *(Contrast: the Blueprint `index.json` IS in git — justified by offline-readability. `.sketch-index.json` is a reverse-lookup table, useless without tooling → cache, not document. Different treatment is deliberate, not an inconsistency.)*
- **Git recovery uses zero AI.** `rebuild_index` is a deterministic file scan (ms, no network). Once a Spec is `.sketch.json`, everything downstream (`.sketch.json` → codegen → React) is the finite pure fold. Anyone, anytime, restoring from git gets the identical deterministic product. AI is *not* on the recovery path — that's the payoff of confining AI to one upstream cell.
- **Node-id stability (criteria's anchor) — Rev 4 revision: persist-on-need** (supersedes Rev 3's heal-on-load; the x:Name precedent):
  1. A node's id reaches the file (`sk:id`) only when something EXTERNAL needs it stable: **(a)** a criterion binds to it — minted at the bind action, and the sketch file is **flushed before** the blueprint domain writes its marker (§6 write order); **(b)** `intent≠none` anywhere — the generated `SketchHandlers` literal key must survive reprints; **(c)** `{Bind}`/intent inside a template — plural data-sk addressing. The policy is ONE pure module (`id-policy.ts`), enforced at the save chokepoint for (b)/(c). Everything else carries a session-temp id (`~N`, doc order) that never reaches disk — unedited nodes never churn keys or diffs because the document reflowed. (Accepted noise: temp ids DO flow into generated `data-sk`, so inserting a node shifts later temp ids and the write-only generated file diffs on unreferenced nodes — nothing addresses them, documented not fixed.) Existing ULIDs are never touched; migration keeps every v2 id; "unreferenced-id cleanup" is a future EXPLICIT command, not behavior. The Sketch ENTITY id is always needed (index, criterion refs) — a hand-written file without one gets it healed on first open. `schemaVersion` forward migration within v3 rides the same editor open-heal-save path (the v2→v3 hop is the migrator's).
  2. **delete → dangling, not cascade** — a criterion pointing at a deleted node enters a `dangling` state; the Inspector surfaces "the node it verified is gone" for a human to re-bind/drop. Dangling is a signal, not an error.
  3. persisted ids are invariant across move/attribute-edit; only real delete invalidates.
- **Write invariant (satisfies the parked read/write review):** Sketch storage writes only `sketches/**` + the index; `criterion.sketch_node` is written by **blueprint** storage (it already owns `.blueprint.md` write-back). **No cross-writes.** A bind action (Inspector: bind criterion→node) writes the **criterion half** (blueprint domain); the Sketch domain only *reads* whether the node exists. The boundary is "who writes whose directory."

**Index shape** (cache, rebuildable — since Rev 4 rebuilt from the codegen-server's `scanSketches` RPC, because the dialect's only parser is sketch-core; a late rebuild is legal for a cache):
```jsonc
{ "byFeature":      { "feat_login": ["sk_a1"] },              // feature -> sketches (reverse)
  "idToFile":       { "sk_a1": "sketches/login.sketch" },     // Rev 4: bindings resolve through this cache
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

### 7.2 Text-primary editing (Rev 4 — K4's surface)

The `.sketch` text pane is the PRIMARY editing surface; canvas, Inspector, outline and drag remain as co-pilot views. The mechanics:

- **One write path.** Every structured edit routes parse → mutate → `ensurePersistentIds` → canonical print → `executeEdits` into the Monaco buffer. **One undo stack** — ⌘Z reverts an Inspector change, a drag drop, or typed characters interchangeably (verified end-to-end: tree and text revert in lockstep, canonical form restored).
- **Dialect errors are inline.** `MarkupError` carries line/col → Monaco markers; the status bar states valid / canonical-form / error@line:col; **Format** = the canonical printer. While the document is outside the dialect the canvas keeps rendering the last good parse and structured edits DISABLE — editing a stale tree would clobber the user's text.
- **Selection sync both ways.** Canvas/outline selection reveals and highlights the node's source range (the parse's ranges sidecar — ranges never enter the Spec); the text cursor selects the innermost containing node on the canvas. Selection survives reprints by tree-path remapping (session-temp ids reassign by document order).
- **Saves are the text as typed** — canonical or not, parsable or not. An out-of-dialect save degrades loudly downstream (scan names the file, codegen logs the failure) and heals when the text does; refusing to save would be data loss.

### 7.1 Free-drag, narrowed (Rev 3)

The parked §9.1 interaction shipped at a deliberately smaller scope. **Scope law: drag only *expresses* tree operations; it never *infers* structure.**

- **In:** palette → canvas insertion; existing-node drag for same-parent reorder and cross-container reparent — one indicator (nearest gap on the target's main axis, deepest stack container under the pointer wins); landing on a primitive means "its parent container, at that child's slot"; an explicit **Wrap in Stack** command on the selection replaces every auto-wrap heuristic.
- **In (second pass — the sanctioned side-drop):** dropping in the outer **25% cross-axis zone** of a **leaf** sibling (left/right in a col parent, top/bottom in a row parent), **or in the flank strip beside any sibling** (within its main-axis extent but outside its box — the empty area a narrow fixed/hug child leaves on its side, unambiguous because siblings never overlap on the parent's main axis), wraps exactly `{target, dragged}` in **one** perpendicular stack — the sole structure creation a drop can perform, and it is *decided by pointer geometry* (`computeDrop`), never by layout analysis. Containers never trigger the on-box zones (a point inside one routes to the ordinary deeper insertion), the dragged subtree can't wrap with itself, and the middle band of a child's own box keeps gap semantics. Wrapper defaults: gap 2, padding 0, crossAxis center (row) / stretch (col). Regret path is manual: drag the child back out and delete the leftover wrapper — no auto-unwrap (structure *removal* inference stays out).
- **In (third pass — the spread amendment, 2026-07-11):** the two wrap geometries now *say different things*, fixing the "nothing can land past the midline" friction (drops beside narrow siblings always huddled left because the hug wrapper carried both to the container's cross-axis start). Pointing **at the leaf** (its on-box side zone) means *snuggle*: wrapper keeps `mainAxis start`, adopts the target's sizing — the pair sits together (icon+label). Pointing **at the empty flank** means *apart, over there*: the wrapper takes `mainAxis between` **+ main-axis fill** (cross-axis sizing still adopted), so the dragged node lands at the far side the pointer named. Both remain pure pointer geometry (`DropPlan.spread`), still zero structure inference; the alignment vocabulary was already in the alphabet (`Layout.mainAxis`), the drop merely *expresses* it. Indicator tells the truth per case: snuggle = the target's joined half; spread = the **parent's** far half at the target's band — the zone sits where the node will actually land. After a snuggle wrap a one-shot **"⇄ 两端分开" hint chip** on the fresh wrapper offers the spread attributes (`between` + fill) as a single-undo click — discoverability for the same vocabulary; dismissed by any press/Escape/doc switch, never auto-applied. Known limit (accepted): drops in the empty strip *below* all content are ordinary root-column insertions (left-aligned) — there is no sibling there to pair with; going right requires a sibling's band or the Inspector's mainAxis.
- **Out (delete on sight):** dropping on empty canvas creating structure (it's a no-op — `computeDrop` returns null off-sheet), marquee selection, any auto-wrap beyond the explicit side-zone rule above, layout inference of any kind.
- **Mechanics:** the decision is a pure function — `computeInsertion(point, layoutBoxes) → { containerId, index }` (+`indicatorRect`), DOM-free and unit-tested (row/col, edges, nesting, empty containers, subtree exclusion). The event layer only collects the pointer, measures rendered `[data-sk]` boxes once per drag, and dispatches the *existing* tree ops (`insertNodeAt` / `moveNodeTo`). Boxes are per rendered element, so template instances (plural data-sk) resolve to the template container — dropping into any instance edits the template, and all instances update. Pointer events, not HTML5 DnD (the Tauri webview intercepts native drag/drop). Self-nesting is excluded at candidacy (the dragged subtree can't receive itself); the sketch root and template roots don't drag.
- **Canvas surface honors ROOT_CTX** (post-rehearsal fix): the sheet the canvas renders into is a flex column, so the root's screen-column premise (`flex-1`/`self-stretch`) actually stretches and the root's box covers the whole sheet. Consequence for drag: the visually-empty area below the content **is** the root container, so dropping there appends to the root via the ordinary insertion rule — no whitespace special case exists, and points outside the sheet remain no-ops. A ghost chip (the dragged kind) follows the cursor and the cursor switches to grabbing — affordance only; the indicator still owns the drop decision.

## 8. How Sketch closes into v1.5

Generated React becomes 代码现状 (Atlas) the moment it lands; criteria verify UI acceptance conditions against it via `data-sk`. **Sketch sits *on* the intent↔reality loop, not beside it.** Editor autosave is one more FileSaved producer feeding the same verdict/drift machinery (S2–S6).

Three seams make this real rather than aspirational (the first is S2's lesson — an event type without a publisher is a dead wire; the second is the S0.2 signature seam doing what it was left open for):

- **Sketch storage publishes its own FileSaved.** Editor autosave goes through the Sketch save command (Rust), which publishes `FileSaved{sketches/x.sketch.json}` on the bus — it does **not** ride `editor_write_file`. Regeneration subscribes **debounced** (lean: 500ms trailing) so an autosave burst costs one codegen.
- **Binding resolution extends `artifacts_for` (the S0.2 signature seam).** A sketch-bound criterion's artifact set resolves to `[sketches/<sketch>.sketch.json, <generated file>]` — then the S0.3 reverse index, S5 drift, and the estimator work **unchanged**: edit a sketch (or its generated file) and bound criteria go stale/drift exactly like code-bound ones.
- **MVP already ships one deterministic signal:** dangling detection ("the bound node exists") is a decidable check on the Spec tree, surfaced in the Inspector and as check evidence. Richer structure assertions are parked (§9.6).

## 9. Parked (explicit, ordered)

0. **Dialect comments** — v3 rejects `<!--` precisely. Admitting comments requires a preservation story (where do they re-attach after a structured edit's reprint?) or K4's round-trip law breaks. Own design spade.
0b. **Unreferenced-id cleanup** — an explicit command that strips `sk:id` from nodes nothing references. Deliberately NOT behavior (persist-on-need only constrains NEW ids; existing ULIDs are grandfathered).

1. **Free-drag snap-into-tree** — ~~parked~~ **shipped in Rev 3 at a narrowed scope** (§7.1: drag expresses tree ops; no structure inference), then extended with the bounded side-drop wrap (§7.1 second pass). Still parked from the original ambition: merge-into-existing-wrapper heuristics, marquee selection, drag-drawn containers, auto-unwrap.
2. **AI input chain** — hand-draw → geometry recognition → AI semantics → `proposed` + Inspector reconcile. The **only** probabilistic cell in Sketch; upstream and **optional** (preset primitives skip it, landing directly in the Spec).
3. **typed-patch undo** — vs snapshot (see §10). Aligns with the Polaris typed-model motif.
4. **sketch-embeds-sketch component reuse**; multi-feature dashboard pages (compose via sketch composition, since binding is sketch-level).
5. **grid** container — implementation parked, but the track-sizing model is now PINNED (Rev 4, from the WPF reference): each row/column track is `Auto | * | <px>` — exactly our `hug | fill | fixed` alphabet lifted from node sizing to track sizing, mapping to CSS grid `auto | 1fr | <N>px`. K2's finiteness and the exhaustive-test discipline extend unchanged; cell assignment is the child's `row/col` (+span) attributes. Un-parking is an implementation spade, not a design spade. Also parked: breakpoints/responsive; multi-theme + per-project token override; index incremental update. (`navigate` target payload shipped in Rev 3 as `intent="navigate:<sketchId>"`.)
6. **Structure-assertion sensor** — a tiny decidable assertion language over the Spec tree (`node exists ∧ kind==button ∧ intent==submit`) as a Sketch-native deterministic leg for sketch-bound criteria, feeding the S4 fusion ahead of the LLM. MVP ships only the existence check (= dangling detection); the assertion language needs its own design spade.

## 10. Deferred micro-decisions (non-blocking; current leans)

- **`.sketch-index.json` in git:** **resolved — NO** (cache; see §6).
- **Dangling criterion presentation:** lean per-selection in Inspector (follows selection), not a top-of-load banner.
- **Undo strategy:** lean snapshot first, typed-patch later.
- **Canvas in-place edit** (double-click text): lean Inspector-only first (single write path), in-place later.

## 11. The WPF reference ledger (Rev 4)

Sketch and WPF/XAML converged on the same model independently (declarative element tree, Auto/\*/px ≈ hug/fill/fixed, design-time data). What we took, adapted, and refused — recorded so future "should we look at WPF again" questions start here:

| 判定 | 项 | 落点 |
|---|---|---|
| **原样收** | 文档模型（XAML 文本 ⇄ 设计器双视图，文本为主） | K4 + §7.2 — the whole Rev 4 spade |
| **原样收** | `x:Name`（命名是显式行为，不是自动分配） | persist-on-need `sk:id` (§6) |
| **原样收** | `d:` 设计时数据岛（design-time DataContext） | `<d:Sample>` rows in the Spec (§3.2) |
| **改造收** | 事件接线（WPF 的 `Click="Handler"` 字符串接线） | REFUSED as strings; the typed **sibling file** + `SketchHandlers` literal keys stay — tsc catches stale wiring, strings can't |
| **拒收（带案底）** | 拖拽生成 `Margin`（设计器把布局意图翻译成魔法边距） | violates K1 — layout intent lives in the tree, drops express tree ops (§7.1) |
| **拒收（带案底）** | `{Binding}` 表达式语言（converter/path/ElementName 的图灵泥潭） | the dialect has no expressions — `{Bind field}` is a LOOKUP against a declared shape; anything richer is the sibling's TypeScript |
| **拒收（带案底）** | Styles/Triggers/Resources 资源系统 | the token system (§5) is the styling model: finite, enumerable, theme-swappable; a resource cascade would break K2's decidability |

## 12. Sketch Lite (Phase 1, 2026-07-13) — the low-fidelity intent surface

> **2026-07-13 second pass(用户拍板):Lite 完全替代 sketch 工作面。** 入口与列表/创建窗口不变;打开/新建 sketch 直接进 Lite(一文档一张草稿,会话内按文件暂存);Generate UI 写进**当前**文档(replace-active,一步撤销)并自动切到「预览」页签 —— 现有运行时画布在 Lite 内渲染结果。旧设计器 chrome(palette/layers/dock/多 tab 工具栏)不再路由,代码保留(预览复用 SketchCanvas);`.sketch` 文本仍是真相,codegen 照常。**能力后果**:designer Inspector 的 criteria 绑定、Frame 手势编辑、结构化树操作暂时没有入口 —— 若需要,决策是「预览页签升级为完整设计器」或「按需重新路由」,待用户排程。

**用户画个大概,AI 补全设计。** Sketch Lite 是画在 Spec 之上的输入面,不是第二个设计器,更不是 Figma:矩形 + 注释 + 页级 prompt,仅此而已。它的产物不是真相 —— 真相仍然是 `.sketch` 文本;Generate UI 的终点是一份**合法的现有 Spec 文档**,落进设计器(可编辑、可撤销、可 codegen)。

管线(四层分离,层与层不许混):`SketchDocument →` **analyzeGeometry**(确定性:方位/包含/重叠/对齐/横排分组,画布相对容差)`→` **interpretSketch**(今天是确定性 mock、明天换 AI,接口不变:hint 当先验、几何原型当证据 —— 宽顶=header、高左=sidebar、相似横排=card_group、包含=children;说不清的进 `ambiguities`,绝不静默瞎猜)`→` **UI Intent**(语义层:role/layout/content)`→` **compileIntent**(确定性编译进现有字母表,px 吸附到 spacing 档;合同 = `validate() === []` + 方言往返)。原则:可测量的几何绝不问 AI;AI 只解释语义;编译器只执行。

落点:`generateFromLite`("new-doc" 建真文件写入,创建失败响亮抛错绝不覆盖当前文档;"replace-active" 供 harness)。UI 临时态(工具/选中/手势)与 SketchDocument 严格分离。Phase 1 有意不做:钢笔/路径/图层面板/吸附/像素级还原 —— 草图不是最终 UI。AI 接入点 = 替换 interpret/generate-intent 两个 mock 的实现体(经 AI Provider Manager 走任务路由),类型与管线两侧零改动。

## Appendix — reference implementation status

The TS reference (`emit.ts` = class core + `toIR` + `toJsxString`; `to-element.ts` = the injected-`createElement` serializer; `spec.ts`; `theme.ts`) is, per the K3 corollary, the implementation that ships — extracted into a shared TS package consumed by both the frontend canvas and the codegen-server. Tests: **27 codegen** (141 finite-alphabet points enumerated for totality + goldens) + **3 parity** (both serializers, one IR) = **30 green**. Next build step when resumed: extract the reference into the shared package (**no Rust port of the class core**), then `apps/desktop` Rust gets Spec serde + storage (heal-on-load, write-back) + index rebuild only, with serde round-trip tests; the exhaustive + parity suites stay in TS, where the fold lives.
