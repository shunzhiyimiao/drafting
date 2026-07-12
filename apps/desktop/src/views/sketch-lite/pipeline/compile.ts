/**
 * Spec compiler (stage 4) — DETERMINISTIC, no AI, no mock.
 *
 * UIIntentNode → 现有 sketch-core Spec(SketchNode 树)。这里绝不新造 Spec
 * 类型:角色映射进现有字母表(stack/frame/text/button/input/image),样式走
 * token,布局走 direction/gap/pad 的有限档位。编译结果经 canonical print
 * 变成 `.sketch` 文本 —— 真相落在现有体系里,可编辑、可撤销、可 codegen。
 */
import type {
  ButtonP,
  Container,
  InputP,
  SketchNode,
  SpacingStep,
  TextP,
} from "@drafting/sketch-core";
import type { UIIntentNode } from "./intent";

const STEPS: SpacingStep[] = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];

/** px → 最近的 Tailwind spacing 档(1 step = 4px)。 */
export function toSpacingStep(px: number | undefined, fallback: SpacingStep): SpacingStep {
  if (px === undefined) return fallback;
  const units = px / 4;
  let best = STEPS[0];
  for (const s of STEPS) {
    if (Math.abs(s - units) < Math.abs(best - units)) best = s;
  }
  return best;
}

const hug = { mode: "hug" } as const;
const fill = { mode: "fill" } as const;

interface Ctx {
  mint: () => string;
}

function stack(
  ctx: Ctx,
  over: {
    direction: "row" | "col";
    gap?: SpacingStep;
    pad?: SpacingStep;
    w?: SketchNode["sizing"]["width"];
    h?: SketchNode["sizing"]["height"];
    style?: Container["style"];
    children?: SketchNode[];
    mainAxis?: Container["layout"]["mainAxis"];
    crossAxis?: Container["layout"]["crossAxis"];
  },
): Container {
  const pad = over.pad ?? 0;
  return {
    kind: "stack",
    id: ctx.mint(),
    layout: {
      direction: over.direction,
      gap: over.gap ?? 0,
      padding: { top: pad, right: pad, bottom: pad, left: pad },
      mainAxis: over.mainAxis ?? "start",
      crossAxis: over.crossAxis ?? (over.direction === "row" ? "center" : "stretch"),
    },
    sizing: { width: over.w ?? fill, height: over.h ?? hug },
    ...(over.style ? { style: over.style } : {}),
    children: over.children ?? [],
  };
}

function text(ctx: Ctx, content: string, role: TextP["role"] = "body"): TextP {
  return { kind: "text", id: ctx.mint(), role, content, sizing: { width: hug, height: hug } };
}

function button(ctx: Ctx, label: string): ButtonP {
  return {
    kind: "button",
    id: ctx.mint(),
    label,
    variant: "primary",
    intent: { kind: "none" },
    sizing: { width: hug, height: hug },
  };
}

function input(ctx: Ctx, label: string, placeholder?: string): InputP {
  const node: InputP = {
    kind: "input",
    id: ctx.mint(),
    label,
    type: "text",
    sizing: { width: fill, height: hug },
  };
  if (placeholder) node.placeholder = placeholder;
  return node;
}

function children(ctx: Ctx, node: UIIntentNode): SketchNode[] {
  return (node.children ?? []).map((c) => compileIntentNode(c, ctx));
}

export function compileIntentNode(node: UIIntentNode, ctx: Ctx): SketchNode {
  const gap = toSpacingStep(node.layout?.gap, 4);
  const pad = toSpacingStep(node.layout?.padding, 0);
  const dir: "row" | "col" = node.layout?.direction === "horizontal" ? "row" : "col";

  switch (node.role) {
    case "text":
      return text(ctx, node.content?.text ?? node.name ?? "");
    case "button":
      return button(ctx, node.content?.label ?? node.name ?? "Button");
    case "input":
      return input(ctx, node.content?.label ?? node.name ?? "字段", node.content?.placeholder);
    case "image":
    case "avatar":
      return {
        kind: "image",
        id: ctx.mint(),
        src: "/image.png",
        alt: node.name ?? node.role,
        sizing:
          node.role === "avatar"
            ? { width: { mode: "fixed", px: 40 }, height: { mode: "fixed", px: 40 } }
            : { width: { mode: "fixed", px: 96 }, height: { mode: "fixed", px: 96 } },
        ...(node.role === "avatar" ? { style: { radius: "full" as const } } : {}),
      };

    case "header":
      return stack(ctx, {
        direction: "row",
        gap: toSpacingStep(node.layout?.gap, 3),
        pad: toSpacingStep(node.layout?.padding, 3),
        style: { bg: "raised" },
        mainAxis: "between",
        children: [
          text(ctx, node.content?.text ?? node.name ?? "页面标题", "heading"),
          ...children(ctx, node),
        ],
      });

    case "footer":
      return stack(ctx, {
        direction: "row",
        gap: 3,
        pad: toSpacingStep(node.layout?.padding, 3),
        style: { bg: "raised" },
        children: [
          ...(node.content?.text ? [text(ctx, node.content.text, "caption")] : []),
          ...children(ctx, node),
        ],
      });

    case "sidebar":
      return stack(ctx, {
        direction: "col",
        gap: toSpacingStep(node.layout?.gap, 2),
        pad: toSpacingStep(node.layout?.padding, 3),
        w: { mode: "fixed", px: 220 },
        h: fill,
        style: { bg: "raised" },
        children: [
          text(ctx, node.content?.text ?? node.name ?? "导航", "subhead"),
          ...children(ctx, node),
        ],
      });

    case "navigation":
      return stack(ctx, {
        direction: "row",
        gap: toSpacingStep(node.layout?.gap, 2),
        pad: toSpacingStep(node.layout?.padding, 2),
        children: children(ctx, node),
      });

    case "card":
    case "stats_card": {
      const title = node.content?.text ?? node.name ?? "卡片";
      const body = node.description && node.description !== title ? node.description : null;
      return stack(ctx, {
        direction: "col",
        gap: 1,
        pad: 3,
        w: node.role === "stats_card" ? fill : fill,
        style: { bg: "raised", radius: "md", border: { width: "thin", color: "border" } },
        children: [
          text(ctx, title, node.role === "stats_card" ? "subhead" : "body"),
          ...(body ? [text(ctx, body, "caption")] : []),
          ...children(ctx, node),
        ],
      });
    }

    case "page":
      return stack(ctx, {
        direction: "col",
        gap: toSpacingStep(node.layout?.gap, 0),
        pad: toSpacingStep(node.layout?.padding, 0),
        h: fill,
        children: children(ctx, node),
      });

    // section / table / chart / list / custom → 通用容器(占位角色已在
    // intent 层折进 card,这里剩下的都是纯布局)。
    default:
      return stack(ctx, {
        direction: dir,
        gap,
        pad,
        children: [
          ...(node.content?.text ? [text(ctx, node.content.text, "subhead")] : []),
          ...children(ctx, node),
        ],
      });
  }
}

/** Intent 根(role=page)→ Spec 根容器。 */
export function compileIntent(root: UIIntentNode, mint: () => string): Container {
  const ctx: Ctx = { mint };
  const compiled = compileIntentNode(root, ctx);
  if (compiled.kind === "stack") return compiled;
  // 非容器根(理论不可达):包一层,保持根为 Container 的 Spec 前提。
  return stack(ctx, { direction: "col", h: fill, children: [compiled] });
}
