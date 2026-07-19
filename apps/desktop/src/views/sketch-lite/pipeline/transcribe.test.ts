/**
 * P3.2 拓印单测:门卫复用(parse/validate 修复环)、伪造身份剥除
 * (AI 永不铸造 sk:id)、图片逐轮重发。node:test 直跑,无 DOM
 * (encodePastedImage 依赖 canvas,归 e2e/真机)。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSketchMarkup, isTempId, type SketchNode } from "@drafting/sketch-core";
import {
  stripFabricatedIds,
  transcribeImage,
  type PastedImage,
  type RunAiVision,
} from "./ai-transcribe";

const IMAGE: PastedImage = { mediaType: "image/png", dataBase64: "QUJD" };

const VALID_WITH_FAKE_ID = `<Sketch name="Login" schemaVersion={3}>
  <Stack pad={16} gap={4} h="fill" main="center" cross="center">
    <Text sk:id="01FAKEFAKEFAKEFAKEFAKEFAKE" role="heading">欢迎回来</Text>
  </Stack>
</Sketch>`;

const VALID_CLEAN = `<Sketch name="Login" schemaVersion={3}>
  <Stack pad={16} gap={4} h="fill" main="center" cross="center">
    <Text role="heading">欢迎回来</Text>
  </Stack>
</Sketch>`;

function allNodes(root: SketchNode): SketchNode[] {
  const out: SketchNode[] = [root];
  if (root.kind === "stack" || root.kind === "frame") {
    for (const c of root.children) out.push(...allNodes(c));
  }
  if (root.kind === "list") out.push(...allNodes(root.template));
  return out;
}

test("stripFabricatedIds replaces persistent ids with temp ids", () => {
  const { sketch } = parseSketchMarkup(VALID_WITH_FAKE_ID);
  const { sketch: stripped, stripped: count } = stripFabricatedIds(sketch);
  assert.equal(count, 1);
  for (const n of allNodes(stripped.root)) {
    assert.ok(isTempId(n.id) || n.id === "", `node ${n.kind} still has ${n.id}`);
  }
});

test("stripFabricatedIds is idempotent", () => {
  const { sketch } = parseSketchMarkup(VALID_WITH_FAKE_ID);
  const once = stripFabricatedIds(sketch);
  const twice = stripFabricatedIds(once.sketch);
  assert.equal(twice.stripped, 0);
});

test("transcribe success: fences stripped, fake sk:id never reaches markup", async () => {
  const seen: { system: string; user: string; image: PastedImage }[] = [];
  const runAi: RunAiVision = async (system, user, image) => {
    seen.push({ system, user, image });
    return "```\n" + VALID_WITH_FAKE_ID + "\n```";
  };
  const result = await transcribeImage(IMAGE, { runAi, title: "登录页" });
  assert.equal(result.attempts, 1);
  assert.equal(result.strippedIds, 1);
  assert.ok(!result.markup.includes("sk:id"), "fabricated identity must not survive");
  assert.equal(result.sketch.name, "登录页");
  assert.equal(seen[0].image.dataBase64, "QUJD");
  assert.ok(seen[0].system.includes("拓印"), "transcribe uses its own system prompt");
});

test("transcribe parse-repair round re-sends the image", async () => {
  let calls = 0;
  const images: PastedImage[] = [];
  const runAi: RunAiVision = async (_s, _u, image) => {
    images.push(image);
    calls += 1;
    return calls === 1 ? `<Sketch name="X" schemaVersion={3}><Bogus /></Sketch>` : VALID_CLEAN;
  };
  const result = await transcribeImage(IMAGE, { runAi, title: "X" });
  assert.equal(result.attempts, 2);
  assert.equal(images.length, 2);
  assert.equal(images[1].dataBase64, "QUJD");
});

test("transcribe defeat throws — no silent fallback", async () => {
  const runAi: RunAiVision = async () =>
    `<Sketch name="X" schemaVersion={3}><Bogus /></Sketch>`;
  await assert.rejects(
    () => transcribeImage(IMAGE, { runAi, title: "X" }),
    /方言解析失败/,
  );
});

// ---- scope 判定与碎片插入(整页替换/模块插入 语义分裂) ----

import {
  extractScope,
  fragmentSubtree,
  insertSubtree,
} from "./ai-transcribe";

const FRAGMENT_DOC = `<Sketch name="Card" schemaVersion={3}>
  <Stack gap={2} pad={4} bg="raised" radius="md">
    <Text role="subhead">卡片标题</Text>
    <Button variant="secondary">操作</Button>
  </Stack>
</Sketch>`;

test("extractScope reads the verdict line, ignores doc body", () => {
  assert.equal(extractScope("scope: fragment\n<Sketch ..."), "fragment");
  assert.equal(extractScope("  Scope: PAGE \n<Sketch ..."), "page");
  assert.equal(extractScope("<Sketch ...>scope: fragment</Sketch>"), null);
  assert.equal(extractScope("no verdict at all"), null);
});

test("scope is captured on round 1 and sticky across repair rounds", async () => {
  let calls = 0;
  const runAi: RunAiVision = async () => {
    calls += 1;
    // 首轮宣告 fragment 但文档非法;修复轮只回文档、不再带 scope 行。
    return calls === 1
      ? `scope: fragment\n<Sketch name="X" schemaVersion={3}><Bogus /></Sketch>`
      : FRAGMENT_DOC;
  };
  const result = await transcribeImage(IMAGE, { runAi, title: "X" });
  assert.equal(result.scope, "fragment");
  assert.equal(result.attempts, 2);
});

test("scope absent → defaults to page (pre-scope behavior)", async () => {
  const runAi: RunAiVision = async () => VALID_CLEAN;
  const result = await transcribeImage(IMAGE, { runAi, title: "X" });
  assert.equal(result.scope, "page");
});

test("fragmentSubtree: multi-child keeps the root Stack, single child unwraps", () => {
  const multi = parseSketchMarkup(FRAGMENT_DOC).sketch;
  assert.equal(fragmentSubtree(multi).kind, "stack");
  const single = parseSketchMarkup(VALID_CLEAN).sketch;
  assert.equal(fragmentSubtree(single).kind, "text");
});

test("insertSubtree anchor rules: container append / leaf after / null → root end", () => {
  const host = () =>
    parseSketchMarkup(`<Sketch name="Host" schemaVersion={3}>
  <Stack pad={4} gap={4}>
    <Text role="heading">头</Text>
    <Stack sk:id="01BOX000000000000000000000" gap={2}>
      <Text role="body">盒内</Text>
    </Stack>
    <Button variant="primary">尾</Button>
  </Stack>
</Sketch>`).sketch;
  const frag = () => fragmentSubtree(parseSketchMarkup(FRAGMENT_DOC).sketch);

  // 锚=容器 → 作为末子插入
  const a = host();
  insertSubtree(a, frag(), "01BOX000000000000000000000");
  const box = a.root.children[1];
  assert.ok(box.kind === "stack" && box.children.length === 2);

  // 锚=叶子 → 插在它后面
  const b = host();
  const headingId = b.root.children[0].id;
  insertSubtree(b, frag(), headingId);
  assert.equal(b.root.children.length, 4);
  assert.equal(b.root.children[1].kind, "stack");

  // 无锚 → 根末尾
  const c = host();
  insertSubtree(c, frag(), null);
  assert.equal(c.root.children.length, 4);
  assert.equal(c.root.children[3].kind, "stack");
});

test("insertSubtree into a frame coerces pos + sheds fill (placeInFrame law)", () => {
  const host = parseSketchMarkup(`<Sketch name="F" schemaVersion={3}>
  <Stack pad={4}>
    <Frame sk:id="01FRM000000000000000000000" w={400} h={300}>
    </Frame>
  </Stack>
</Sketch>`).sketch;
  const frag = parseSketchMarkup(`<Sketch name="W" schemaVersion={3}>
  <Stack gap={2} w="fill">
    <Text role="body">甲</Text>
    <Text role="body">乙</Text>
  </Stack>
</Sketch>`).sketch;
  const node = fragmentSubtree(frag);
  insertSubtree(host, node, "01FRM000000000000000000000");
  const frame = host.root.children[0];
  assert.ok(frame.kind === "frame");
  const inserted = frame.children[0];
  assert.deepEqual(inserted.pos, { x: 8, y: 8 });
  assert.equal(inserted.sizing.width.mode, "hug");
});
