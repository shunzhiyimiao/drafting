/**
 * Token system (docs/sketch-design.md §5): Style stores semantic token
 * references; `resolve(token, theme) → class` is a pure lookup over a
 * swappable binding table. MVP ships one light theme; dark = same token
 * names, different bindings (Spec zero-change).
 */
import type { ButtonVariant, ColorToken, RadiusToken, Style, TypeToken } from "./spec.js";

export interface Theme {
  /** token → tailwind color suffix ("white", "slate-900", "transparent"). */
  colors: Record<ColorToken, string>;
  /** token → full class ("rounded-md"). */
  radius: Record<RadiusToken, string>;
  /** token → class list (size/weight/leading). */
  type: Record<TypeToken, string[]>;
}

/** The default light theme (slate+blue) — mirrors tokens.default.json. */
export const defaultTheme: Theme = {
  colors: {
    surface: "white",
    raised: "slate-50",
    text: "slate-900",
    muted: "slate-500",
    primary: "blue-600",
    "on-primary": "white",
    border: "slate-200",
    danger: "red-600",
    "on-danger": "white",
    transparent: "transparent",
  },
  radius: {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  },
  type: {
    heading: ["text-xl", "font-semibold", "tracking-tight"],
    subhead: ["text-lg", "font-medium", "leading-snug"],
    body: ["text-base", "font-normal"],
    caption: ["text-sm"],
  },
};

export function bgClass(token: ColorToken, theme: Theme): string {
  return `bg-${theme.colors[token]}`;
}
export function fgClass(token: ColorToken, theme: Theme): string {
  return `text-${theme.colors[token]}`;
}
export function borderColorClass(token: ColorToken, theme: Theme): string {
  return `border-${theme.colors[token]}`;
}

/** Style classes in a fixed order: bg · fg · border(width, color) · radius. */
export function styleClasses(style: Style | undefined, theme: Theme): string[] {
  if (!style) return [];
  const out: string[] = [];
  if (style.bg) out.push(bgClass(style.bg, theme));
  if (style.fg) out.push(fgClass(style.fg, theme));
  if (style.border && style.border.width !== "none") {
    out.push(style.border.width === "thin" ? "border" : "border-2");
    out.push(borderColorClass(style.border.color, theme));
  }
  if (style.radius) out.push(theme.radius[style.radius]);
  return out;
}

/** variant = a named token bundle, not a new mechanism (§5). The user's
 *  `style` overrides the bundle per top-level field. */
export const VARIANT_STYLE: Record<ButtonVariant, Style> = {
  primary: { bg: "primary", fg: "on-primary", radius: "md" },
  secondary: {
    bg: "raised",
    fg: "text",
    border: { width: "thin", color: "border" },
    radius: "md",
  },
  ghost: { bg: "transparent", fg: "primary", radius: "md" },
};

export function mergeVariantStyle(variant: ButtonVariant, style: Style | undefined): Style {
  return { ...VARIANT_STYLE[variant], ...(style ?? {}) };
}
