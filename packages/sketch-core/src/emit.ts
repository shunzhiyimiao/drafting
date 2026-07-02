/**
 * The fold (docs/sketch-design.md §4) and K3's single decider.
 *
 * `toIR` is the ONLY place that decides tag + className + nesting.
 * `toJsxString` (→ file/codegen) here and `toElement` (→ editor canvas, in
 * to-element.ts) are trivial projections of that IR — WYSIWYG is
 * constructional. The only downward context is the parent's
 * `{direction, crossAxis}` 2-tuple (K2).
 */
import type {
  Container,
  Edges,
  Layout,
  Sizing,
  Sketch,
  SketchNode,
  TypeToken,
} from "./spec.js";
import { fgClass, mergeVariantStyle, styleClasses, type Theme } from "./theme.js";

// ---------------------------------------------------------------------- IR --

export interface IRNode {
  tag: string;
  className: string;
  /** The Spec node id; every node's root element carries it (§6: criteria
   *  verification, Atlas addressing, editor selection). Inner elements of a
   *  composite primitive (input's span/input) carry none. */
  dataSk: string | null;
  attrs: Record<string, string>;
  /** Node id when intent≠none — keys the generated handlers map. */
  handlerId: string | null;
  /** Leaf text; a node has either text or children, never both. */
  text: string | null;
  children: IRNode[];
}

export interface ParentCtx {
  direction: Layout["direction"];
  crossAxis: Layout["crossAxis"];
}

/** The root renders as a screen column (lean, documented): a col that
 *  stretches its children — so root-level `fill` widths behave as expected. */
export const ROOT_CTX: ParentCtx = { direction: "col", crossAxis: "stretch" };

// -------------------------------------------------------------- class core --

/** Sizing classes, relative to the parent's main axis (§4). */
export function sizingClasses(sizing: Sizing, parent: ParentCtx): string[] {
  const mainIsWidth = parent.direction === "row";
  const main = mainIsWidth ? sizing.width : sizing.height;
  const cross = mainIsWidth ? sizing.height : sizing.width;
  const mainLetter = mainIsWidth ? "w" : "h";
  const crossLetter = mainIsWidth ? "h" : "w";
  const out: string[] = [];
  if (main.mode === "hug") {
    out.push("shrink-0");
  } else if (main.mode === "fill") {
    out.push("flex-1");
  } else {
    out.push(`${mainLetter}-[${main.px}px]`, "shrink-0");
  }
  if (cross.mode === "hug") {
    // Opting out of the parent's stretch is only needed when it stretches.
    if (parent.crossAxis === "stretch") out.push("self-start");
  } else if (cross.mode === "fill") {
    out.push("self-stretch");
  } else {
    out.push(`${crossLetter}-[${cross.px}px]`);
  }
  return out;
}

/** Padding collapse: `p-` / `px-,py-` / per-edge (§4). */
export function paddingClasses(p: Edges): string[] {
  if (p.top === p.right && p.right === p.bottom && p.bottom === p.left) {
    return [`p-${p.top}`];
  }
  if (p.top === p.bottom && p.left === p.right) {
    return [`px-${p.left}`, `py-${p.top}`];
  }
  return [`pt-${p.top}`, `pr-${p.right}`, `pb-${p.bottom}`, `pl-${p.left}`];
}

const JUSTIFY: Record<Layout["mainAxis"], string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
const ITEMS: Record<Layout["crossAxis"], string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

function dedup(classes: string[]): string {
  return [...new Set(classes.filter((c) => c.length > 0))].join(" ");
}

/** Container className — fixed 6-segment order + sizing + style, dedup →
 *  byte-stable string: base(flex) · direction · gap · padding · justify · items. */
export function containerClasses(c: Container, parent: ParentCtx, theme: Theme): string {
  return dedup([
    "flex",
    c.layout.direction === "row" ? "flex-row" : "flex-col",
    `gap-${c.layout.gap}`,
    ...paddingClasses(c.layout.padding),
    JUSTIFY[c.layout.mainAxis],
    ITEMS[c.layout.crossAxis],
    ...sizingClasses(c.sizing, parent),
    ...styleClasses(c.style, theme),
  ]);
}

const TEXT_TAG: Record<TypeToken, string> = {
  heading: "h2",
  subhead: "h3",
  body: "p",
  caption: "span",
};

/** Button base — a lean, golden-locked choice (the spec pins the mechanism,
 *  not these cosmetics). */
const BUTTON_BASE = [
  "inline-flex",
  "items-center",
  "justify-center",
  "px-4",
  "py-2",
  "text-sm",
  "font-medium",
];

// --------------------------------------------------------------------- toIR --

/** The single decider (K3): Spec node → IR. */
export function toIR(node: SketchNode, parent: ParentCtx, theme: Theme): IRNode {
  switch (node.kind) {
    case "stack": {
      const ctx: ParentCtx = {
        direction: node.layout.direction,
        crossAxis: node.layout.crossAxis,
      };
      return {
        tag: "div",
        className: containerClasses(node, parent, theme),
        dataSk: node.id,
        attrs: {},
        handlerId: null,
        text: null,
        children: node.children.map((child) => toIR(child, ctx, theme)),
      };
    }
    case "text": {
      // Default fg: caption reads muted, everything else reads text (§5).
      const eff = { fg: node.role === "caption" ? ("muted" as const) : ("text" as const), ...(node.style ?? {}) };
      return {
        tag: TEXT_TAG[node.role],
        className: dedup([
          ...theme.type[node.role],
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(eff, theme),
        ]),
        dataSk: node.id,
        attrs: {},
        handlerId: null,
        text: node.content,
        children: [],
      };
    }
    case "button": {
      const merged = mergeVariantStyle(node.variant, node.style);
      const hasHandler = node.intent !== undefined && node.intent.kind !== "none";
      return {
        tag: "button",
        className: dedup([
          ...BUTTON_BASE,
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(merged, theme),
        ]),
        dataSk: node.id,
        attrs: {},
        handlerId: hasHandler ? node.id : null,
        text: node.label,
        children: [],
      };
    }
    case "input": {
      const attrs: Record<string, string> = { type: node.type };
      if (node.placeholder !== undefined) attrs.placeholder = node.placeholder;
      return {
        tag: "label",
        className: dedup([
          "flex",
          "flex-col",
          "gap-1",
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(node.style, theme),
        ]),
        dataSk: node.id,
        attrs: {},
        handlerId: null,
        text: null,
        children: [
          {
            tag: "span",
            className: dedup(["text-sm", fgClass("muted", theme)]),
            dataSk: null,
            attrs: {},
            handlerId: null,
            text: node.label,
            children: [],
          },
          {
            tag: "input",
            className: dedup([
              "border",
              `border-${theme.colors.border}`,
              theme.radius.md,
              "px-3",
              "py-2",
            ]),
            dataSk: null,
            attrs,
            handlerId: null,
            text: null,
            children: [],
          },
        ],
      };
    }
    case "image": {
      return {
        tag: "img",
        className: dedup([
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(node.style, theme),
        ]),
        dataSk: node.id,
        attrs: { src: node.src, alt: node.alt },
        handlerId: null,
        text: null,
        children: [],
      };
    }
  }
}

export function sketchToIR(sketch: Sketch, theme: Theme): IRNode {
  return toIR(sketch.root, ROOT_CTX, theme);
}

/** All handler-carrying node ids, in document order — the literal-key set of
 *  the generated `SketchHandlers` type. */
export function collectHandlerIds(ir: IRNode): string[] {
  const out: string[] = [];
  const walk = (n: IRNode) => {
    if (n.handlerId) out.push(n.handlerId);
    n.children.forEach(walk);
  };
  walk(ir);
  return out;
}

// -------------------------------------------------------------- toJsxString --

export function pascalCase(name: string): string {
  const words = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  const joined = words.join("");
  if (joined.length === 0) return "Sketch";
  return /^[0-9]/.test(joined) ? `Sketch${joined}` : joined;
}

function escapeJsxText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function renderJsx(ir: IRNode, depth: number): string {
  const pad = "  ".repeat(depth);
  const parts = [`<${ir.tag}`, `className="${escapeAttr(ir.className)}"`];
  if (ir.dataSk) parts.push(`data-sk="${escapeAttr(ir.dataSk)}"`);
  for (const key of Object.keys(ir.attrs).sort()) {
    parts.push(`${key}="${escapeAttr(ir.attrs[key])}"`);
  }
  if (ir.handlerId) parts.push(`onClick={handlers["${ir.handlerId}"]}`);
  const open = parts.join(" ");

  if (ir.text !== null) {
    return `${pad}${open}>${escapeJsxText(ir.text)}</${ir.tag}>`;
  }
  if (ir.children.length === 0) {
    return `${pad}${open} />`;
  }
  const kids = ir.children.map((c) => renderJsx(c, depth + 1)).join("\n");
  return `${pad}${open}>\n${kids}\n${pad}</${ir.tag}>`;
}

/** IR → the generated `.generated.tsx` file body (write-only; the sibling
 *  file owns hand code + handler wiring — §4). Byte-stable from the IR.
 *  `sourcePath` is the provenance comment's target — pass the real
 *  project-relative file so the reader knows what regenerates this. */
export function toJsxString(sketch: Sketch, theme: Theme, sourcePath?: string): string {
  const ir = sketchToIR(sketch, theme);
  const handlerIds = collectHandlerIds(ir);
  const component = pascalCase(sketch.name);
  const source = sourcePath ?? `sketches/${sketch.name}.sketch.json`;

  const handlersType =
    handlerIds.length === 0
      ? "export type SketchHandlers = Record<string, never>;"
      : [
          "export type SketchHandlers = {",
          ...handlerIds.map((id) => `  "${id}"?: () => void;`),
          "};",
        ].join("\n");

  return [
    `// AUTO-GENERATED by Drafting Sketch — DO NOT EDIT.`,
    `// Regenerated wholesale from ${source} (data-sk = node id).`,
    ``,
    handlersType,
    ``,
    `export function ${component}({ handlers = {} }: { handlers?: SketchHandlers }) {`,
    `  return (`,
    renderJsx(ir, 2),
    `  );`,
    `}`,
    ``,
  ].join("\n");
}
