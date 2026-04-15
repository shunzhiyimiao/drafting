import { create } from "zustand";
import { type Locale, setLocale, getLocale } from "../lib/i18n";

export interface AppearanceSettings {
  fontFamily: string;
  fontSize: number;
  uiFontSize: number;
  editorFontColor: string;
  terminalFontColor: string;
  terminalFontColorLight: string;
  editorTabSize: number;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorLineNumbers: boolean;
}

interface SettingsState {
  locale: Locale;
  appearance: AppearanceSettings;

  setLocale: (locale: Locale) => void;
  updateAppearance: (patch: Partial<AppearanceSettings>) => void;
  resetAppearance: () => void;
}

const STORAGE_KEY = "drafting.settings";

const defaultAppearance: AppearanceSettings = {
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontSize: 13,
  uiFontSize: 13,
  editorFontColor: "#e8ecf5",
  terminalFontColor: "#f0a050",
  terminalFontColorLight: "#e87d2e",
  editorTabSize: 2,
  editorWordWrap: true,
  editorMinimap: false,
  editorLineNumbers: true,
};

function loadSettings(): { locale: Locale; appearance: AppearanceSettings } {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        locale: parsed.locale ?? getLocale(),
        appearance: { ...defaultAppearance, ...parsed.appearance },
      };
    }
  } catch {
    // ignore
  }
  return { locale: getLocale(), appearance: { ...defaultAppearance } };
}

function persist(state: { locale: Locale; appearance: AppearanceSettings }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function applyToDOM(appearance: AppearanceSettings) {
  document.documentElement.style.setProperty("--user-font-family", appearance.fontFamily);
  document.documentElement.style.setProperty("--user-font-size", `${appearance.uiFontSize}px`);
}

const initial = loadSettings();
applyToDOM(initial.appearance);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  locale: initial.locale,
  appearance: initial.appearance,

  setLocale: (locale) => {
    setLocale(locale);
    set({ locale });
    persist({ locale, appearance: get().appearance });
    // Force re-render by incrementing a version — components that
    // call `t()` will pick up the new locale on next render.
    // We rely on Zustand subscription to trigger re-renders.
  },

  updateAppearance: (patch) => {
    const next = { ...get().appearance, ...patch };
    applyToDOM(next);
    set({ appearance: next });
    persist({ locale: get().locale, appearance: next });
  },

  resetAppearance: () => {
    applyToDOM(defaultAppearance);
    set({ appearance: { ...defaultAppearance } });
    persist({ locale: get().locale, appearance: defaultAppearance });
  },
}));
