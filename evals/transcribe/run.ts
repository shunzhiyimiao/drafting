/**
 * Paste-transcription eval harness (P3.1) — DEV TOOL, never product code.
 *
 * clipboard-image stand-in (fixture PNG) → VLM (direct Anthropic call, env
 * key) → dialect parse + validate gates → deterministic scoring against a
 * HAND-WRITTEN golden. Laws enforced here:
 *   - any `sk:id` in VLM output ⇒ INVALID (AI never mints identity);
 *   - closed alphabet: parse/validate failures are scored as invalid, the
 *     schema is never bent toward a screenshot;
 *   - measurement discipline: the report header pins model + prompt hash +
 *     date — cross-run comparisons require the triple to match.
 *
 *   ANTHROPIC_API_KEY=sk-… npx tsx evals/transcribe/run.ts [fixture] [--score-only]
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseSketchMarkup,
  validate,
  type Sketch,
  type SketchNode,
} from "../../packages/sketch-core/src/index.js";

const ROOT = path.join("evals", "transcribe");
const FIXTURES = path.join(ROOT, "fixtures");
const GOLDENS = path.join(ROOT, "goldens");
const OUT = path.join(ROOT, "out");

const MODEL = process.env.EVAL_MODEL ?? "claude-sonnet-4-6";

// ------------------------------------------------------------- the prompt --

const SYSTEM = `你是界面结构转写员。给你一张界面截图,你输出一份 Drafting 的 .sketch 方言文档 —— 转写它的**结构**,不是复刻它的像素。视觉保真属于生成器与主题,永远不属于转写。

输出规则(硬性):
- 只输出文档本身:从 <Sketch 开始,到 </Sketch> 结束。不要围栏,不要解释。
- 根:<Sketch name="..." schemaVersion={3}> 内恰好一个根 <Stack>。
- **绝对不要写 sk:id**——身份由工具铸造,你写了整份输出作废。
- x/y 只在 <Frame> 的直接子元素上合法;截图是常规排版时不要用 Frame。

方言速查(仅以下元素/属性/枚举合法):
<Stack dir="col|row" gap={0|1|2|3|4|6|8|12|16|24} pad={同 gap 档} main="start|center|end|between" cross="start|center|end|stretch" variant="plain|card|island" w="fill|hug"或w={像素} h=同 bg fg border radius>…</Stack>
颜色 token:surface raised text muted primary on-primary border danger on-danger transparent
<Text role="heading|subhead|body|caption">文字</Text>
<Button variant="primary|secondary|ghost" intent="none|submit">标签</Button>
<Input label="..." type="text|email|password" placeholder="..." />
<Image src="/image.png" alt="..." w={px} h={px} />(占位符——绝不提取真实图片资源)
<Frame w h>(仅自由摆放画板)</Frame>

转写法则:
- 结构归结构:布局层级用嵌套 Stack 表达;卡片状分区用 variant="card"。
- 可见文本**逐字**转写(它们是意图)——标题、按钮标签、正文、占位文本。
- 图片/图表/视频/地图等不可表达元素:就近映射(图表→Image 占位)或整体丢弃,**绝不发明新元素**。
- 宁可粗略,不可越界:拿不准的间距用默认,拿不准的元素宁可略过。`;

/** fragment-* 夹具的附则(P3.3 裁决:非空落点粘贴=模块):根 Stack 即
 *  模块容器,不要页面级外壳 —— 裁判指标随之多一条「无外壳」。 */
const FRAGMENT_ADDENDUM = `

模块约定(本图是一个局部模块,不是整页):根 <Stack> 就是这个模块自身的容器(它的布局属性=模块布局);不要页面级外壳:不要 h="fill",不要居中壳,不要页面背景;模块之外的环境一概不转写。`;

const systemFor = (name: string): string =>
  name.startsWith("fragment-") ? SYSTEM + FRAGMENT_ADDENDUM : SYSTEM;

const PROMPT_HASH = crypto
  .createHash("sha256")
  .update(SYSTEM + FRAGMENT_ADDENDUM)
  .digest("hex")
  .slice(0, 12);

// --------------------------------------------------------------- VLM call --

async function transcribe(pngPath: string, system: string = SYSTEM): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 未设置(harness 直调 API,不走产品链)");
  const data = fs.readFileSync(pngPath).toString("base64");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data } },
            { type: "text", text: "转写这张截图为 .sketch 文档。" },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[] };
  return body.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

function extractDocument(text: string): string {
  const start = text.indexOf("<Sketch");
  const end = text.lastIndexOf("</Sketch>");
  if (start === -1 || end === -1 || end < start) return text.trim();
  return text.slice(start, end + "</Sketch>".length);
}

// ------------------------------------------------------------- the scorer --

interface Facts {
  kinds: string[];
  edges: string[];
  texts: string[];
}

function factsOf(sketch: Sketch): Facts {
  const kinds: string[] = [];
  const edges: string[] = [];
  const texts: string[] = [];
  const walk = (n: SketchNode, parentKind: string | null) => {
    kinds.push(n.kind);
    if (parentKind) edges.push(`${parentKind}>${n.kind}`);
    if (n.kind === "text" && typeof n.content === "string" && n.content.trim()) {
      texts.push(n.content.trim());
    }
    if (n.kind === "button" && n.label.trim()) texts.push(n.label.trim());
    if (n.kind === "input") {
      if (n.label.trim()) texts.push(n.label.trim());
      if (n.placeholder?.trim()) texts.push(n.placeholder.trim());
    }
    if (n.kind === "stack" || n.kind === "frame") {
      for (const c of n.children) walk(c, n.kind);
    }
    if (n.kind === "list") walk(n.template, n.kind);
  };
  walk(sketch.root, null);
  return { kinds, edges, texts };
}

/** Multiset precision/recall/F1. */
function f1(out: string[], gold: string[]): { p: number; r: number; f1: number } {
  const bag = new Map<string, number>();
  for (const g of gold) bag.set(g, (bag.get(g) ?? 0) + 1);
  let hit = 0;
  for (const o of out) {
    const n = bag.get(o) ?? 0;
    if (n > 0) {
      hit++;
      bag.set(o, n - 1);
    }
  }
  const p = out.length === 0 ? 0 : hit / out.length;
  const r = gold.length === 0 ? 0 : hit / gold.length;
  return { p, r, f1: p + r === 0 ? 0 : (2 * p * r) / (p + r) };
}

/** Verbatim recall: golden strings found EXACTLY in the output's text set. */
function verbatim(out: string[], gold: string[]): number {
  if (gold.length === 0) return 1;
  const set = new Set(out);
  return gold.filter((g) => set.has(g)).length / gold.length;
}

// -------------------------------------------------------------------- main --

interface RowResult {
  fixture: string;
  status: "scored" | "invalid" | "no-golden" | "error";
  reason?: string;
  kindF1?: number;
  edgeF1?: number;
  textVerbatim?: number;
}

async function main() {
  const args = process.argv.slice(2);
  const scoreOnly = args.includes("--score-only");
  const only = args.find((a) => !a.startsWith("--"));

  fs.mkdirSync(OUT, { recursive: true });
  const fixtures = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""))
    .filter((f) => !only || f === only)
    .sort();
  if (fixtures.length === 0) {
    console.error("没有夹具 — 先跑 npx tsx evals/transcribe/make-fixtures.ts");
    process.exit(1);
  }

  const rows: RowResult[] = [];
  for (const name of fixtures) {
    const outFile = path.join(OUT, `${name}.sketch`);
    try {
      let markup: string;
      if (scoreOnly) {
        if (!fs.existsSync(outFile)) {
          rows.push({ fixture: name, status: "error", reason: "score-only 但无缓存输出" });
          continue;
        }
        markup = fs.readFileSync(outFile, "utf8");
      } else {
        console.log(`⏳ ${name}: 转写中…`);
        const raw = await transcribe(path.join(FIXTURES, `${name}.png`), systemFor(name));
        markup = extractDocument(raw);
        fs.writeFileSync(outFile, markup); // markup text only — never pixels
      }

      // Hard law: the AI never mints identity.
      if (/sk:id\s*=/.test(markup)) {
        rows.push({ fixture: name, status: "invalid", reason: "输出含 sk:id(AI 铸造身份)" });
        continue;
      }
      let sketch: Sketch;
      try {
        sketch = parseSketchMarkup(markup).sketch;
      } catch (e) {
        rows.push({ fixture: name, status: "invalid", reason: `parse: ${String(e).slice(0, 120)}` });
        continue;
      }
      const errs = validate(sketch);
      if (errs.length > 0) {
        rows.push({
          fixture: name,
          status: "invalid",
          reason: `validate: ${errs.map((x) => x.message).join("; ").slice(0, 160)}`,
        });
        continue;
      }

      const goldenFile = path.join(GOLDENS, `${name}.sketch`);
      if (!fs.existsSync(goldenFile)) {
        rows.push({ fixture: name, status: "no-golden" });
        continue;
      }
      const golden = parseSketchMarkup(fs.readFileSync(goldenFile, "utf8")).sketch;
      const gf = factsOf(golden);
      const of = factsOf(sketch);
      rows.push({
        fixture: name,
        status: "scored",
        kindF1: f1(of.kinds, gf.kinds).f1,
        edgeF1: f1(of.edges, gf.edges).f1,
        textVerbatim: verbatim(of.texts, gf.texts),
      });
    } catch (e) {
      rows.push({ fixture: name, status: "error", reason: String(e).slice(0, 200) });
    }
  }

  // ------------------------------------------------------------- reporting --
  const date = new Date().toISOString().slice(0, 10);
  const pct = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);
  const scored = rows.filter((r) => r.status === "scored");
  const avg = (k: "kindF1" | "edgeF1" | "textVerbatim") =>
    scored.length === 0
      ? undefined
      : scored.reduce((n, r) => n + (r[k] ?? 0), 0) / scored.length;

  const md = [
    `# Paste 转写评测报告`,
    ``,
    `- 模型: \`${MODEL}\``,
    `- prompt hash: \`${PROMPT_HASH}\``,
    `- 日期: ${date}`,
    `- 夹具: ${rows.length} · 计分: ${scored.length} · invalid: ${rows.filter((r) => r.status === "invalid").length} · 缺 golden: ${rows.filter((r) => r.status === "no-golden").length}`,
    ``,
    `| fixture | 状态 | kind F1 | 边 F1 | 文本逐字 | 备注 |`,
    `|---|---|---|---|---|---|`,
    ...rows.map(
      (r) =>
        `| ${r.fixture} | ${r.status} | ${pct(r.kindF1)} | ${pct(r.edgeF1)} | ${pct(r.textVerbatim)} | ${r.reason ?? ""} |`,
    ),
    ``,
    `**均值(仅计分行):kind F1 ${pct(avg("kindF1"))} · 边 F1 ${pct(avg("edgeF1"))} · 文本逐字 ${pct(avg("textVerbatim"))}**`,
    ``,
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, "report.md"), md);
  fs.writeFileSync(
    path.join(ROOT, "report.json"),
    JSON.stringify({ model: MODEL, promptHash: PROMPT_HASH, date, rows }, null, 2),
  );
  console.log(md);
}

void main();
