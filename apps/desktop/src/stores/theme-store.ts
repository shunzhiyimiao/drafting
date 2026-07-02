import { create } from "zustand";

export type ThemeVariant = "dark" | "light" | "soft" | "blossom" | "mist" | "gilded";

export const THEME_ORDER: ThemeVariant[] = [
  "dark",
  "light",
  "soft",
  "blossom",
  "mist",
  "gilded",
];

export const THEME_META: Record<
  ThemeVariant,
  { label: string; description: string; swatch: string }
> = {
  dark: {
    label: "Dark",
    description: "Deep indigo / pink / cyan liquid glass",
    swatch: "#0a0b13",
  },
  light: {
    label: "Light",
    description: "Bright pastel, high contrast",
    swatch: "#f5f7fb",
  },
  soft: {
    label: "Soft",
    description: "Muted lavender glow",
    swatch: "#1e2030",
  },
  blossom: {
    label: "Blossom",
    description: "Rose pink #FFDEE7",
    swatch: "#FFDEE7",
  },
  mist: {
    label: "Mist",
    description: "Lavender blue #C5CEF9",
    swatch: "#C5CEF9",
  },
  gilded: {
    label: "Gilded",
    description: "鎏金白 — warm ivory & liquid gold",
    swatch: "#f5ecd7",
  },
};

interface ThemeState {
  variant: ThemeVariant;
  setVariant: (variant: ThemeVariant) => void;
}

const STORAGE_KEY = "drafting.theme";

function loadInitial(): ThemeVariant {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && THEME_ORDER.includes(stored as ThemeVariant)) {
    return stored as ThemeVariant;
  }
  return "dark";
}

function apply(variant: ThemeVariant) {
  if (typeof document === "undefined") return;
  if (variant === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", variant);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // ignore
  }
}

const initial = loadInitial();
apply(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  variant: initial,
  setVariant: (variant) => {
    apply(variant);
    set({ variant });
  },
}));
