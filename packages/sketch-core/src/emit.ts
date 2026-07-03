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
  ItemFieldType,
  Layout,
  ListP,
  Sizing,
  Sketch,
  SketchNode,
  TypeToken,
} from "./spec.js";
import { isBind } from "./spec.js";
import { fgClass, mergeVariantStyle, styleClasses, type Theme } from "./theme.js";

// ---------------------------------------------------------------------- IR --

/** Repeat metadata on a list's wrapper IR node. Both serializers project it:
 *  toJsxString emits `{data.<dataKey>.map((item) => …)}`, toElement renders
 *  one template instance per sampleRow. */
export interface IRRepeat {
  dataKey: string;
  /** Deterministic derivation: PascalCase(dataKey) + "Item". */
  itemType: string;
  /** The isKey field → React key of each row; null when the shape is empty
   *  (validate() flags that upstream — the fold stays total). */
  keyField: string | null;
  sampleRows: Record<string, unknown>[];
}

export interface IRNode {
  tag: string;
  className: string;
  /** The Spec node id; every node's root element carries it (§6: criteria
   *  verification, Atlas addressing, editor selection). Inner elements of a
   *  composite primitive (input's span/input) carry none. Inside a repeat,
   *  ALL rendered instances carry the template node's id — the plural
   *  data-sk semantics: selection and criteria address the template node,
   *  and every instance lights up. */
  dataSk: string | null;
  attrs: Record<string, string>;
  /** Attributes whose value is a binding: attr name → itemShape field.
   *  Projected as `attr={item.<field>}` / the sample row's value. */
  attrBinds?: Record<string, string>;
  /** Node id when intent≠none — keys the generated handlers map. */
  handlerId: string | null;
  /** Set when the handler sits inside a repeat: the handler signature
   *  becomes `(item: <itemType>) => void` and invocations pass the row. */
  handlerItemType?: string | null;
  /** Leaf text; a node has either text or children, never both. */
  text: string | null;
  /** Bound leaf text: the itemShape field to interpolate (`{item.<field>}`
   *  / the sample row's value). Mutually exclusive with `text`. */
  textBind?: string | null;
  children: IRNode[];
  /** Present on a list's wrapper node; its single child is the template. */
  repeat?: IRRepeat | null;
}

export interface ParentCtx {
  direction: Layout["direction"];
  crossAxis: Layout["crossAxis"];
  /** Set while folding a list template: feeds handler payload typing ONLY.
   *  Class emission still depends on exactly the {direction, crossAxis}
   *  2-tuple — K2's decidability argument is untouched. */
  repeat?: { itemType: string };
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

/** The generated item type name — a deterministic derivation from `dataKey`
 *  (never a stored field): PascalCase(dataKey) + "Item". */
export function itemTypeName(dataKey: string): string {
  return `${pascalCase(dataKey)}Item`;
}

/** The isKey field name, or null when the shape has none (fold stays total;
 *  validate() flags the Spec upstream). */
function keyFieldOf(list: ListP): string | null {
  return list.itemShape.find((f) => f.isKey)?.name ?? null;
}

/** The single decider (K3): Spec node → IR. */
export function toIR(node: SketchNode, parent: ParentCtx, theme: Theme): IRNode {
  switch (node.kind) {
    case "stack": {
      const ctx: ParentCtx = {
        direction: node.layout.direction,
        crossAxis: node.layout.crossAxis,
        // A template's nested stacks keep the enclosing repeat context.
        ...(parent.repeat ? { repeat: parent.repeat } : {}),
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
    case "list": {
      const itemType = itemTypeName(node.dataKey);
      // The wrapper is a plain column (list has no Layout by design — row
      // spacing belongs to the template's own padding). flex/flex-col are
      // already in the class universe: list introduces no new classes.
      return {
        tag: "div",
        className: dedup([
          "flex",
          "flex-col",
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(node.style, theme),
        ]),
        dataSk: node.id,
        attrs: {},
        handlerId: null,
        text: null,
        repeat: {
          dataKey: node.dataKey,
          itemType,
          keyField: keyFieldOf(node),
          sampleRows: node.sampleRows,
        },
        // The wrapper's single child is the template, folded once. A plain
        // flex column stretches its children (CSS default align-items) —
        // hence the col/stretch template context.
        children: [
          toIR(node.template, { direction: "col", crossAxis: "stretch", repeat: { itemType } }, theme),
        ],
      };
    }
    case "text": {
      // Default fg: caption reads muted, everything else reads text (§5).
      const eff = { fg: node.role === "caption" ? ("muted" as const) : ("text" as const), ...(node.style ?? {}) };
      const bound = isBind(node.content);
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
        text: bound ? null : (node.content as string),
        textBind: bound ? (node.content as { bind: string }).bind : null,
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
        handlerItemType: hasHandler ? (parent.repeat?.itemType ?? null) : null,
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
      const bound = isBind(node.src);
      return {
        tag: "img",
        className: dedup([
          ...sizingClasses(node.sizing, parent),
          ...styleClasses(node.style, theme),
        ]),
        dataSk: node.id,
        attrs: bound ? { alt: node.alt } : { src: node.src as string, alt: node.alt },
        attrBinds: bound ? { src: (node.src as { bind: string }).bind } : undefined,
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

/** Every class the fold can emit — EXCEPT fixed-px arbitrary values
 *  (`w-[Npx]`/`h-[Npx]`, the one open hatch), which the editor canvas shims
 *  to inline style because Tailwind cannot see runtime-composed arbitrary
 *  values. This is the §7 safelist source: Drafting's own tailwind build
 *  embeds these names so the canvas (which composes classes at runtime)
 *  renders. K2's finiteness is what makes this enumerable at all. */
export function classUniverse(theme: Theme): string[] {
  const out = new Set<string>();
  const add = (...cs: string[]) => cs.forEach((c) => out.add(c));

  // container statics + sizing statics
  add("flex", "flex-row", "flex-col", "shrink-0", "flex-1", "self-start", "self-stretch");
  // spacing families over the ramp
  for (const s of [0, 1, 2, 3, 4, 6, 8, 12, 16, 24]) {
    add(`gap-${s}`, `p-${s}`, `px-${s}`, `py-${s}`, `pt-${s}`, `pr-${s}`, `pb-${s}`, `pl-${s}`);
  }
  add("justify-start", "justify-center", "justify-end", "justify-between");
  add("items-start", "items-center", "items-end", "items-stretch");
  // token families over the theme bindings
  for (const c of Object.values(theme.colors)) add(`bg-${c}`, `text-${c}`, `border-${c}`);
  add("border", "border-2");
  for (const r of Object.values(theme.radius)) add(r);
  for (const t of Object.values(theme.type)) add(...t);
  // primitive chrome
  add(...BUTTON_BASE);
  return [...out].sort();
}

/** All handler-carrying nodes, in document order — the literal-key set of
 *  the generated `SketchHandlers` type. `itemType` is set for handlers
 *  inside a list template: their signature is `(item: <itemType>) => void`
 *  (the row the user acted on is the payload). */
export function collectHandlers(ir: IRNode): { id: string; itemType: string | null }[] {
  const out: { id: string; itemType: string | null }[] = [];
  const walk = (n: IRNode) => {
    if (n.handlerId) out.push({ id: n.handlerId, itemType: n.handlerItemType ?? null });
    n.children.forEach(walk);
  };
  walk(ir);
  return out;
}

/** All handler-carrying node ids, in document order. */
export function collectHandlerIds(ir: IRNode): string[] {
  return collectHandlers(ir).map((h) => h.id);
}

/** All lists in the Spec tree, in document order (recursing into templates
 *  keeps this total; validate() rejects nested lists upstream). */
export function collectLists(root: SketchNode): ListP[] {
  const out: ListP[] = [];
  const walk = (n: SketchNode) => {
    if (n.kind === "stack") n.children.forEach(walk);
    else if (n.kind === "list") {
      out.push(n);
      walk(n.template);
    }
  };
  walk(root);
  return out;
}

/** itemShape field type → the generated TS type. `image` is a URL string. */
export const ITEM_FIELD_TS_TYPE: Record<ItemFieldType, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  image: "string",
};

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

/** `keyExpr` decorates a repeat template's root with `key={item.<field>}`. */
function renderJsx(ir: IRNode, depth: number, keyExpr?: string): string {
  const pad = "  ".repeat(depth);
  const parts = [`<${ir.tag}`, `className="${escapeAttr(ir.className)}"`];
  if (ir.dataSk) parts.push(`data-sk="${escapeAttr(ir.dataSk)}"`);
  if (keyExpr) parts.push(`key={${keyExpr}}`);
  for (const key of Object.keys(ir.attrs).sort()) {
    parts.push(`${key}="${escapeAttr(ir.attrs[key])}"`);
  }
  if (ir.attrBinds) {
    for (const key of Object.keys(ir.attrBinds).sort()) {
      parts.push(`${key}={item.${ir.attrBinds[key]}}`);
    }
  }
  if (ir.handlerId) {
    // Inside a repeat the handler receives the row it belongs to.
    parts.push(
      ir.handlerItemType
        ? `onClick={() => handlers["${ir.handlerId}"]?.(item)}`
        : `onClick={handlers["${ir.handlerId}"]}`,
    );
  }
  const open = parts.join(" ");

  if (ir.repeat) {
    // The wrapper's single child is the template; the map is the projection
    // of the SAME template IR the canvas instantiates per sample row (K3).
    const key = ir.repeat.keyField ? `item.${ir.repeat.keyField}` : undefined;
    const template = renderJsx(ir.children[0], depth + 2, key);
    return [
      `${pad}${open}>`,
      `${pad}  {data.${ir.repeat.dataKey}.map((item) => (`,
      template,
      `${pad}  ))}`,
      `${pad}</${ir.tag}>`,
    ].join("\n");
  }
  if (ir.textBind) {
    return `${pad}${open}>{item.${ir.textBind}}</${ir.tag}>`;
  }
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
  const handlers = collectHandlers(ir);
  const lists = collectLists(sketch.root);
  const component = pascalCase(sketch.name);
  const source = sourcePath ?? `sketches/${sketch.name}.sketch.json`;

  // One exported item type per list, in document order. Lists ONLY render:
  // the sibling file supplies real rows via `data.<dataKey>` — fetching,
  // sorting, filtering, pagination are all the sibling's job.
  const seenTypes = new Set<string>();
  const itemTypes: string[] = [];
  for (const list of lists) {
    const name = itemTypeName(list.dataKey);
    if (seenTypes.has(name)) continue; // duplicate dataKeys are a validate() error
    seenTypes.add(name);
    itemTypes.push(
      list.itemShape.length === 0
        ? `export type ${name} = Record<string, never>;`
        : [
            `export type ${name} = {`,
            ...list.itemShape.map((f) => `  ${f.name}: ${ITEM_FIELD_TS_TYPE[f.type]};`),
            `};`,
          ].join("\n"),
    );
  }

  const handlersType =
    handlers.length === 0
      ? "export type SketchHandlers = Record<string, never>;"
      : [
          "export type SketchHandlers = {",
          ...handlers.map(
            (h) => `  "${h.id}"?: (${h.itemType ? `item: ${h.itemType}` : ""}) => void;`,
          ),
          "};",
        ].join("\n");

  // Without lists the signature (and the whole file) is byte-identical to
  // pre-list output — regeneration of an unchanged Spec never churns.
  const seenKeys = new Set<string>();
  const dataFields = lists
    .filter((l) => !seenKeys.has(l.dataKey) && (seenKeys.add(l.dataKey), true))
    .map((l) => `${l.dataKey}: ${itemTypeName(l.dataKey)}[]`);
  const params =
    lists.length === 0
      ? `{ handlers = {} }: { handlers?: SketchHandlers }`
      : `{ data, handlers = {} }: { data: { ${dataFields.join("; ")} }; handlers?: SketchHandlers }`;

  return [
    `// AUTO-GENERATED by Drafting Sketch — DO NOT EDIT.`,
    `// Regenerated wholesale from ${source} (data-sk = node id).`,
    ``,
    ...itemTypes.flatMap((t) => [t, ``]),
    handlersType,
    ``,
    `export function ${component}(${params}) {`,
    `  return (`,
    renderJsx(ir, 2),
    `  );`,
    `}`,
    ``,
  ].join("\n");
}
