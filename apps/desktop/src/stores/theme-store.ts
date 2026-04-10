import { create } from "zustand";

export type ThemeVariant = "dark" | "light" | "soft";

interface ThemeState {
  variant: ThemeVariant;
  setVariant: (variant: ThemeVariant) => void;
  cycleVariant: () => void;
}

const STORAGE_KEY = "drafting.theme";

function loadInitial(): ThemeVariant {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "soft" || stored === "dark") {
    return stored;
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

export const useThemeStore = create<ThemeState>((set, get) => ({
  variant: initial,
  setVariant: (variant) => {
    apply(variant);
    set({ variant });
  },
  cycleVariant: () => {
    const order: ThemeVariant[] = ["dark", "light", "soft"];
    const current = get().variant;
    const next = order[(order.indexOf(current) + 1) % order.length];
    apply(next);
    set({ variant: next });
  },
}));
