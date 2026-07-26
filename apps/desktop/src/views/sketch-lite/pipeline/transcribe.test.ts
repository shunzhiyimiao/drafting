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

// ---- 零开关(2026-07-21 裁决):模式=画布状态的纯函数 ----

import { isEmptyDocument } from "./ai-transcribe";

test("isEmptyDocument: empty root = whole-page landing target, anything else is not", () => {
  const empty = parseSketchMarkup(`<Sketch name="Fresh" schemaVersion={3}>
  <Stack pad={4}></Stack>
</Sketch>`).sketch;
  assert.equal(isEmptyDocument(empty), true);
  const occupied = parseSketchMarkup(VALID_CLEAN).sketch;
  assert.equal(isEmptyDocument(occupied), false);
});
