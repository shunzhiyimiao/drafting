/**
 * The Sketch Spec — data model (docs/sketch-design.md §3).
 *
 * This TS is authoritative; the Rust `serde` mirror in
 * apps/desktop/src-tauri/src/sketch/types.rs is isomorphic and never
 * computes anything from it (K3 corollary: Rust owns storage only).
 */

export type SketchId = string;
export type FeatureId = string;

/** Current Spec schema. v2 added `list` + data binding; the loader migrates
 *  older versions forward and heal-writes the migrated form back (§3 edge
 *  policy — the same write-back channel as id healing). */
export const SCHEMA_VERSION = 2;

/** A Sketch = one screen, bound to a Blueprint feature (child-points-to-parent). */
export interface Sketch {
  id: SketchId;
  name: string;
  blueprintRef: FeatureId | null;
  root: Container;
  schemaVersion: number;
}

export type SketchNode = Container | ListP | Primitive; // the auto-layout tree

export interface Container {
  kind: "stack"; // grid PARKED (needs its own track-sizing model)
  id: string; // stable ULID — §6 addressing
  layout: Layout;
  sizing: Sizing;
  style?: Style;
  children: SketchNode[];
}

/** A binding expression — legal ONLY inside a list template subtree, where
 *  `bind` names an `itemShape` field (validate() enforces both). */
export interface Bind {
  bind: string;
}
export type BindableString = string | Bind;

export function isBind(v: BindableString): v is Bind {
  return typeof v === "object" && v !== null;
}

export interface TextP {
  kind: "text";
  id: string;
  role: TypeToken;
  /** Literal text, or `{ bind }` inside a list template. */
  content: BindableString;
  sizing: Sizing;
  style?: Style;
  semantics?: SemanticDecl;
}
export interface ButtonP {
  kind: "button";
  id: string;
  label: string;
  variant: ButtonVariant;
  sizing: Sizing;
  style?: Style;
  intent?: Intent;
  semantics?: SemanticDecl;
}
export interface InputP {
  kind: "input";
  id: string;
  label: string;
  placeholder?: string;
  type: "text" | "email" | "password";
  sizing: Sizing;
  style?: Style;
  semantics?: SemanticDecl;
}
export interface ImageP {
  kind: "image";
  id: string;
  /** Literal URL, or `{ bind }` inside a list template. */
  src: BindableString;
  alt: string;
  sizing: Sizing;
  style?: Style;
  semantics?: SemanticDecl;
}
export type Primitive = TextP | ButtonP | InputP | ImageP; // MVP primitive set: 4 atoms

/** One field of a list's item shape. Inline for now; a future spade may add a
 *  child-points-to-parent `blueprintRef` here so the shape can be declared by
 *  (and checked against) Blueprint data — reserved seam, not built. */
export interface ItemField {
  name: string;
  type: ItemFieldType;
  /** Exactly one field per list carries isKey (validate() enforces it) —
   *  it becomes the React `key` of each rendered row. */
  isKey?: boolean;
}

/**
 * A repeated region. The list ONLY renders: it does not fetch, sort, filter,
 * or paginate — all of that is the user-owned sibling file's job, which
 * passes real rows via the generated component's `data.<dataKey>` prop.
 *
 * `sampleRows` is canvas-only sample data and lives IN the Spec so canvas
 * rendering stays a pure function of the file (reproducibility — no runtime
 * randomness, no clock).
 *
 * The generated item type name is a deterministic derivation, not a stored
 * field: PascalCase(dataKey) + "Item" (inbox → InboxItem).
 */
export interface ListP {
  kind: "list";
  id: string;
  itemShape: ItemField[];
  /** The generated component reads `data.<dataKey>` — must be a JS identifier. */
  dataKey: string;
  /** The single-root repeated unit; binds inside it resolve to itemShape. */
  template: Container;
  sampleRows: Record<string, unknown>[];
  sizing: Sizing;
  style?: Style;
}

export interface Layout {
  direction: "row" | "col";
  gap: SpacingStep;
  padding: Edges;
  mainAxis: "start" | "center" | "end" | "between";
  crossAxis: "start" | "center" | "end" | "stretch";
}
export interface Edges {
  top: SpacingStep;
  right: SpacingStep;
  bottom: SpacingStep;
  left: SpacingStep;
}

/** Sizing: hug/fill/fixed. Fixed px is the ONE open escape hatch (§5). */
export type Size = { mode: "hug" } | { mode: "fill" } | { mode: "fixed"; px: number };
export interface Sizing {
  width: Size;
  height: Size;
}

/** Style is FULLY tokenized (no raw values, no classes) — §5. */
export interface Style {
  bg?: ColorToken;
  fg?: ColorToken;
  border?: { width: "none" | "thin" | "thick"; color: ColorToken };
  radius?: RadiusToken;
}

/** Intent = the visual/interaction fact. NOT which adapter it calls (that's Patchboard). */
export type Intent =
  | { kind: "navigate"; to: SketchId | null }
  | { kind: "submit" }
  | { kind: "none" };

/** Inspector data shape — the "human declares what machines can't infer" half. */
export interface SemanticDecl {
  declared: string;
  proposed?: string;
}

// Finite alphabets
export type ItemFieldType = "string" | "number" | "boolean" | "image";
export type SpacingStep = 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24; // == tailwind spacing numbers
export type RadiusToken = "none" | "sm" | "md" | "lg" | "xl" | "full";
export type TypeToken = "heading" | "subhead" | "body" | "caption";
export type ColorToken =
  | "surface"
  | "raised"
  | "text"
  | "muted"
  | "primary"
  | "on-primary"
  | "border"
  | "danger"
  | "on-danger"
  | "transparent";
export type ButtonVariant = "primary" | "secondary" | "ghost";

/** The full alphabets as runtime values — the single source both the
 *  exhaustive tests and the Tailwind safelist generator enumerate (§7). */
export const SPACING_STEPS: readonly SpacingStep[] = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];
export const RADIUS_TOKENS: readonly RadiusToken[] = ["none", "sm", "md", "lg", "xl", "full"];
export const TYPE_TOKENS: readonly TypeToken[] = ["heading", "subhead", "body", "caption"];
export const COLOR_TOKENS: readonly ColorToken[] = [
  "surface",
  "raised",
  "text",
  "muted",
  "primary",
  "on-primary",
  "border",
  "danger",
  "on-danger",
  "transparent",
];
export const BUTTON_VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost"];
export const ITEM_FIELD_TYPES: readonly ItemFieldType[] = ["string", "number", "boolean", "image"];
export const MAIN_AXES: readonly Layout["mainAxis"][] = ["start", "center", "end", "between"];
export const CROSS_AXES: readonly Layout["crossAxis"][] = ["start", "center", "end", "stretch"];
