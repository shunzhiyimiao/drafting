/**
 * The Sketch markup dialect (Rev 4: text-as-truth) — a restricted
 * XAML-shaped serialization of the Spec. The `.sketch` text file IS the
 * document; canvas/Inspector/tree-ops are views over it.
 *
 * Laws (inherited from the reference implementation, reskinned to the real
 * Spec): parse is TOTAL on the finite alphabet with positioned errors for
 * anything outside it; print is the pinned canonical printer (fixed
 * attribute order, defaults omitted, 2-space indent, empty elements
 * self-close); parse(print(tree)) ≡ tree and print∘parse∘print ≡ print.
 *
 * The XAML shell carries OUR alphabet: elements Sketch/Stack/Text/Button/
 * Input/Image/List (+ List's structural children ItemShape/Field/d:Sample/
 * Template), attributes dir/gap/pad/main/cross/w/h/bg/fg/border/radius/
 * role/variant/intent/label/type/placeholder/src/alt. Reserved prefixes
 * (validated by this parser, not real XML namespaces): `sk:id` = persisted
 * node identity (persist-on-need, Rev 4 §6), `d:` = design-time data.
 * Bindings are `{Bind field}` — a lookup, never an expression.
 *
 * The dialect has no comments (v3): `<!--` is rejected with a positioned
 * error; comments stay parked.
 */
import type {
  Bind,
  ButtonP,
  ColorToken,
  Container,
  Edges,
  FrameP,
  ItemField,
  ItemFieldType,
  Layout,
  ListP,
  Size,
  Sizing,
  Sketch,
  SketchNode,
  Style,
} from "./spec.js";
import {
  BUTTON_VARIANTS,
  COLOR_TOKENS,
  CROSS_AXES,
  ITEM_FIELD_TYPES,
  MAIN_AXES,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_TOKENS,
  isBind,
  SCHEMA_VERSION,
} from "./spec.js";

// ------------------------------------------------------------------ errors --

/** A positioned dialect error. `pos` is a 0-based offset into the source;
 *  line/col are 1-based (Monaco marker coordinates). */
export class MarkupError extends Error {
  pos: number;
  line: number;
  col: number;
  constructor(msg: string, src: string, pos: number) {
    super(msg);
    this.pos = pos;
    let line = 1;
    let col = 1;
    for (let i = 0; i < pos && i < src.length; i++) {
      if (src[i] === "\n") {
        line += 1;
        col = 1;
      } else {
        col += 1;
      }
    }
    this.line = line;
    this.col = col;
  }
}

export interface Range {
  start: number;
  end: number;
}

// -------------------------------------------------------------- alphabets --

const ENUMS: Record<string, readonly string[]> = {
  role: TYPE_TOKENS,
  variant: BUTTON_VARIANTS,
  dir: ["row", "col"],
  main: MAIN_AXES,
  cross: CROSS_AXES,
  type: ["text", "email", "password"],
  bg: COLOR_TOKENS,
  fg: COLOR_TOKENS,
  radius: RADIUS_TOKENS,
};

const STYLE_ATTRS = ["bg", "fg", "border", "radius"] as const;

/** Fixed attribute order per element — the canonical print order.
 *  `x`/`y` (Rev 5 Frame): position attrs, legal ONLY on a <Frame>'s direct
 *  children — the parser rejects them elsewhere with a positioned error.
 *  They sit right after sk:id so a positioned child reads as "what, where". */
const ATTRS: Record<string, string[]> = {
  Sketch: ["sk:id", "name", "blueprintRef", "schemaVersion"],
  Stack: ["sk:id", "x", "y", "dir", "gap", "pad", "main", "cross", "w", "h", ...STYLE_ATTRS],
  Frame: ["sk:id", "x", "y", "w", "h", ...STYLE_ATTRS],
  Text: ["sk:id", "x", "y", "role", "w", "h", ...STYLE_ATTRS],
  Button: ["sk:id", "x", "y", "variant", "intent", "w", "h", ...STYLE_ATTRS],
  Input: ["sk:id", "x", "y", "label", "type", "placeholder", "w", "h", ...STYLE_ATTRS],
  Image: ["sk:id", "x", "y", "src", "alt", "w", "h", ...STYLE_ATTRS],
  List: ["sk:id", "x", "y", "dataKey", "w", "h", ...STYLE_ATTRS],
  ItemShape: [],
  Field: ["name", "type", "key"],
  Template: [],
};

/** Dialect defaults — omitted by the canonical printer, filled by parse.
 *  These are a property of the TEXT FORM (what you may leave unwritten),
 *  independent of what the editor palette inserts. Frame has no flow layout
 *  (no gap/pad/axes) and its height defaults to a fixed 200 — absolute
 *  children give it no intrinsic size, so `hug` is meaningless there.
 *  x/y are NOT here: they default to 0 under a Frame (position is always
 *  printed) and are illegal everywhere else. */
const DEFAULTS: Record<string, Record<string, string | number>> = {
  Stack: { dir: "col", gap: 0, pad: 0, main: "start", cross: "stretch", w: "fill", h: "hug" },
  Frame: { w: "fill", h: 200 },
  Text: { role: "body", w: "hug", h: "hug" },
  Button: { variant: "secondary", intent: "none", w: "hug", h: "hug" },
  Input: { label: "", type: "text", placeholder: "", w: "fill", h: "hug" },
  Image: { w: "hug", h: "hug" },
  List: { w: "fill", h: "hug" },
};

/** Session-temporary id prefix — never printed, never collides with ULIDs
 *  (ULID alphabet has no `~`). Rev 4 §6 persist-on-need: only sk:id survives
 *  the file; everything else gets a doc-order temp id per parse. */
export const TEMP_ID_PREFIX = "~";

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

// ------------------------------------------------------------------ parser --

type RawAttr = { v: string | number | true | Bind; pos: number };

interface ParseCtx {
  /** Fields of the enclosing <Template>'s ItemShape; null = not in a template.
   *  {Bind} resolves against this — a lookup, never an evaluation. */
  shape: ItemField[] | null;
  /** True while parsing a <Frame>'s DIRECT children — x/y are legal (and
   *  default to 0) exactly there. Resets for deeper flow children. */
  inFrame: boolean;
  ranges: Record<string, Range>;
  nextTemp: () => string;
}

class P {
  pos = 0;
  constructor(public s: string) {}

  fail(msg: string, pos: number): never {
    throw new MarkupError(msg, this.s, pos);
  }
  ws() {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
    if (this.s.startsWith("<!--", this.pos)) {
      this.fail("方言 v3 不含注释（已 park）", this.pos);
    }
  }
  peek(t: string) {
    return this.s.startsWith(t, this.pos);
  }
  eat(t: string, msg: string) {
    if (!this.peek(t)) this.fail(msg, this.pos);
    this.pos += t.length;
  }
  ident(): string {
    const m = /^[A-Za-z][A-Za-z0-9:_-]*/.exec(this.s.slice(this.pos));
    if (!m) this.fail("期望标识符", this.pos);
    this.pos += m![0].length;
    return m![0];
  }

  /** Attributes up to `>` or `/>`. `key` may appear bare (boolean). Values:
   *  "text" (entity-unescaped), {number}, or {Bind field}. */
  attrs(name: string, allowBind: boolean): Record<string, RawAttr> {
    const raw: Record<string, RawAttr> = {};
    for (;;) {
      this.ws();
      if (this.peek("/>") || this.peek(">")) return raw;
      const aPos = this.pos;
      const a = this.ident();
      const allowed = ATTRS[name] ?? [];
      const dynamic = name === "d:Sample"; // sample attrs = the item shape's fields
      if (!dynamic && !allowed.includes(a)) {
        this.fail(`<${name}> 不接受属性 ${a} — 可用: ${allowed.join(", ")}`, aPos);
      }
      if (a in raw) this.fail(`属性 ${a} 重复`, aPos);
      this.ws();
      if (a === "key" && !this.peek("=")) {
        raw[a] = { v: true, pos: aPos };
        continue;
      }
      this.eat("=", `属性 ${a} 缺少 =`);
      this.ws();
      if (this.peek('"')) {
        this.pos++;
        const q = this.s.indexOf('"', this.pos);
        if (q < 0) this.fail("字符串未闭合", this.pos);
        raw[a] = { v: unescapeText(this.s.slice(this.pos, q)), pos: aPos };
        this.pos = q + 1;
      } else if (this.peek("{")) {
        const bPos = this.pos;
        this.pos++;
        this.ws();
        if (this.s.startsWith("Bind", this.pos) && /^Bind\s/.test(this.s.slice(this.pos))) {
          if (!allowBind) this.fail("绑定只在 <Template> 内可用", bPos);
          this.pos += 4;
          this.ws();
          const f = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.s.slice(this.pos));
          if (!f) this.fail("{Bind 字段名} 需要一个字段名", this.pos);
          this.pos += f![0].length;
          this.ws();
          this.eat("}", "期望 }");
          raw[a] = { v: { bind: f![0] }, pos: bPos };
        } else {
          const m = /^-?\d+/.exec(this.s.slice(this.pos));
          if (!m) this.fail("方言不含表达式 — {} 内只允许数字或 {Bind 字段}；交互经 intent 声明", this.pos);
          this.pos += m![0].length;
          this.ws();
          this.eat("}", "期望 }（{} 内只允许一个数字）");
          raw[a] = { v: Number(m![0]), pos: bPos };
        }
      } else {
        this.fail(`属性 ${a} 的值需为 "文本" 或 {数字}`, this.pos);
      }
    }
  }

  /** Text content of Text/Button up to `<`: entities unescaped; a sole
   *  {Bind field} makes the content a binding. */
  textContent(allowBind: boolean): string | Bind {
    const lt = this.s.indexOf("<", this.pos);
    if (lt < 0) this.fail("元素未闭合", this.pos);
    const rawText = this.s.slice(this.pos, lt).trim();
    const bindM = /^\{\s*Bind\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\}$/.exec(rawText);
    if (bindM) {
      if (!allowBind) this.fail("绑定只在 <Template> 内可用", this.pos);
      this.pos = lt;
      return { bind: bindM[1] };
    }
    if (rawText.includes("{")) {
      this.fail("方言不含表达式 — 文本内容里的 { 需转义为 &#123;（或使用 {Bind 字段}）", this.pos + rawText.indexOf("{"));
    }
    this.pos = lt;
    return unescapeText(rawText);
  }

  closeTag(name: string, openPos: number) {
    if (this.pos >= this.s.length) this.fail(`<${name}> 未闭合`, openPos);
    this.eat("</", `期望 </${name}>`);
    const cPos = this.pos;
    const cname = this.ident();
    if (cname !== name) this.fail(`闭合标签 </${cname}> 与 <${name}> 不匹配`, cPos);
    this.ws();
    this.eat(">", "期望 >");
  }
}

// entity escaping — the round-trip totality guarantee for arbitrary strings
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\{/g, "&#123;");
}
function unescapeText(s: string): string {
  return s
    .replace(/&#123;/g, "{")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// ----------------------------------------------------------- value parsing --

function sizeOf(p: P, raw: Record<string, RawAttr>, key: string, dflt: string | number): Size {
  const r = raw[key];
  const v = r ? r.v : dflt;
  const pos = r ? r.pos : 0;
  if (v === "hug") return { mode: "hug" };
  if (v === "fill") return { mode: "fill" };
  if (typeof v === "number") {
    if (v <= 0) p.fail(`${key}={${v}} 需为正像素数`, pos);
    return { mode: "fixed", px: v };
  }
  p.fail(`${key}=${fmtVal(v)} 需为 "hug" | "fill" | {像素数}`, pos);
}

/** Integer attr (x/y): absent → 0. Negative allowed — a child may hang off
 *  the frame's edge (the canvas crops; the document stays honest). */
function intOf(p: P, r: RawAttr | undefined, key: string): number {
  if (!r) return 0;
  if (typeof r.v === "number" && Number.isInteger(r.v)) return r.v;
  p.fail(`${key}=${fmtVal(r.v)} 需为整数像素 {n}`, r.pos);
}

function enumOf<T extends string>(p: P, name: string, raw: Record<string, RawAttr>, key: string): T | undefined {
  const r = raw[key];
  const v = r ? r.v : DEFAULTS[name]?.[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !ENUMS[key].includes(v)) {
    p.fail(`${key}=${fmtVal(v)} 不在字母表 {${ENUMS[key].join(", ")}}`, r ? r.pos : 0);
  }
  return v as T;
}

function rampOf(p: P, raw: Record<string, RawAttr>, key: string, dflt: number): number {
  const r = raw[key];
  const v = r ? r.v : dflt;
  if (typeof v !== "number" || !(SPACING_STEPS as readonly number[]).includes(v)) {
    p.fail(`${key}=${fmtVal(v)} 不在间距刻度 ${SPACING_STEPS.join(",")}`, r ? r.pos : 0);
  }
  return v as number;
}

function strOf(p: P, raw: Record<string, RawAttr>, key: string): string | undefined {
  const r = raw[key];
  if (!r) return undefined;
  if (typeof r.v !== "string") p.fail(`${key} 需为字符串`, r.pos);
  return r.v as string;
}

function fmtVal(v: string | number | true | Bind): string {
  if (v === true) return "(bare)";
  if (typeof v === "number") return `{${v}}`;
  if (typeof v === "object") return `{Bind ${v.bind}}`;
  return `"${v}"`;
}

/** `pad`: `{4}` uniform (canonical when equal), `"2 6"` (vertical horizontal),
 *  `"1 2 3 4"` (top right bottom left). Every edge must sit on the ramp.
 *  The Spec's Edges are per-edge; a uniform-only pad would make non-uniform
 *  v2 documents unmigratable (constraint 23: no silent loss). */
function padOf(p: P, raw: Record<string, RawAttr>): Edges {
  const r = raw["pad"];
  if (!r) return { top: 0, right: 0, bottom: 0, left: 0 };
  const onRamp = (n: number, pos: number) => {
    if (!(SPACING_STEPS as readonly number[]).includes(n)) {
      p.fail(`pad 的边值 ${n} 不在间距刻度 ${SPACING_STEPS.join(",")}`, pos);
    }
    return n as Edges["top"];
  };
  if (typeof r.v === "number") {
    const s = onRamp(r.v, r.pos);
    return { top: s, right: s, bottom: s, left: s };
  }
  if (typeof r.v === "string") {
    const parts = r.v.trim().split(/\s+/).map(Number);
    if (parts.some(Number.isNaN)) p.fail(`pad="${r.v}" 需为空格分隔的数字`, r.pos);
    if (parts.length === 2) {
      const [py, px] = parts.map((n) => onRamp(n, r.pos));
      return { top: py, right: px, bottom: py, left: px };
    }
    if (parts.length === 4) {
      const [t, ri, b, l] = parts.map((n) => onRamp(n, r.pos));
      return { top: t, right: ri, bottom: b, left: l };
    }
    p.fail(`pad="${r.v}" 需为 {N}（均匀）、"上下 左右" 或 "上 右 下 左"`, r.pos);
  }
  p.fail(`pad 的值需为 {数字} 或 "数字串"`, r.pos);
}

/** `border="thin muted"` — width token + color token. Omitted = no border. */
function borderOf(p: P, raw: Record<string, RawAttr>): { width: "thin" | "thick"; color: ColorToken } | undefined {
  const r = raw["border"];
  if (!r) return undefined;
  if (typeof r.v !== "string") p.fail("border 需为字符串，如 border=\"thin border\"", r.pos);
  const parts = (r.v as string).trim().split(/\s+/);
  if (parts.length !== 2) p.fail(`border="${r.v}" 需为 "宽度 颜色"（如 "thin border"）`, r.pos);
  const [w, c] = parts;
  if (w !== "thin" && w !== "thick") p.fail(`border 宽度 "${w}" 不在字母表 {thin, thick}`, r.pos);
  if (!(COLOR_TOKENS as readonly string[]).includes(c)) {
    p.fail(`border 颜色 "${c}" 不在字母表 {${COLOR_TOKENS.join(", ")}}`, r.pos);
  }
  return { width: w as "thin" | "thick", color: c as ColorToken };
}

/** `intent="none" | "submit" | "navigate" | "navigate:<sketchId>"` —
 *  navigate carries its target in the same attribute (Intent.to). */
function intentOf(p: P, raw: Record<string, RawAttr>): { kind: "none" } | { kind: "submit" } | { kind: "navigate"; to: string | null } {
  const r = raw["intent"];
  const v = r ? r.v : DEFAULTS.Button.intent;
  if (typeof v !== "string") p.fail("intent 需为字符串", r!.pos);
  if (v === "none") return { kind: "none" };
  if (v === "submit") return { kind: "submit" };
  if (v === "navigate") return { kind: "navigate", to: null };
  if (v.startsWith("navigate:")) {
    const to = v.slice("navigate:".length);
    if (!to) p.fail(`intent="navigate:" 缺少目标 sketch id`, r!.pos);
    return { kind: "navigate", to };
  }
  p.fail(`intent="${v}" 不在字母表 {none, submit, navigate, navigate:<sketchId>}`, r ? r.pos : 0);
}

function styleOf(p: P, name: string, raw: Record<string, RawAttr>): Style | undefined {
  const style: Style = {};
  const bg = enumOf<ColorToken>(p, name, raw, "bg");
  const fg = enumOf<ColorToken>(p, name, raw, "fg");
  const radius = enumOf<NonNullable<Style["radius"]>>(p, name, raw, "radius");
  const border = borderOf(p, raw);
  if (bg) style.bg = bg;
  if (fg) style.fg = fg;
  if (border) style.border = border;
  if (radius) style.radius = radius;
  return Object.keys(style).length > 0 ? style : undefined;
}

// -------------------------------------------------------------- element → Spec --

function idOf(raw: Record<string, RawAttr>, ctx: ParseCtx): string {
  const r = raw["sk:id"];
  if (r && typeof r.v === "string" && r.v.length > 0) return r.v as string;
  return ctx.nextTemp();
}

function sizingOf(p: P, name: string, raw: Record<string, RawAttr>): Sizing {
  return {
    width: sizeOf(p, raw, "w", DEFAULTS[name].w),
    height: sizeOf(p, raw, "h", DEFAULTS[name].h),
  };
}

function parseElement(p: P, ctx: ParseCtx): SketchNode {
  const start = p.pos;
  p.eat("<", "期望 <");
  const namePos = p.pos;
  const name = p.ident();
  if (!(name in ATTRS) || name === "Sketch" || name === "ItemShape" || name === "Field" || name === "Template") {
    p.fail(`未知元素 <${name}> — 方言元素: Stack, Frame, Text, Button, Input, Image, List`, namePos);
  }
  const inTemplate = ctx.shape !== null;
  const raw = p.attrs(name, inTemplate);

  let selfClosed = false;
  if (p.peek("/>")) {
    p.pos += 2;
    selfClosed = true;
  } else {
    p.eat(">", "期望 > 或 />");
  }

  const finish = (node: SketchNode): SketchNode => {
    // Position (Rev 5 Frame): x/y attach exactly on a Frame's direct
    // children (defaulting to 0); anywhere else they are a dialect error.
    const rx = raw["x"];
    const ry = raw["y"];
    if (ctx.inFrame) {
      node.pos = { x: intOf(p, rx, "x"), y: intOf(p, ry, "y") };
    } else if (rx || ry) {
      p.fail(`${rx ? "x" : "y"} 只在 <Frame> 的直接子级上合法`, (rx ?? ry)!.pos);
    }
    ctx.ranges[node.id] = { start, end: p.pos };
    return node;
  };

  if (name === "Stack") {
    const children: SketchNode[] = [];
    if (!selfClosed) {
      const inner: ParseCtx = { ...ctx, inFrame: false };
      for (;;) {
        p.ws();
        if (p.peek("</")) break;
        if (p.pos >= p.s.length) p.fail("<Stack> 未闭合", start);
        children.push(parseElement(p, inner));
      }
      p.closeTag("Stack", start);
    }
    const layout: Layout = {
      direction: enumOf<Layout["direction"]>(p, name, raw, "dir")!,
      gap: rampOf(p, raw, "gap", DEFAULTS.Stack.gap as number) as Layout["gap"],
      padding: padOf(p, raw),
      mainAxis: enumOf<Layout["mainAxis"]>(p, name, raw, "main")!,
      crossAxis: enumOf<Layout["crossAxis"]>(p, name, raw, "cross")!,
    };
    const node: Container = {
      kind: "stack",
      id: idOf(raw, ctx),
      layout,
      sizing: sizingOf(p, name, raw),
      children,
    };
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  if (name === "Frame") {
    const children: SketchNode[] = [];
    if (!selfClosed) {
      const inner: ParseCtx = { ...ctx, inFrame: true };
      for (;;) {
        p.ws();
        if (p.peek("</")) break;
        if (p.pos >= p.s.length) p.fail("<Frame> 未闭合", start);
        children.push(parseElement(p, inner));
      }
      p.closeTag("Frame", start);
    }
    const node: FrameP = {
      kind: "frame",
      id: idOf(raw, ctx),
      sizing: sizingOf(p, name, raw),
      children,
    };
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  if (name === "List") {
    // (Nested lists are a validate() concern, not a parse concern — total.)
    if (selfClosed) p.fail("<List> 需要结构子元素：ItemShape, d:Sample*, Template", start);
    const dataKey = strOf(p, raw, "dataKey");
    if (dataKey === undefined) p.fail("<List> 需要 dataKey", start);
    p.ws();
    const itemShape = parseItemShape(p);
    const sampleRows: Record<string, unknown>[] = [];
    for (;;) {
      p.ws();
      if (!p.peek("<d:Sample")) break;
      sampleRows.push(parseSample(p, itemShape));
    }
    p.ws();
    const template = parseTemplate(p, ctx, itemShape);
    p.ws();
    p.closeTag("List", start);
    const node: ListP = {
      kind: "list",
      id: idOf(raw, ctx),
      itemShape,
      dataKey,
      template,
      sampleRows,
      sizing: sizingOf(p, name, raw),
    };
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  if (name === "Text") {
    let content: string | Bind = "";
    if (!selfClosed) {
      content = p.textContent(inTemplate);
      p.closeTag("Text", start);
    }
    if (isBind(content) && ctx.shape && !ctx.shape.some((f) => f.name === content.bind)) {
      p.fail(`{Bind ${content.bind}} 不在 ItemShape 已声明字段 {${ctx.shape.map((f) => f.name).join(", ")}}`, start);
    }
    const node: SketchNode = {
      kind: "text",
      id: idOf(raw, ctx),
      role: enumOf<"heading" | "subhead" | "body" | "caption">(p, name, raw, "role")!,
      content,
      sizing: sizingOf(p, name, raw),
    };
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  if (name === "Button") {
    let label = "";
    if (!selfClosed) {
      const c = p.textContent(false);
      label = c as string;
      p.closeTag("Button", start);
    }
    const intent = intentOf(p, raw);
    const node: SketchNode = {
      kind: "button",
      id: idOf(raw, ctx),
      label,
      variant: enumOf<"primary" | "secondary" | "ghost">(p, name, raw, "variant")!,
      intent,
      sizing: sizingOf(p, name, raw),
    };
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  if (name === "Input") {
    if (!selfClosed) p.fail(`<Input> 必须自闭合（<Input ... />）`, start);
    const node: SketchNode = {
      kind: "input",
      id: idOf(raw, ctx),
      label: strOf(p, raw, "label") ?? "",
      type: enumOf<"text" | "email" | "password">(p, name, raw, "type")!,
      sizing: sizingOf(p, name, raw),
    };
    const placeholder = strOf(p, raw, "placeholder");
    if (placeholder !== undefined && placeholder !== "") node.placeholder = placeholder;
    const style = styleOf(p, name, raw);
    if (style) node.style = style;
    return finish(node);
  }

  // Image
  if (!selfClosed) p.fail(`<Image> 必须自闭合（<Image ... />）`, start);
  const srcRaw = raw["src"];
  const alt = strOf(p, raw, "alt");
  if (!srcRaw || alt === undefined) p.fail("<Image> 需要 src 与 alt", start);
  let src: string | Bind;
  const srcVal = srcRaw.v;
  if (typeof srcVal === "object") {
    // {Bind field} — the only object-shaped attr value.
    const bind = srcVal as Bind;
    if (ctx.shape && !ctx.shape.some((f) => f.name === bind.bind)) {
      p.fail(`{Bind ${bind.bind}} 不在 ItemShape 已声明字段 {${ctx.shape.map((f) => f.name).join(", ")}}`, srcRaw.pos);
    }
    src = bind;
  } else if (typeof srcVal === "string") {
    src = srcVal;
  } else {
    p.fail(`src 的值需为 "文本" 或 {Bind 字段}`, srcRaw.pos);
  }
  const node: SketchNode = {
    kind: "image",
    id: idOf(raw, ctx),
    src,
    alt,
    sizing: sizingOf(p, name, raw),
  };
  const style = styleOf(p, name, raw);
  if (style) node.style = style;
  return finish(node);
}

function parseItemShape(p: P): ItemField[] {
  const start = p.pos;
  p.eat("<ItemShape", "List 的第一个子元素需为 <ItemShape>");
  p.ws();
  p.eat(">", "期望 >");
  const fields: ItemField[] = [];
  for (;;) {
    p.ws();
    if (p.peek("</")) break;
    const fStart = p.pos;
    p.eat("<Field", "ItemShape 内只允许 <Field>");
    const raw = p.attrs("Field", false);
    p.eat("/>", "<Field> 必须自闭合");
    const name = strOf(p, raw, "name");
    const type = strOf(p, raw, "type");
    if (name === undefined || type === undefined) p.fail("<Field> 需要 name 与 type", fStart);
    if (!(ITEM_FIELD_TYPES as readonly string[]).includes(type)) {
      p.fail(`type="${type}" 不在字母表 {${ITEM_FIELD_TYPES.join(", ")}}`, fStart);
    }
    const f: ItemField = { name, type: type as ItemFieldType };
    if (raw["key"]) f.isKey = true;
    fields.push(f);
  }
  p.closeTag("ItemShape", start);
  return fields;
}

/** `<d:Sample field=value …/>` — one sample row. Attribute names are the
 *  shape's fields; values are typed by the shape (string fields "…",
 *  number fields {N}, boolean fields "true"/"false"). */
function parseSample(p: P, shape: ItemField[]): Record<string, unknown> {
  p.eat("<d:Sample", "期望 <d:Sample");
  const raw = p.attrs("d:Sample", false);
  p.eat("/>", "<d:Sample> 必须自闭合");
  const row: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(raw)) {
    const field = shape.find((f) => f.name === k);
    if (!field) {
      p.fail(`d:Sample 的字段 ${k} 不在 ItemShape 已声明字段 {${shape.map((f) => f.name).join(", ")}}`, r.pos);
    }
    switch (field!.type) {
      case "string":
      case "image":
        if (typeof r.v !== "string") p.fail(`${k} 为 ${field!.type} 字段，需为 "文本"`, r.pos);
        row[k] = r.v;
        break;
      case "number":
        if (typeof r.v !== "number") p.fail(`${k} 为 number 字段，需为 {数字}`, r.pos);
        row[k] = r.v;
        break;
      case "boolean": {
        if (r.v !== "true" && r.v !== "false") p.fail(`${k} 为 boolean 字段，需为 "true" 或 "false"`, r.pos);
        row[k] = r.v === "true";
        break;
      }
    }
  }
  return row;
}

function parseTemplate(p: P, ctx: ParseCtx, shape: ItemField[]): Container {
  const start = p.pos;
  p.eat("<Template", "List 需要 <Template>（在 d:Sample 之后）");
  p.ws();
  p.eat(">", "期望 >");
  p.ws();
  // The template root is a FLOW child of the list — an enclosing Frame's
  // positioning context never leaks into it.
  const inner: ParseCtx = { ...ctx, shape, inFrame: false };
  const tStart = p.pos;
  const node = parseElement(p, inner);
  if (node.kind === "stack") {
    p.ws();
    p.closeTag("Template", start);
    return node;
  }
  p.fail("<Template> 的唯一子元素必须是 <Stack>", tStart);
}

// ------------------------------------------------------------------- parse --

export interface ParsedSketch {
  sketch: Sketch;
  /** Node id → source range (persisted or session-temp ids alike) — the
   *  editor's selection-sync sidecar. NOT part of the Spec. */
  ranges: Record<string, Range>;
}

/** Parse a `.sketch` document. Total on the dialect; positioned MarkupError
 *  for everything outside it. */
export function parseSketchMarkup(src: string): ParsedSketch {
  const p = new P(src);
  let temp = 0;
  const ctx: ParseCtx = {
    shape: null,
    inFrame: false,
    ranges: {},
    nextTemp: () => `${TEMP_ID_PREFIX}${++temp}`,
  };

  p.ws();
  const start = p.pos;
  p.eat("<", "期望 <Sketch>");
  const namePos = p.pos;
  const rootName = p.ident();
  if (rootName !== "Sketch") p.fail(`根元素必须是 <Sketch>（而不是 <${rootName}>）`, namePos);
  const raw = p.attrs("Sketch", false);
  p.eat(">", "期望 >（<Sketch> 不可自闭合，需包含根 <Stack>）");

  const name = strOf(p, raw, "name");
  if (name === undefined) throw new MarkupError("<Sketch> 需要 name", src, start);
  const versionRaw = raw["schemaVersion"];
  if (!versionRaw || typeof versionRaw.v !== "number") {
    throw new MarkupError("<Sketch> 需要 schemaVersion={N}", src, start);
  }
  const schemaVersion = versionRaw.v;
  if (schemaVersion > SCHEMA_VERSION) {
    p.fail(`schemaVersion={${schemaVersion}} 高于本实现支持的 ${SCHEMA_VERSION}（以只读模式打开）`, versionRaw.pos);
  }

  p.ws();
  const rootPos = p.pos;
  const root = parseElement(p, ctx);
  if (root.kind !== "stack") {
    throw new MarkupError("<Sketch> 的唯一子元素必须是根 <Stack>", src, rootPos);
  }
  p.ws();
  p.closeTag("Sketch", start);
  p.ws();
  if (p.pos < src.length) p.fail("根元素之后存在多余内容", p.pos);

  const sketch: Sketch = {
    id: (strOf(p, raw, "sk:id") ?? "").trim(),
    name,
    blueprintRef: strOf(p, raw, "blueprintRef") ?? null,
    root,
    schemaVersion,
  };
  return { sketch, ranges: ctx.ranges };
}

// --------------------------------------------------------- canonical print --

function fmtSize(s: Size): string | number {
  return s.mode === "fixed" ? s.px : s.mode;
}

function fmtPad(e: Edges): string | number {
  if (e.top === e.right && e.right === e.bottom && e.bottom === e.left) return e.top;
  if (e.top === e.bottom && e.left === e.right) return `${e.top} ${e.right}`;
  return `${e.top} ${e.right} ${e.bottom} ${e.left}`;
}

function fmtIntent(i: NonNullable<ButtonP["intent"]>): string {
  if (i.kind === "navigate") return i.to ? `navigate:${i.to}` : "navigate";
  return i.kind;
}

function attrText(a: string, v: string | number): string {
  return typeof v === "number" ? `${a}={${v}}` : `${a}="${escapeAttr(v)}"`;
}

function nodeAttrs(n: SketchNode, inFrame: boolean): string[] {
  const out: string[] = [];
  const push = (a: string, v: string | number | undefined, dflt?: string | number) => {
    if (v === undefined) return;
    if (dflt !== undefined && v === dflt) return; // canonical: omit defaults
    out.push(attrText(a, v));
  };
  if (!isTempId(n.id) && n.id !== "") out.push(attrText("sk:id", n.id));
  if (inFrame) {
    // Position is ALWAYS printed on a Frame's children (0 included) —
    // explicit placement is the whole point of the region.
    out.push(attrText("x", n.pos?.x ?? 0));
    out.push(attrText("y", n.pos?.y ?? 0));
  }

  const style = n.style;
  const styleAttrs = () => {
    push("bg", style?.bg);
    push("fg", style?.fg);
    if (style?.border && style.border.width !== "none") {
      push("border", `${style.border.width} ${style.border.color}`);
    }
    push("radius", style?.radius);
  };

  switch (n.kind) {
    case "stack": {
      const d = DEFAULTS.Stack;
      push("dir", n.layout.direction, d.dir);
      push("gap", n.layout.gap, d.gap);
      push("pad", fmtPad(n.layout.padding), d.pad);
      push("main", n.layout.mainAxis, d.main);
      push("cross", n.layout.crossAxis, d.cross);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "frame": {
      const d = DEFAULTS.Frame;
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "list": {
      const d = DEFAULTS.List;
      push("dataKey", n.dataKey);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "text": {
      const d = DEFAULTS.Text;
      push("role", n.role, d.role);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "button": {
      const d = DEFAULTS.Button;
      push("variant", n.variant, d.variant);
      push("intent", n.intent ? fmtIntent(n.intent) : undefined, d.intent);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "input": {
      const d = DEFAULTS.Input;
      push("label", n.label, d.label);
      push("type", n.type, d.type);
      push("placeholder", n.placeholder ?? "", d.placeholder);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
    case "image": {
      const d = DEFAULTS.Image;
      if (isBind(n.src)) out.push(`src={Bind ${n.src.bind}}`);
      else push("src", n.src);
      push("alt", n.alt);
      push("w", fmtSize(n.sizing.width), d.w);
      push("h", fmtSize(n.sizing.height), d.h);
      styleAttrs();
      return out;
    }
  }
}

function textBody(v: string | Bind): string {
  return isBind(v) ? `{Bind ${v.bind}}` : escapeText(v);
}

function printNode(n: SketchNode, d: number, inFrame = false): string {
  const pad = "  ".repeat(d);
  const attrs = nodeAttrs(n, inFrame)
    .map((x) => " " + x)
    .join("");
  switch (n.kind) {
    case "stack":
      if (n.children.length === 0) return `${pad}<Stack${attrs} />`;
      return `${pad}<Stack${attrs}>\n${n.children.map((c) => printNode(c, d + 1)).join("\n")}\n${pad}</Stack>`;
    case "frame":
      if (n.children.length === 0) return `${pad}<Frame${attrs} />`;
      return `${pad}<Frame${attrs}>\n${n.children.map((c) => printNode(c, d + 1, true)).join("\n")}\n${pad}</Frame>`;
    case "list": {
      const lines: string[] = [`${pad}<List${attrs}>`];
      lines.push(`${pad}  <ItemShape>`);
      for (const f of n.itemShape) {
        const key = f.isKey ? " key" : "";
        lines.push(`${pad}    <Field name="${escapeAttr(f.name)}" type="${f.type}"${key} />`);
      }
      lines.push(`${pad}  </ItemShape>`);
      for (const row of n.sampleRows) {
        const cells = n.itemShape
          .filter((f) => f.name in row)
          .map((f) => {
            const v = row[f.name];
            if (f.type === "number" && typeof v === "number") return `${f.name}={${v}}`;
            if (f.type === "boolean") return `${f.name}="${v === true ? "true" : "false"}"`;
            return `${f.name}="${escapeAttr(String(v ?? ""))}"`;
          })
          .join(" ");
        lines.push(`${pad}  <d:Sample${cells ? " " + cells : ""} />`);
      }
      lines.push(`${pad}  <Template>`);
      lines.push(printNode(n.template, d + 2));
      lines.push(`${pad}  </Template>`);
      lines.push(`${pad}</List>`);
      return lines.join("\n");
    }
    case "text":
      return `${pad}<Text${attrs}>${textBody(n.content)}</Text>`;
    case "button":
      return `${pad}<Button${attrs}>${escapeText(n.label)}</Button>`;
    case "input":
      return `${pad}<Input${attrs} />`;
    case "image":
      return `${pad}<Image${attrs} />`;
  }
}

/** Canonical printer: fixed attribute order, defaults omitted, 2-space
 *  indent, session-temp ids never printed. print∘parse∘print ≡ print. */
export function printSketchMarkup(sketch: Sketch): string {
  const attrs: string[] = [];
  if (sketch.id && !isTempId(sketch.id)) attrs.push(attrText("sk:id", sketch.id));
  attrs.push(attrText("name", sketch.name));
  if (sketch.blueprintRef) attrs.push(attrText("blueprintRef", sketch.blueprintRef));
  attrs.push(attrText("schemaVersion", sketch.schemaVersion));
  return [
    `<Sketch ${attrs.join(" ")}>`,
    printNode(sketch.root, 1),
    `</Sketch>`,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------- canonical form --

/**
 * The dialect's value-canonical Spec form: v2 JSON allowed several spellings
 * that the markup can only express one way. Canonicalizing before the
 * migration equivalence check (`json tree ≡ parse(print(json tree))`) makes
 * those spellings compare equal instead of failing the migration:
 *
 * - button `intent` absent ≡ `{ kind: "none" }` (the dialect always knows)
 * - `style.border` with width `"none"` ≡ no border
 * - input `placeholder: ""` ≡ no placeholder
 * - an emptied `style: {}` ≡ no style
 *
 * Pure and total; `semantics` is deliberately NOT handled here — the
 * migrator refuses such files loudly (the dialect has no spelling for it,
 * and constraint 23 forbids dropping it silently).
 */
export function canonicalizeForMarkup(sketch: Sketch): Sketch {
  const node = (n: SketchNode): SketchNode => {
    const out: SketchNode = { ...n };
    if (out.style) {
      const style: Style = { ...out.style };
      if (style.border && style.border.width === "none") delete style.border;
      if (Object.keys(style).length === 0) delete out.style;
      else out.style = style;
    }
    if (out.kind === "button" && out.intent === undefined) {
      out.intent = { kind: "none" };
    }
    if (out.kind === "input" && out.placeholder === "") {
      delete out.placeholder;
    }
    if (out.kind === "stack" || out.kind === "frame") {
      out.children = out.children.map(node);
    }
    if (out.kind === "list") {
      out.template = node(out.template) as Container;
    }
    return out;
  };
  return { ...sketch, root: node(sketch.root) as Container };
}

// -------------------------------------------------------------- law helper --

/** Structural equality helper modulo session-temp ids: temp ids are
 *  doc-order-derived, so two parses of the same text agree on them, but a
 *  reprint (which omits them) must still compare equal. */
export function stripForLaw(sketch: Sketch): unknown {
  const node = (n: SketchNode): unknown => {
    const base: Record<string, unknown> = { ...n, id: isTempId(n.id) ? "" : n.id };
    if (n.kind === "stack" || n.kind === "frame") base.children = n.children.map(node);
    if (n.kind === "list") base.template = node(n.template);
    return base;
  };
  return { ...sketch, id: isTempId(sketch.id) ? "" : sketch.id, root: node(sketch.root) };
}
