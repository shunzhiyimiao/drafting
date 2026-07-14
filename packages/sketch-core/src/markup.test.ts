/**
 * Markup dialect tests — the reference implementation's 16 assertions
 * reskinned onto the real Spec (vitest → node:test), plus the Rev 4
 * obligations: Sketch root entity, List/{Bind}/d:Sample round-trip, pad
 * value forms, border, navigate targets, escaping, persist-on-need ids,
 * comment rejection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MarkupError,
  isTempId,
  parseSketchMarkup,
  printSketchMarkup,
  stripForLaw,
} from "./markup.js";
import { SPACING_STEPS } from "./spec.js";
import type { Container, ListP, TextP } from "./spec.js";

const SEED = `<Sketch name="Login" schemaVersion={3}>
  <Stack gap={4} pad={6} h="fill" bg="surface">
    <Text role="heading">Sign in</Text>
    <Input label="Email" type="email" placeholder="you@example.com" />
    <Input label="Password" type="password" />
    <Button sk:id="01ARZ3NDEKTSV4RRFFQ69G5FAV" variant="primary" intent="submit" w="fill">Log in</Button>
    <Text role="caption">Forgot password?</Text>
  </Stack>
</Sketch>`;

const parse = (src: string) => parseSketchMarkup(src).sketch;
const err = (src: string): MarkupError => {
  try {
    parseSketchMarkup(src);
  } catch (e) {
    return e as MarkupError;
  }
  throw new Error("expected MarkupError, parse succeeded");
};
const wrap = (body: string) => `<Sketch name="t" schemaVersion={3}>\n${body}\n</Sketch>`;

// ------------------------------------------------------------------- laws --

test("law: seed round-trips structurally (parse∘print ≡ id)", () => {
  const t = parse(SEED);
  assert.deepEqual(stripForLaw(parse(printSketchMarkup(t))), stripForLaw(t));
});

test("law: canonical print is a fixpoint (print∘parse∘print ≡ print)", () => {
  const s1 = printSketchMarkup(parse(SEED));
  assert.equal(printSketchMarkup(parse(s1)), s1);
});

test("law: nested stacks round-trip", () => {
  const src = wrap(
    `<Stack dir="row" gap={2}><Stack gap={1} w="hug"><Text>a</Text></Stack><Button>b</Button></Stack>`,
  );
  const t = parse(src);
  assert.deepEqual(stripForLaw(parse(printSketchMarkup(t))), stripForLaw(t));
  const inner = (t.root.children[0] as Container).children[0] as TextP;
  assert.equal(inner.content, "a");
});

test("law: a kitchen-sink document round-trips (list, binds, border, pad forms, escapes)", () => {
  const src = `<Sketch sk:id="sk_kitchen" name="Kitchen" blueprintRef="01FEAT" schemaVersion={3}>
  <Stack pad="2 6" h="fill">
    <Text role="heading">A &lt;b&gt; &amp; &#123;x}</Text>
    <Stack dir="row" pad="1 2 3 4" border="thin border" radius="md">
      <Image src="/a.png" alt="logo" w={48} h={48} />
      <Button variant="ghost" intent="navigate:sk_next" w="fill">Go</Button>
    </Stack>
    <List sk:id="mail" dataKey="inbox" h="fill">
      <ItemShape>
        <Field name="id" type="string" key />
        <Field name="subject" type="string" />
        <Field name="avatar" type="image" />
        <Field name="unread" type="boolean" />
        <Field name="count" type="number" />
      </ItemShape>
      <d:Sample id="m1" subject="Hello" avatar="/a1.png" unread="true" count={3} />
      <d:Sample id="m2" subject="World" avatar="/a2.png" unread="false" count={0} />
      <Template>
        <Stack dir="row" cross="center">
          <Image src={Bind avatar} alt="avatar" w={32} h={32} />
          <Text>{Bind subject}</Text>
          <Button sk:id="open-btn" intent="submit">Open</Button>
        </Stack>
      </Template>
    </List>
  </Stack>
</Sketch>`;
  const t = parse(src);
  assert.deepEqual(stripForLaw(parse(printSketchMarkup(t))), stripForLaw(t));
  const s1 = printSketchMarkup(t);
  assert.equal(printSketchMarkup(parse(s1)), s1);

  // Spot-check the Spec mapping.
  assert.equal(t.id, "sk_kitchen");
  assert.equal(t.blueprintRef, "01FEAT");
  const row = t.root.children[1] as Container;
  assert.deepEqual(row.layout.padding, { top: 1, right: 2, bottom: 3, left: 4 });
  assert.deepEqual(row.style?.border, { width: "thin", color: "border" });
  const btn = row.children[1];
  assert.deepEqual(btn.kind === "button" && btn.intent, { kind: "navigate", to: "sk_next" });
  const list = t.root.children[2] as ListP;
  assert.equal(list.dataKey, "inbox");
  assert.deepEqual(list.sampleRows[0], { id: "m1", subject: "Hello", avatar: "/a1.png", unread: true, count: 3 });
  assert.equal(list.itemShape[0].isKey, true);
  const tmplText = list.template.children[1] as TextP;
  assert.deepEqual(tmplText.content, { bind: "subject" });
});

// ------------------------------------------------------- defaults & values --

test("defaults fill in and are omitted on print", () => {
  const t = parse(wrap(`<Stack><Text>hello</Text></Stack>`));
  const txt = t.root.children[0] as TextP;
  assert.equal(txt.role, "body");
  assert.deepEqual(txt.sizing.width, { mode: "hug" });
  assert.equal(t.root.layout.direction, "col");
  assert.equal(t.root.layout.crossAxis, "stretch");
  assert.equal(
    printSketchMarkup(t),
    `<Sketch name="t" schemaVersion={3}>\n  <Stack>\n    <Text>hello</Text>\n  </Stack>\n</Sketch>\n`,
  );
});

test("fixed px parses and reprints as {N}", () => {
  const t = parse(wrap(`<Stack><Image src="x.png" alt="x" w={240} h={48} /></Stack>`));
  const img = t.root.children[0];
  assert.deepEqual(img.sizing.width, { mode: "fixed", px: 240 });
  assert.ok(printSketchMarkup(t).includes(`w={240} h={48}`));
});

test("empty stack prints self-closed", () => {
  const t = parse(wrap(`<Stack></Stack>`));
  assert.ok(printSketchMarkup(t).includes(`<Stack />`));
});

test("pad forms: uniform is canonical, two- and four-value forms survive", () => {
  const uniform = parse(wrap(`<Stack pad={4}><Text>x</Text></Stack>`));
  assert.deepEqual(uniform.root.layout.padding, { top: 4, right: 4, bottom: 4, left: 4 });
  assert.ok(printSketchMarkup(uniform).includes(`pad={4}`));

  const two = parse(wrap(`<Stack pad="2 6"><Text>x</Text></Stack>`));
  assert.deepEqual(two.root.layout.padding, { top: 2, right: 6, bottom: 2, left: 6 });
  assert.ok(printSketchMarkup(two).includes(`pad="2 6"`));

  const four = parse(wrap(`<Stack pad="1 2 3 4"><Text>x</Text></Stack>`));
  assert.ok(printSketchMarkup(four).includes(`pad="1 2 3 4"`));
});

test("persist-on-need ids: sk:id survives, temp ids are never printed", () => {
  const t = parse(SEED);
  const [title, , , button] = t.root.children;
  assert.ok(isTempId(title.id), "unbound text gets a session-temp id");
  assert.equal(button.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
  const printed = printSketchMarkup(t);
  assert.ok(!printed.includes("~"), "temp ids never reach the file");
  assert.ok(printed.includes(`sk:id="01ARZ3NDEKTSV4RRFFQ69G5FAV"`));
});

test("ranges: every node gets a source range for selection sync", () => {
  const { sketch, ranges } = parseSketchMarkup(SEED);
  const ids: string[] = [];
  const walk = (n: typeof sketch.root extends infer R ? (R extends object ? any : never) : never) => {
    ids.push(n.id);
    if (n.kind === "stack") n.children.forEach(walk);
    if (n.kind === "list") walk(n.template);
  };
  walk(sketch.root);
  for (const id of ids) {
    assert.ok(ranges[id], `range for ${id}`);
    assert.ok(ranges[id].end > ranges[id].start);
  }
});

// ---------------------------------------------------------- precise errors --

test("unknown element", () => {
  const e = err(wrap(`<Stack><Panel /></Stack>`));
  assert.ok(e.message.includes("未知元素 <Panel>"));
  assert.ok(e.pos > 0);
});

test("off-ramp spacing", () => {
  const e = err(wrap(`<Stack gap={17}><Text>x</Text></Stack>`));
  assert.ok(e.message.includes("不在间距刻度"));
  assert.ok(e.message.includes(SPACING_STEPS.join(",")));
});

test("enum outside alphabet lists the alphabet", () => {
  const e = err(wrap(`<Stack><Button variant="fancy">x</Button></Stack>`));
  assert.ok(e.message.includes(`variant="fancy" 不在字母表`));
  assert.ok(e.message.includes("primary, secondary, ghost"));
});

test("expressions are rejected as such", () => {
  const e = err(wrap(`<Stack><Button w={size()}>x</Button></Stack>`));
  assert.ok(e.message.includes("方言不含表达式"));
});

test("unknown attribute names the allowed set", () => {
  const e = err(wrap(`<Stack><Button onClick="x">x</Button></Stack>`));
  assert.ok(e.message.includes("不接受属性 onClick"));
  assert.ok(e.message.includes("variant"));
});

test("Input must self-close", () => {
  assert.ok(err(wrap(`<Stack><Input label="a">x</Input></Stack>`)).message.includes("必须自闭合"));
});

test("mismatched closing tag", () => {
  assert.ok(err(wrap(`<Stack><Text>x</Button></Stack>`)).message.includes("与 <Text> 不匹配"));
});

test("root must be <Sketch> containing a root <Stack>", () => {
  assert.ok(err(`<Stack><Text>hi</Text></Stack>`).message.includes("根元素必须是 <Sketch>"));
  assert.ok(
    err(`<Sketch name="t" schemaVersion={3}><Text>hi</Text></Sketch>`).message.includes(
      "唯一子元素必须是根 <Stack>",
    ),
  );
});

test("unclosed stack", () => {
  // EOF inside the tree — nothing left to close anything.
  assert.ok(err(`<Sketch name="t" schemaVersion={3}>\n<Stack><Text>x</Text>`).message.includes("未闭合"));
  // With the document closer present, the mismatch is named instead.
  assert.ok(err(wrap(`<Stack><Text>x</Text>`)).message.includes("与 <Stack> 不匹配"));
});

test("Image requires src and alt", () => {
  assert.ok(err(wrap(`<Stack><Image src="x.png" /></Stack>`)).message.includes("需要 src 与 alt"));
});

test("bind outside a template is a positioned error", () => {
  const e = err(wrap(`<Stack><Text>{Bind subject}</Text></Stack>`));
  assert.ok(e.message.includes("绑定只在 <Template> 内"));
});

test("bind to an undeclared field names the declared set", () => {
  const e = err(
    wrap(`<List dataKey="rows">
      <ItemShape><Field name="id" type="string" key /></ItemShape>
      <Template><Stack><Text>{Bind ghost}</Text></Stack></Template>
    </List>`),
  );
  assert.ok(e.message.includes("{Bind ghost} 不在 ItemShape 已声明字段"));
  assert.ok(e.message.includes("id"));
});

test("d:Sample fields are typed by the shape", () => {
  const e = err(
    wrap(`<List dataKey="rows">
      <ItemShape><Field name="n" type="number" key /></ItemShape>
      <d:Sample n="three" />
      <Template><Stack /></Template>
    </List>`),
  );
  assert.ok(e.message.includes("number 字段"));
});

test("border outside the alphabet is named", () => {
  const e = err(wrap(`<Stack border="chunky border"><Text>x</Text></Stack>`));
  assert.ok(e.message.includes(`border 宽度 "chunky" 不在字母表`));
});

test("a newer schemaVersion is refused (read-only path, never a rewrite)", () => {
  const e = err(`<Sketch name="t" schemaVersion={99}><Stack /></Sketch>`);
  assert.ok(e.message.includes("高于本实现支持"));
});

test("comments are parked, not silently skipped", () => {
  const e = err(`<Sketch name="t" schemaVersion={3}>\n  <!-- note -->\n  <Stack />\n</Sketch>`);
  assert.ok(e.message.includes("不含注释"));
});

test("errors carry line and column for editor markers", () => {
  const e = err(`<Sketch name="t" schemaVersion={3}>\n  <Stack>\n    <Panel />\n  </Stack>\n</Sketch>`);
  assert.equal(e.line, 3);
  assert.ok(e.col > 0);
});

test("escaped text and attributes round-trip", () => {
  const src = wrap(`<Stack><Text>a &lt;tag&gt; &amp; &#123;curly}</Text><Input label="say &quot;hi&quot;" /></Stack>`);
  const t = parse(src);
  const txt = t.root.children[0] as TextP;
  assert.equal(txt.content, "a <tag> & {curly}");
  const again = parse(printSketchMarkup(t));
  assert.deepEqual(stripForLaw(again), stripForLaw(t));
});

// ------------------------------------------------------- Frame (Rev 5 / S5) --

test("law: a Frame document round-trips; canonical print always writes x/y", () => {
  const src = wrap(
    `<Stack h="fill">
    <Frame sk:id="fr1" h={240} bg="raised">
      <Text x={12} y={8} role="heading">Pinned</Text>
      <Button sk:id="bt1" x={40} y={120} variant="primary">Go</Button>
      <Image src="/a.png" alt="dot" w={16} h={16} />
    </Frame>
  </Stack>`,
  );
  const t = parse(src);
  assert.deepEqual(stripForLaw(parse(printSketchMarkup(t))), stripForLaw(t));

  const frame = t.root.children[0];
  assert.equal(frame.kind, "frame");
  const kids = (frame as { children: import("./spec.js").SketchNode[] }).children;
  assert.deepEqual(kids[0].pos, { x: 12, y: 8 });
  assert.deepEqual(kids[1].pos, { x: 40, y: 120 });
  // Missing x/y on the image default to 0 — and canonical print makes them explicit.
  assert.deepEqual(kids[2].pos, { x: 0, y: 0 });
  const printed = printSketchMarkup(t);
  assert.match(printed, /<Image x=\{0\} y=\{0\}/);
  // Frame defaults (w fill, h 200) omit; h={240} prints.
  assert.match(printed, /<Frame sk:id="fr1" h=\{240\} bg="raised">/);
  // Fixpoint with frames present.
  assert.equal(printSketchMarkup(parse(printed)), printed);
});

test("Frame: negative positions are legal (a child may hang off the edge)", () => {
  const t = parse(wrap(`<Stack h="fill"><Frame><Button x={-8} y={4}>b</Button></Frame></Stack>`));
  const frame = t.root.children[0] as { children: { pos?: { x: number; y: number } }[] };
  assert.deepEqual(frame.children[0].pos, { x: -8, y: 4 });
});

test("x/y outside a Frame's direct children are positioned dialect errors", () => {
  const onStack = err(wrap(`<Stack h="fill"><Button x={10}>b</Button></Stack>`));
  assert.match(onStack.message, /只在 <Frame> 的直接子级/);
  assert.ok(onStack.line >= 2, "error carries a position");
  // A stack INSIDE a frame resets the context: its own children are flow.
  const nested = err(
    wrap(`<Stack h="fill"><Frame><Stack x={4} y={4} w={100} h={40}><Text x={1}>t</Text></Stack></Frame></Stack>`),
  );
  assert.match(nested.message, /只在 <Frame> 的直接子级/);
});

test("x/y must be integer pixels", () => {
  const e = err(wrap(`<Stack h="fill"><Frame><Button x="left">b</Button></Frame></Stack>`));
  assert.match(e.message, /需为整数像素/);
});

// ------------------------------------------------- panel variant (Phase 2) --

test("panel variant: parses, prints canonically, plain stays unwritten", () => {
  const src = wrap(
    `<Stack h="fill"><Stack variant="card"><Text>a</Text></Stack><Stack variant="island" /><Stack gap={2} /></Stack>`,
  );
  const t = parse(src);
  const [card, island, plain] = t.root.children as Container[];
  assert.equal(card.variant, "card");
  assert.equal(island.variant, "island");
  assert.equal(plain.variant, undefined, "plain ≡ absent");
  const printed = printSketchMarkup(t);
  assert.match(printed, /variant="card"/);
  assert.match(printed, /variant="island"/);
  assert.equal(printSketchMarkup(parse(printed)), printed, "fixpoint holds");
  // explicit plain normalizes to absent
  const p2 = parse(wrap(`<Stack h="fill"><Stack variant="plain" /></Stack>`));
  assert.ok(!printSketchMarkup(p2).includes("variant="));
});

test("panel variant: Stack alphabet is plain/card/island; Button keeps its own variant alphabet", () => {
  const e = err(wrap(`<Stack h="fill"><Stack variant="primary" /></Stack>`));
  assert.match(e.message, /plain, card, island/);
  // Button variant untouched by the qualification
  const ok = parse(wrap(`<Stack h="fill"><Button variant="ghost">b</Button></Stack>`));
  assert.equal((ok.root.children[0] as { variant: string }).variant, "ghost");
});
