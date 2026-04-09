import { create } from "zustand";

export type ViewId =
  | "headquarters"
  | "blueprint"
  | "patchboard"
  | "atlas"
  | "editor"
  | "git"
  | "terminal"
  | "settings";

interface NavigationState {
  activeView: ViewId;
  previousView: ViewId | null;
  setActiveView: (view: ViewId) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: "headquarters",
  previousView: null,
  setActiveView: (view) =>
    set((state) => ({
      activeView: view,
      previousView: state.activeView,
    })),
}));
