/**
 * The Sketch Spec — data model (docs/sketch-design.md §3).
 *
 * This TS is authoritative; the Rust `serde` mirror in
 * apps/desktop/src-tauri/src/sketch/types.rs is isomorphic and never
 * computes anything from it (K3 corollary: Rust owns storage only).
 */

export type SketchId = string;
export type FeatureId = string;

/** A Sketch = one screen, bound to a Blueprint feature (child-points-to-parent). */
export interface Sketch {
  id: SketchId;
  name: string;
  blueprintRef: FeatureId | null;
  root: Container;
  schemaVersion: number;
}

export type SketchNode = Container | Primitive; // the auto-layout tree

export interface Container {
  kind: "stack"; // grid PARKED (needs its own track-sizing model)
  id: string; // stable ULID — §6 addressing
  layout: Layout;
  sizing: Sizing;
  style?: Style;
  children: SketchNode[];
}

export interface TextP {
  kind: "text";
  id: string;
  role: TypeToken;
  content: string;
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
  src: string;
  alt: string;
  sizing: Sizing;
  style?: Style;
  semantics?: SemanticDecl;
}
export type Primitive = TextP | ButtonP | InputP | ImageP; // MVP primitive set: 4 atoms

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
export const MAIN_AXES: readonly Layout["mainAxis"][] = ["start", "center", "end", "between"];
export const CROSS_AXES: readonly Layout["crossAxis"][] = ["start", "center", "end", "stretch"];
