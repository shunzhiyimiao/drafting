/**
 * The AI core of Generate UI — O2 decision (2026-07-13, user-ratified):
 * the AI writes the `.sketch` DIALECT directly. Rationale: expressiveness
 * = the full alphabet (styles/Frame/lists), and the dialect's own gates
 * (total parse with line/col errors + validate()) are the best possible
 * repair signals. The mock intent+compiler path stays as the OFFLINE
 * FALLBACK — no key / AI off / two failed repairs land there, loudly.
 *
 * 层次不变:几何分析与确定性解读仍在前(喂给 AI 当证据),编译合同不变
 * (parse + validate 都过才落库)。AI 只解释与设计;门卫是确定性的。
 */
import {
  parseSketchMarkup,
  printSketchMarkup,
  validate,
  MarkupError,
  type Sketch,
} from "@drafting/sketch-core";
import type { SketchDocument } from "../model/types";
import { analyzeGeometry, type GeometryAnalysis } from "../geometry/analyze";
import { interpretSketch, type SketchInterpretation } from "./interpret";
import { generateUiFromSketch } from "./pipeline";

/** The one seam: (system, user) → assistant text. The app wires it to
 *  ai_run_task_collect (task `sketchGenerate`); the harness injects
 *  `window.__liteAiMock`; null = offline → fallback skeleton. */
export type RunAi = (system: string, user: string) => Promise<string>;

export interface SmartGenerateResult {
  mode: "ai" | "fallback";
  sketch: Sketch;
  markup: string;
  /** AI calls actually made (0 for pure fallback). */
  attempts: number;
  /** Why the fallback path was taken (mode === "fallback"). */
  reason?: string;
  analysis: GeometryAnalysis;
  interpretation: SketchInterpretation;
}

const SYSTEM = `你是资深产品 UI 设计师。用户给你一张低保真草图(矩形+注释)和页面描述,你输出一份 Drafting 的 .sketch 方言文档 —— 它会被直接渲染成界面并生成 React 代码。

输出规则(硬性):
- 只输出文档本身:从 <Sketch 开始,到 </Sketch> 结束。不要 markdown 围栏,不要任何解释。
- 根:<Sketch name="..." schemaVersion={3}> 内恰好一个根 <Stack>。
- 不要写 sk:id。x/y 只在 <Frame> 的直接子元素上合法。

方言速查(仅以下元素/属性/枚举合法,超出即解析错误):
<Stack dir="col|row" gap={0|1|2|3|4|6|8|12|16|24} pad={同 gap 档} main="start|center|end|between" cross="start|center|end|stretch" w="fill|hug"或w={像素} h=同 bg fg border radius>…</Stack>
颜色 token(bg/fg 及 border 的颜色位):surface raised text muted primary on-primary border danger on-danger transparent
border="thin <颜色token>" 或 "thick <颜色token>";radius="none|sm|md|lg|xl|full"
<Text role="heading|subhead|body|caption" ...>文字</Text>
<Button variant="primary|secondary|ghost" intent="none|submit" ...>标签</Button>(必须有闭合标签)
<Input label="..." type="text|email|password" placeholder="..." ... />(必须自闭合)
<Image src="/image.png" alt="..." w={px} h={px} ... />(必须自闭合)
<Frame w h ...>自由定位区,直接子元素带 x={整数} y={整数}</Frame>

布局法则:结构用嵌套 Stack(col 竖排 / row 横排);w/h 用 fill(占满)/ hug(自适应)/ 固定像素;间距只有那十档;横排里要"左右分开"用 main="between"。

设计要求:
- 每条注释(comment)的要求都必须落实;注释没说的,按页面描述和常识补全:菜单项、示例文案、按钮标签、合理的留白与层次。
- 语义化布局:草图矩形的相对位置(谁在上/左/包含)是布局意图,不要复刻像素;除非明显是自由摆放的画板才用 Frame。
- 现代、干净:标题层次用 Text 的 role;视觉分区用 bg="raised" + radius + border。

示例输入:页面「Login」,描述"极简登录页";形状:①居中矩形 comment"登录卡片:邮箱+密码+登录按钮"
示例输出:
<Sketch name="Login" schemaVersion={3}>
  <Stack pad={16} gap={4} h="fill" main="center" cross="center">
    <Stack gap={3} pad={6} w={360} bg="raised" radius="lg" border="thin border">
      <Text role="heading">欢迎回来</Text>
      <Input label="邮箱" type="email" placeholder="you@example.com" />
      <Input label="密码" type="password" />
      <Button variant="primary" intent="submit" w="fill">登录</Button>
    </Stack>
  </Stack>
</Sketch>`;

/** The user message: title, page prompt, shapes with comments, geometry
 *  facts and the deterministic reading — evidence, not orders. */
export function buildUserMessage(
  doc: SketchDocument,
  analysis: GeometryAnalysis,
  interp: SketchInterpretation,
  criteria: string[] = [],
): string {
  const lines: string[] = [];
  lines.push(`页面「${doc.title}」`);
  lines.push(`页面描述:${doc.pagePrompt.trim() || "(未提供 — 按形状与注释推断)"}`);
  lines.push(`画布 ${doc.canvas.width}×${doc.canvas.height}px。形状清单(坐标只表达相对布局意图):`);
  doc.shapes.forEach((s, i) => {
    const b = s.bounds;
    const parts = [`${i + 1}. (x${b.x} y${b.y} w${b.width} h${b.height})`];
    if (s.annotation) parts.push(`comment:"${s.annotation}"`);
    if (s.semanticHint) parts.push(`hint:${s.semanticHint}`);
    lines.push(parts.join(" "));
  });
  if (analysis.groups.length > 0) {
    lines.push(
      `几何分组:${analysis.groups
        .map((g) => `横排组[${g.shapeIds.map((id) => idx(doc, id)).join(",")}]`)
        .join(" ")}`,
    );
  }
  const contains = analysis.relationships.filter((r) => r.type === "contains");
  if (contains.length > 0) {
    lines.push(`包含关系:${contains.map((r) => `${idx(doc, r.a)}包含${idx(doc, r.b)}`).join(" ")}`);
  }
  lines.push(
    `初步解读(确定性启发式,仅供参考,可推翻):${interp.regions
      .map((r) => `${r.role}${r.title ? `(${r.title})` : ""}`)
      .join(" · ")}`,
  );
  if (interp.ambiguities.length > 0) {
    lines.push(
      `待你决定的歧义:${interp.ambiguities.map((a) => a.shapeIds.map((id) => idx(doc, id)).join(",")).join(";")} 号形状意图不明 — 结合上下文给它们合理的角色。`,
    );
  }
  if (criteria.length > 0) {
    lines.push(`这个界面关联的验收标准(生成结果应当满足或为其留位):`);
    for (const c of criteria) lines.push(`- ${c}`);
  }
  lines.push(`请输出完整的 .sketch 文档。`);
  return lines.join("\n");
}

function idx(doc: SketchDocument, shapeId: string): string {
  const i = doc.shapes.findIndex((s) => s.id === shapeId);
  return String(i + 1);
}

/** Defensive extraction: strip fences/prose, keep <Sketch …>…</Sketch>. */
export function extractDocument(text: string): string {
  const start = text.indexOf("<Sketch");
  const endTag = "</Sketch>";
  const end = text.lastIndexOf(endTag);
  if (start === -1 || end === -1 || end < start) return text.trim();
  return text.slice(start, end + endTag.length);
}

/** One AI attempt chain: initial call, then at most one parse-repair and
 *  one validate-repair round. Throws with the last reason on defeat. */
async function aiAttempt(
  runAi: RunAi,
  user: string,
  counter: { attempts: number },
): Promise<Sketch> {
  let message = user;
  let parseRepairUsed = false;
  let validateRepairUsed = false;

  for (;;) {
    counter.attempts += 1;
    const raw = await runAi(SYSTEM, message);
    const docText = extractDocument(raw);
    let sketch: Sketch;
    try {
      sketch = parseSketchMarkup(docText).sketch;
    } catch (e) {
      if (parseRepairUsed || !(e instanceof MarkupError)) {
        throw new Error(`方言解析失败:${e instanceof MarkupError ? e.message : String(e)}`);
      }
      parseRepairUsed = true;
      message = `你刚才的文档在第 ${e.line} 行第 ${e.col} 列解析失败:${e.message}\n\n你刚才的输出:\n${docText}\n\n请对照方言速查修正,输出完整的修正文档(仍然只输出文档本身)。`;
      continue;
    }
    const errors = validate(sketch);
    if (errors.length === 0) return sketch;
    if (validateRepairUsed) {
      throw new Error(`语义校验失败:${errors.map((x) => x.message).join("; ")}`);
    }
    validateRepairUsed = true;
    message = `你刚才的文档解析成功但语义校验失败:\n${errors
      .map((x) => `- ${x.message}`)
      .join("\n")}\n\n你刚才的输出:\n${docText}\n\n请修正后输出完整文档(仍然只输出文档本身)。`;
  }
}

/**
 * Generate, smart: AI path when a runner is wired, offline skeleton
 * otherwise or on defeat — ALWAYS loudly labeled, never silent. The
 * returned sketch has passed parse + validate either way.
 */
export async function generateUiSmart(
  doc: SketchDocument,
  opts: { mint: () => string; runAi: RunAi | null; criteria?: string[] },
): Promise<SmartGenerateResult> {
  const analysis = analyzeGeometry(doc);
  const interpretation = await interpretSketch(doc, analysis);
  const counter = { attempts: 0 };

  if (opts.runAi) {
    try {
      const user = buildUserMessage(doc, analysis, interpretation, opts.criteria ?? []);
      const sketch = await aiAttempt(opts.runAi, user, counter);
      // Identity is the tool's: the landing rewrites id; the name follows
      // the lite title (the AI's name attr is advisory only).
      const named: Sketch = { ...sketch, name: doc.title, blueprintRef: null };
      return {
        mode: "ai",
        sketch: named,
        markup: printSketchMarkup(named),
        attempts: counter.attempts,
        analysis,
        interpretation,
      };
    } catch (e) {
      const fallback = await generateUiFromSketch(doc, { sketchId: "sk_pending", mint: opts.mint });
      return {
        mode: "fallback",
        sketch: fallback.sketch,
        markup: fallback.markup,
        attempts: counter.attempts,
        reason: String(e instanceof Error ? e.message : e),
        analysis,
        interpretation,
      };
    }
  }

  const offline = await generateUiFromSketch(doc, { sketchId: "sk_pending", mint: opts.mint });
  return {
    mode: "fallback",
    sketch: offline.sketch,
    markup: offline.markup,
    attempts: 0,
    reason: "AI 未接线(无工程或未配置)",
    analysis,
    interpretation,
  };
}
