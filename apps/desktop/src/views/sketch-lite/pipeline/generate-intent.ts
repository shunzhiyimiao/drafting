/**
 * Intent generation (stage 3) — MOCK today, AI tomorrow.
 *
 * 吃解释、吐语义化的 UIIntentNode 树。确定性版本只做骨架编排:header 置顶、
 * sidebar 拉一列横排把剩余内容包进右侧、card_group 展开为 stats_card 行、
 * 其余区域按阅读序落 content。真 AI 接入时替换实现体,类型不动。
 */
import type { InterpretedRegion, SketchInterpretation } from "./interpret";
import type { UIIntentNode } from "./intent";

function intentOfRegion(r: InterpretedRegion, mint: () => string): UIIntentNode {
  const base = { id: mint(), name: r.title, description: r.description || undefined };
  switch (r.role) {
    case "header":
      return {
        ...base,
        role: "header",
        layout: { direction: "horizontal", gap: 12, padding: 12 },
        content: { text: r.title ?? "页面标题" },
      };
    case "footer":
      return {
        ...base,
        role: "footer",
        layout: { direction: "horizontal", gap: 12, padding: 12 },
        content: { text: r.title ?? "" },
      };
    case "sidebar":
      return {
        ...base,
        role: "sidebar",
        layout: { direction: "vertical", gap: 8, padding: 12 },
        content: { text: r.title ?? "导航" },
      };
    case "navigation":
    case "toolbar":
      return { ...base, role: "navigation", layout: { direction: "horizontal", gap: 8, padding: 8 } };
    case "card_group":
      return {
        ...base,
        role: "section",
        layout: { direction: "horizontal", gap: 16 },
        children: (r.children ?? []).map((c) => ({
          id: mint(),
          role: "stats_card" as const,
          name: c.title,
          description: c.description || undefined,
          content: { text: c.title ?? "指标" },
        })),
      };
    case "card":
      return { ...base, role: "card", content: { text: r.title ?? "卡片" } };
    case "form":
      return {
        ...base,
        role: "section",
        layout: { direction: "vertical", gap: 12, padding: 16 },
        children: [
          { id: mint(), role: "input", content: { label: r.title ?? "字段" } },
          { id: mint(), role: "button", content: { label: "提交" } },
        ],
      };
    case "table":
    case "chart":
    case "list":
      // Spec 没有这些原语 —— 诚实的占位卡,角色留在 description 里。
      return {
        ...base,
        role: "card",
        content: { text: `${r.title ?? r.role} (${r.role} 占位)` },
      };
    default: {
      const children = (r.children ?? []).map((c) => intentOfRegion(c, mint));
      return {
        ...base,
        role: "section",
        layout: { direction: "vertical", gap: 12, padding: 12 },
        content: r.title ? { text: r.title } : undefined,
        children: children.length > 0 ? children : undefined,
      };
    }
  }
}

export async function generateIntent(
  interp: SketchInterpretation,
  opts: { title: string; mint: () => string },
): Promise<UIIntentNode> {
  const { mint } = opts;
  const header = interp.regions.filter((r) => r.role === "header");
  const footer = interp.regions.filter((r) => r.role === "footer");
  const sidebar = interp.regions.filter((r) => r.role === "sidebar");
  const rest = interp.regions.filter(
    (r) => r.role !== "header" && r.role !== "footer" && r.role !== "sidebar",
  );

  const content: UIIntentNode = {
    id: mint(),
    role: "section",
    name: "content",
    layout: { direction: "vertical", gap: 16, padding: 16 },
    children: rest.map((r) => intentOfRegion(r, mint)),
  };

  const body: UIIntentNode =
    sidebar.length > 0
      ? {
          id: mint(),
          role: "section",
          name: "body",
          layout: { direction: "horizontal", gap: 0 },
          children: [...sidebar.map((r) => intentOfRegion(r, mint)), content],
        }
      : content;

  return {
    id: mint(),
    role: "page",
    name: opts.title,
    description: interp.summary,
    layout: { direction: "vertical", gap: 0 },
    children: [...header.map((r) => intentOfRegion(r, mint)), body, ...footer.map((r) => intentOfRegion(r, mint))],
  };
}
