/**
 * Sketch interpretation (stage 2) — MOCK today, AI tomorrow.
 *
 * 接口是真的(async,吃文档+几何分析,吐结构化解释);实现是确定性启发式:
 * semanticHint 当先验(弱提示,置信度也只给到 medium/high 一档)、几何当证据。
 * 换成真 AI 时只替换本文件的实现体,管线两侧零改动。绝不和 React 纠缠。
 */
import type { Bounds, SketchDocument, SketchShape } from "../model/types";
import type { GeometryAnalysis } from "../geometry/analyze";

export type RegionRole =
  | "header"
  | "sidebar"
  | "footer"
  | "navigation"
  | "content"
  | "card"
  | "card_group"
  | "form"
  | "table"
  | "chart"
  | "list"
  | "toolbar"
  | "unknown";

export interface InterpretedRegion {
  id: string;
  sourceShapeIds: string[];
  role: RegionRole;
  title?: string;
  description: string;
  bounds: Bounds;
  confidence: "high" | "medium" | "low";
  children?: InterpretedRegion[];
}

export type PageType =
  | "dashboard"
  | "landing_page"
  | "form"
  | "list_page"
  | "detail_page"
  | "mobile_app"
  | "unknown";

export interface SketchInterpretation {
  sketchId: string;
  pageType: PageType;
  summary: string;
  regions: InterpretedRegion[];
  ambiguities: { message: string; shapeIds: string[] }[];
}

const ROLE_HINTS: Record<string, RegionRole> = {
  header: "header",
  sidebar: "sidebar",
  nav: "navigation",
  navigation: "navigation",
  footer: "footer",
  card: "card",
  form: "form",
  table: "table",
  chart: "chart",
  list: "list",
  toolbar: "toolbar",
  content: "content",
};

function pageTypeOf(prompt: string): PageType {
  const p = prompt.toLowerCase();
  if (/dashboard|仪表|看板|crm|admin|后台/.test(p)) return "dashboard";
  if (/login|登录|form|表单|注册/.test(p)) return "form";
  if (/landing|落地页|官网/.test(p)) return "landing_page";
  if (/列表|list/.test(p)) return "list_page";
  if (/详情|detail/.test(p)) return "detail_page";
  if (/mobile|手机|移动/.test(p)) return "mobile_app";
  return "unknown";
}

/** Geometry evidence → role, when no hint speaks. */
function roleFromGeometry(s: SketchShape, canvas: { width: number; height: number }): {
  role: RegionRole;
  confidence: "medium" | "low";
} {
  const b = s.bounds;
  const cy = b.y + b.height / 2;
  const cx = b.x + b.width / 2;
  const wide = b.width >= canvas.width * 0.6;
  const tall = b.height >= canvas.height * 0.5;
  if (wide && b.height <= canvas.height * 0.25 && cy <= canvas.height * 0.25) {
    return { role: "header", confidence: "medium" };
  }
  if (wide && cy >= canvas.height * 0.85) return { role: "footer", confidence: "medium" };
  if (tall && b.width <= canvas.width * 0.35 && cx <= canvas.width * 0.3) {
    return { role: "sidebar", confidence: "medium" };
  }
  return { role: "unknown", confidence: "low" };
}

/**
 * The deterministic mock: hints first, then geometry archetypes, then the
 * horizontal-row heuristic (≥2 similar shapes in a band → card_group),
 * containment → children. Anything it can't name lands in `ambiguities`
 * instead of being silently guessed.
 */
export async function interpretSketch(
  doc: SketchDocument,
  analysis: GeometryAnalysis,
): Promise<SketchInterpretation> {
  const regions: InterpretedRegion[] = [];
  const ambiguities: SketchInterpretation["ambiguities"] = [];
  const consumed = new Set<string>();
  const byId = new Map(doc.shapes.map((s) => [s.id, s]));

  // Shapes inside another shape become that region's children, not top-level.
  const insideOf = new Map<string, string>();
  for (const rel of analysis.relationships) {
    if (rel.type === "inside") insideOf.set(rel.a, rel.b);
  }

  const regionOf = (s: SketchShape): InterpretedRegion => {
    const hint = s.semanticHint?.trim().toLowerCase();
    const hinted = hint ? ROLE_HINTS[hint] : undefined;
    const geo = roleFromGeometry(s, doc.canvas);
    const role = hinted ?? geo.role;
    if (!hinted && geo.role === "unknown" && !s.annotation) {
      ambiguities.push({
        message: "无法判断这个矩形想表达什么 — 给它一句注释会更好",
        shapeIds: [s.id],
      });
    }
    return {
      id: `region-${s.id}`,
      sourceShapeIds: [s.id],
      role,
      title: s.annotation?.split(/[,，。;\n]/)[0]?.trim() || undefined,
      description: s.annotation ?? "",
      bounds: s.bounds,
      confidence: hinted ? "high" : geo.confidence,
    };
  };

  // 1. Horizontal rows of similar shapes → one card_group region.
  for (const g of analysis.groups) {
    const members = g.shapeIds
      .map((id) => byId.get(id))
      .filter((s): s is SketchShape => s !== undefined)
      .filter((s) => !insideOf.has(s.id));
    if (members.length < 2) continue;
    members.forEach((m) => consumed.add(m.id));
    regions.push({
      id: `region-group-${members[0].id}`,
      sourceShapeIds: members.map((m) => m.id),
      role: "card_group",
      description:
        members
          .map((m) => m.annotation)
          .filter(Boolean)
          .join(" · ") || `${members.length} 个并排区域`,
      bounds: g.bounds,
      confidence: "medium",
      children: members.map((m) => ({ ...regionOf(m), role: "card" as const })),
    });
  }

  // 2. Remaining top-level shapes → one region each (children attached).
  const topLevel = doc.shapes.filter((s) => !consumed.has(s.id) && !insideOf.has(s.id));
  for (const s of topLevel) {
    const region = regionOf(s);
    const childShapes = doc.shapes.filter((c) => insideOf.get(c.id) === s.id);
    if (childShapes.length > 0) {
      region.children = childShapes.map((c) => regionOf(c));
    }
    regions.push(region);
  }

  // Reading order: top-to-bottom, then left-to-right.
  regions.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

  const pageType = pageTypeOf(doc.pagePrompt);
  return {
    sketchId: doc.id,
    pageType,
    summary:
      doc.pagePrompt.trim() ||
      `${doc.shapes.length} 个形状,${regions.length} 个区域(无页面描述)`,
    regions,
    ambiguities,
  };
}
