/**
 * UI Intent — the semantic layer between interpretation and Spec (stage 3).
 *
 * 区分四层:形状说"这里有个矩形";解释说"这像三个 KPI 区域之一";Intent 说
 * "这应该是三列统计卡区";Spec 说"建这些 Stack/Card 节点"。层与层不许混。
 */

export type LayoutDirection = "horizontal" | "vertical" | "grid" | "absolute";

export type UIComponentRole =
  | "page"
  | "section"
  | "header"
  | "sidebar"
  | "footer"
  | "navigation"
  | "text"
  | "button"
  | "input"
  | "card"
  | "stats_card"
  | "table"
  | "chart"
  | "list"
  | "image"
  | "avatar"
  | "custom";

export interface UIIntentNode {
  id: string;
  role: UIComponentRole;
  name?: string;
  description?: string;
  layout?: {
    direction: LayoutDirection;
    columns?: number;
    gap?: number;
    padding?: number;
  };
  content?: {
    text?: string;
    placeholder?: string;
    label?: string;
  };
  children?: UIIntentNode[];
}
