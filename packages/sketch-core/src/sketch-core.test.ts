/**
 * The K2 discipline (docs/sketch-design.md §4): exhaustive over the finite
 * alphabet + a handful of goldens + parity. Alphabet tests assert semantic
 * class-groups (never full HTML); the goldens are the deliberate exception.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUTTON_VARIANTS,
  COLOR_TOKENS,
  CROSS_AXES,
  MAIN_AXES,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_TOKENS,
  type ButtonP,
  type Container,
  type InputP,
  type Layout,
  type Size,
  type Sizing,
  type Sketch,
  type SketchNode,
  type TextP,
} from "./spec.js";
import { defaultTheme } from "./theme.js";
import {
  collectHandlerIds,
  containerClasses,
  paddingClasses,
  sizingClasses,
  sketchToIR,
  toJsxString,
  ROOT_CTX,
  type IRNode,
  type ParentCtx,
} from "./emit.js";
import { toElement, type CreateElement } from "./to-element.js";

// ------------------------------------------------------------- fixtures --

const hug: Size = { mode: "hug" };
const fill: Size = { mode: "fill" };
const fixed = (px: number): Size => ({ mode: "fixed", px });
const sz = (width: Size, height: Size): Sizing => ({ width, height });

const layout = (over: Partial<Layout> = {}): Layout => ({
  direction: "col",
  gap: 4,
  padding: { top: 4, right: 4, bottom: 4, left: 4 },
  mainAxis: "start",
  crossAxis: "stretch",
  ...over,
});

const stack = (over: Partial<Container> = {}): Container => ({
  kind: "stack",
  id: "c1",
  layout: layout(),
  sizing: sz(hug, hug),
  children: [],
  ...over,
});

const classesOf = (s: string): string[] => s.split(" ");

// ----------------------------------------------------- sizing, exhaustive --

test("sizing: exhaustive over mode² × direction × crossAxis (36 points)", () => {
  const modes: Size[] = [hug, fill, fixed(240)];
  // Independent oracle transcribed from the spec §4 text (double-entry).
  const oracle = (
    w: Size,
    h: Size,
    dir: "row" | "col",
    cross: Layout["crossAxis"],
  ): string[] => {
    const mainIsWidth = dir === "row";
    const main = mainIsWidth ? w : h;
    const crossS = mainIsWidth ? h : w;
    const mainL = mainIsWidth ? "w" : "h";
    const crossL = mainIsWidth ? "h" : "w";
    const out: string[] = [];
    if (main.mode === "hug") out.push("shrink-0");
    if (main.mode === "fill") out.push("flex-1");
    if (main.mode === "fixed") out.push(`${mainL}-[${main.px}px]`, "shrink-0");
    if (crossS.mode === "hug" && cross === "stretch") out.push("self-start");
    if (crossS.mode === "fill") out.push("self-stretch");
    if (crossS.mode === "fixed") out.push(`${crossL}-[${crossS.px}px]`);
    return out;
  };

  let points = 0;
  for (const dir of ["row", "col"] as const) {
    for (const cross of ["stretch", "start"] as const) {
      for (const w of modes) {
        for (const h of modes) {
          const parent: ParentCtx = { direction: dir, crossAxis: cross };
          assert.deepEqual(
            sizingClasses(sz(w, h), parent),
            oracle(w, h, dir, cross),
            `w=${w.mode} h=${h.mode} dir=${dir} cross=${cross}`,
          );
          points += 1;
        }
      }
    }
  }
  assert.equal(points, 36);
});

test("sizing: cross-axis hug opts out only under a stretching parent", () => {
  // The rule that makes K2's downward context a 2-tuple, not just direction.
  const stretchy = sizingClasses(sz(hug, hug), { direction: "col", crossAxis: "stretch" });
  assert.ok(stretchy.includes("self-start"));
  for (const cross of ["start", "center", "end"] as const) {
    const relaxed = sizingClasses(sz(hug, hug), { direction: "col", crossAxis: cross });
    assert.ok(!relaxed.includes("self-start"), `crossAxis=${cross}`);
  }
});

// -------------------------------------------------------- align, exhaustive --

test("alignment: exhaustive mainAxis × crossAxis (16 points)", () => {
  const J = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" };
  const I = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" };
  for (const m of MAIN_AXES) {
    for (const c of CROSS_AXES) {
      const cls = classesOf(
        containerClasses(stack({ layout: layout({ mainAxis: m, crossAxis: c }) }), ROOT_CTX, defaultTheme),
      );
      assert.ok(cls.includes(J[m]), `mainAxis=${m}`);
      assert.ok(cls.includes(I[c]), `crossAxis=${c}`);
    }
  }
});

// ------------------------------------------------- spacing ramp, exhaustive --

test("gap: every ramp step maps 1:1 to the tailwind number (10 points)", () => {
  for (const step of SPACING_STEPS) {
    const cls = classesOf(
      containerClasses(stack({ layout: layout({ gap: step }) }), ROOT_CTX, defaultTheme),
    );
    assert.ok(cls.includes(`gap-${step}`), `gap=${step}`);
  }
});

test("padding: collapses p- / px-,py- / per-edge (and each ramp step survives)", () => {
  for (const step of SPACING_STEPS) {
    assert.deepEqual(
      paddingClasses({ top: step, right: step, bottom: step, left: step }),
      [`p-${step}`],
    );
  }
  assert.deepEqual(
    paddingClasses({ top: 2, right: 6, bottom: 2, left: 6 }),
    ["px-6", "py-2"],
  );
  assert.deepEqual(
    paddingClasses({ top: 1, right: 2, bottom: 3, left: 4 }),
    ["pt-1", "pr-2", "pb-3", "pl-4"],
  );
});

// ------------------------------------------------------- color, exhaustive --

test("color: every token resolves for bg / fg / border (30 points)", () => {
  for (const token of COLOR_TOKENS) {
    const binding = defaultTheme.colors[token];

    const bg = classesOf(
      containerClasses(stack({ style: { bg: token } }), ROOT_CTX, defaultTheme),
    );
    assert.ok(bg.includes(`bg-${binding}`), `bg=${token}`);

    const fg = classesOf(
      containerClasses(stack({ style: { fg: token } }), ROOT_CTX, defaultTheme),
    );
    assert.ok(fg.includes(`text-${binding}`), `fg=${token}`);

    const bordered = classesOf(
      containerClasses(
        stack({ style: { border: { width: "thin", color: token } } }),
        ROOT_CTX,
        defaultTheme,
      ),
    );
    assert.ok(bordered.includes("border"), `border color=${token}`);
    assert.ok(bordered.includes(`border-${binding}`), `border color=${token}`);
  }
});

test("border widths: none emits nothing, thin/thick emit border/border-2", () => {
  const none = containerClasses(
    stack({ style: { border: { width: "none", color: "border" } } }),
    ROOT_CTX,
    defaultTheme,
  );
  assert.ok(!classesOf(none).some((c) => c.startsWith("border")));

  const thick = classesOf(
    containerClasses(
      stack({ style: { border: { width: "thick", color: "danger" } } }),
      ROOT_CTX,
      defaultTheme,
    ),
  );
  assert.ok(thick.includes("border-2"));
  assert.ok(thick.includes("border-red-600"));
});

// ----------------------------------------- radius / type / variant (13) --

test("radius: every token maps to its rounded-* class (6 points)", () => {
  for (const token of RADIUS_TOKENS) {
    const cls = classesOf(
      containerClasses(stack({ style: { radius: token } }), ROOT_CTX, defaultTheme),
    );
    assert.ok(cls.includes(defaultTheme.radius[token]), `radius=${token}`);
  }
});

test("type: every role maps tag + token classes + default fg (4 points)", () => {
  const TAG = { heading: "h2", subhead: "h3", body: "p", caption: "span" };
  for (const role of TYPE_TOKENS) {
    const node: TextP = { kind: "text", id: "t1", role, content: "x", sizing: sz(hug, hug) };
    const ir = sketchToIR(
      { id: "s", name: "t", blueprintRef: null, schemaVersion: 1, root: stack({ children: [node] }) },
      defaultTheme,
    ).children[0];
    assert.equal(ir.tag, TAG[role]);
    const cls = classesOf(ir.className);
    for (const c of defaultTheme.type[role]) assert.ok(cls.includes(c), `${role}: ${c}`);
    // Default fg: caption reads muted, everything else reads text (§5).
    const expectedFg = role === "caption" ? "text-slate-500" : "text-slate-900";
    assert.ok(cls.includes(expectedFg), `${role} default fg`);
  }
});

test("variant: every bundle lands, and user style overrides it (3 points)", () => {
  const EXPECT: Record<string, string[]> = {
    primary: ["bg-blue-600", "text-white", "rounded-md"],
    secondary: ["bg-slate-50", "text-slate-900", "border", "border-slate-200", "rounded-md"],
    ghost: ["bg-transparent", "text-blue-600", "rounded-md"],
  };
  for (const variant of BUTTON_VARIANTS) {
    const node: ButtonP = { kind: "button", id: "b1", label: "Go", variant, sizing: sz(hug, hug) };
    const ir = sketchToIR(
      { id: "s", name: "t", blueprintRef: null, schemaVersion: 1, root: stack({ children: [node] }) },
      defaultTheme,
    ).children[0];
    const cls = classesOf(ir.className);
    for (const c of EXPECT[variant]) assert.ok(cls.includes(c), `${variant}: ${c}`);
  }

  // Override: the user's style wins per field.
  const overridden: ButtonP = {
    kind: "button",
    id: "b2",
    label: "Delete",
    variant: "primary",
    style: { bg: "danger" },
    sizing: sz(hug, hug),
  };
  const ir = sketchToIR(
    { id: "s", name: "t", blueprintRef: null, schemaVersion: 1, root: stack({ children: [overridden] }) },
    defaultTheme,
  ).children[0];
  const cls = classesOf(ir.className);
  assert.ok(cls.includes("bg-red-600"));
  assert.ok(!cls.includes("bg-blue-600"));
});

// ------------------------------------------------------- class order (K2) --

test("container className keeps the fixed 6-segment order", () => {
  const c = stack({
    layout: layout({ direction: "row", gap: 2, mainAxis: "between", crossAxis: "center" }),
    sizing: sz(fill, hug),
    style: { bg: "surface" },
  });
  const cls = classesOf(containerClasses(c, ROOT_CTX, defaultTheme));
  const order = ["flex", "flex-row", "gap-2", "p-4", "justify-between", "items-center"];
  const idx = order.map((o) => cls.indexOf(o));
  assert.ok(idx.every((i) => i >= 0), `all segments present: ${cls.join(" ")}`);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], "segment order");
  // sizing and style trail the six segments
  assert.ok(cls.indexOf("bg-white") > idx[5]);
});

// ------------------------------------------------------------- the golden --

const LOGIN: Sketch = {
  id: "sk_login",
  name: "Login Screen",
  blueprintRef: "feat_login",
  schemaVersion: 1,
  root: {
    kind: "stack",
    id: "root",
    layout: {
      direction: "col",
      gap: 6,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
      mainAxis: "start",
      crossAxis: "stretch",
    },
    sizing: sz(fill, fill),
    children: [
      { kind: "text", id: "title", role: "heading", content: "Sign in", sizing: sz(hug, hug) },
      {
        kind: "input",
        id: "email",
        label: "Email",
        placeholder: "you@example.com",
        type: "email",
        sizing: sz(fill, hug),
      },
      { kind: "input", id: "password", label: "Password", type: "password", sizing: sz(fill, hug) },
      {
        kind: "button",
        id: "submit",
        label: "Sign in",
        variant: "primary",
        intent: { kind: "submit" },
        sizing: sz(fill, hug),
      },
    ] as SketchNode[],
  },
};

const LOGIN_GOLDEN = `// AUTO-GENERATED by Drafting Sketch — DO NOT EDIT.
// Regenerated wholesale from sketches/Login Screen.sketch.json (data-sk = node id).

export type SketchHandlers = {
  "submit"?: () => void;
};

export function LoginScreen({ handlers = {} }: { handlers?: SketchHandlers }) {
  return (
    <div className="flex flex-col gap-6 p-6 justify-start items-stretch flex-1 self-stretch" data-sk="root">
      <h2 className="text-xl font-semibold tracking-tight shrink-0 self-start text-slate-900" data-sk="title">Sign in</h2>
      <label className="flex flex-col gap-1 shrink-0 self-stretch" data-sk="email">
        <span className="text-sm text-slate-500">Email</span>
        <input className="border border-slate-200 rounded-md px-3 py-2" placeholder="you@example.com" type="email" />
      </label>
      <label className="flex flex-col gap-1 shrink-0 self-stretch" data-sk="password">
        <span className="text-sm text-slate-500">Password</span>
        <input className="border border-slate-200 rounded-md px-3 py-2" type="password" />
      </label>
      <button className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium shrink-0 self-stretch bg-blue-600 text-white rounded-md" data-sk="submit" onClick={handlers["submit"]}>Sign in</button>
    </div>
  );
}
`;

test("golden: the login screen emits byte-stable JSX with literal-key handlers", () => {
  assert.equal(toJsxString(LOGIN, defaultTheme), LOGIN_GOLDEN);
  // Determinism: a second fold is byte-identical.
  assert.equal(toJsxString(LOGIN, defaultTheme), toJsxString(LOGIN, defaultTheme));
});

test("golden: a sketch without intent nodes gets an empty handlers type", () => {
  const s: Sketch = {
    id: "sk_e",
    name: "empty",
    blueprintRef: null,
    schemaVersion: 1,
    root: stack(),
  };
  const out = toJsxString(s, defaultTheme);
  assert.ok(out.includes("export type SketchHandlers = Record<string, never>;"));
  assert.ok(!out.includes("onClick"));
});

test("jsx text and attributes are escaped", () => {
  const s: Sketch = {
    id: "sk_x",
    name: "3 bad <names>",
    blueprintRef: null,
    schemaVersion: 1,
    root: stack({
      children: [
        {
          kind: "text",
          id: "t",
          role: "body",
          content: '<b> & {x}',
          sizing: sz(hug, hug),
        },
      ],
    }),
  };
  const out = toJsxString(s, defaultTheme);
  assert.ok(out.includes("&lt;b&gt; &amp; &#123;x&#125;"));
  // A digit-leading name gets a safe component prefix.
  assert.ok(out.includes("export function Sketch3BadNames("));
});

// ----------------------------------------------------------------- parity --

interface Rec {
  tag: string;
  props: Record<string, unknown>;
  children: Array<Rec | string>;
}
const recordingH: CreateElement<Rec> = (tag, props, ...children) => ({
  tag,
  props: props ?? {},
  children,
});

type Triple = [string, string, string | null];

function triplesOfRec(node: Rec, out: Triple[] = []): Triple[] {
  out.push([
    node.tag,
    String(node.props.className ?? ""),
    (node.props["data-sk"] as string | undefined) ?? null,
  ]);
  for (const child of node.children) {
    if (typeof child !== "string") triplesOfRec(child, out);
  }
  return out;
}

function triplesOfJsx(jsx: string): Triple[] {
  const out: Triple[] = [];
  const re = /<([a-z][a-z0-9]*)((?:\s[^<>]*?)?)\s*\/?>/g;
  for (const m of jsx.matchAll(re)) {
    const attrs = m[2] ?? "";
    const cls = /className="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const sk = /data-sk="([^"]*)"/.exec(attrs)?.[1] ?? null;
    out.push([m[1], cls, sk]);
  }
  return out;
}

test("parity: both serializers yield identical (tag, className, data-sk) from one IR", () => {
  const ir: IRNode = sketchToIR(LOGIN, defaultTheme);
  const fromElement = triplesOfRec(toElement(ir, recordingH));
  const fromJsx = triplesOfJsx(toJsxString(LOGIN, defaultTheme));
  assert.equal(fromElement.length, 9, "login tree has 9 elements");
  assert.deepEqual(fromElement, fromJsx);
});

test("parity: handler placement matches — intent nodes get onClick on both sides", () => {
  const ir = sketchToIR(LOGIN, defaultTheme);
  assert.deepEqual(collectHandlerIds(ir), ["submit"]);

  const clicked: string[] = [];
  const el = toElement(ir, recordingH, { submit: () => clicked.push("submit") });
  const findButton = (n: Rec): Rec | null => {
    if (n.tag === "button") return n;
    for (const c of n.children) {
      if (typeof c !== "string") {
        const hit = findButton(c);
        if (hit) return hit;
      }
    }
    return null;
  };
  const button = findButton(el)!;
  (button.props.onClick as () => void)();
  assert.deepEqual(clicked, ["submit"]);

  const jsx = toJsxString(LOGIN, defaultTheme);
  assert.equal(jsx.match(/onClick=\{handlers\["submit"\]\}/g)?.length, 1);
});

test("parity: primitive attributes ride both serializers", () => {
  const ir = sketchToIR(LOGIN, defaultTheme);
  const el = toElement(ir, recordingH);
  const inputs: Rec[] = [];
  const walk = (n: Rec) => {
    if (n.tag === "input") inputs.push(n);
    n.children.forEach((c) => typeof c !== "string" && walk(c));
  };
  walk(el);
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].props.type, "email");
  assert.equal(inputs[0].props.placeholder, "you@example.com");
  assert.equal(inputs[1].props.type, "password");

  const jsx = toJsxString(LOGIN, defaultTheme);
  assert.ok(jsx.includes('placeholder="you@example.com" type="email"'));
  assert.ok(jsx.includes('type="password"'));
});

// ------------------------------------------------------- class universe --

test("classUniverse enumerates the emittable set with no arbitrary values", async () => {
  const { classUniverse } = await import("./emit.js");
  const universe = classUniverse(defaultTheme);
  // Families present end-to-end.
  for (const c of [
    "flex",
    "flex-row",
    "gap-24",
    "pl-16",
    "justify-between",
    "items-stretch",
    "flex-1",
    "self-start",
    "bg-blue-600",
    "text-slate-500",
    "border-red-600",
    "border-2",
    "rounded-full",
    "tracking-tight",
    "inline-flex",
    "font-medium",
  ]) {
    assert.ok(universe.includes(c), `universe must contain ${c}`);
  }
  // The one open hatch stays out — the canvas shims fixed px to inline style.
  assert.ok(!universe.some((c) => c.includes("[")), "no arbitrary values");
  // Sorted + deduped (deterministic output for the generated file).
  assert.deepEqual(universe, [...new Set(universe)].sort());
});

// ---------------------------------------------- image + nested containers --

test("image emits img with src/alt and nested containers thread their context", () => {
  const s: Sketch = {
    id: "sk_i",
    name: "gallery",
    blueprintRef: null,
    schemaVersion: 1,
    root: stack({
      layout: layout({ direction: "row", crossAxis: "center" }),
      children: [
        {
          kind: "image",
          id: "avatar",
          src: "/a.png",
          alt: "avatar",
          sizing: sz(fixed(48), fixed(48)),
        } as SketchNode,
      ],
    }),
  };
  const ir = sketchToIR(s, defaultTheme);
  const img = ir.children[0];
  assert.equal(img.tag, "img");
  assert.deepEqual(img.attrs, { src: "/a.png", alt: "avatar" });
  const cls = classesOf(img.className);
  // Parent is a row: width is the main axis, height the cross.
  assert.ok(cls.includes("w-[48px]"));
  assert.ok(cls.includes("shrink-0"));
  assert.ok(cls.includes("h-[48px]"));
  // Parent crossAxis=center → no self-start opt-out anywhere.
  assert.ok(!cls.includes("self-start"));
});
