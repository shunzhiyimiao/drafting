import { create } from "zustand";

export type BottomPanelTab = "checklist" | "terminal" | "problems" | "tasks";

interface LayoutState {
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  bottomPanelCollapsed: boolean;
  bottomPanelActiveTab: BottomPanelTab;
  zenMode: boolean;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  toggleZenMode: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  bottomPanelCollapsed: false,
  bottomPanelActiveTab: "checklist",
  zenMode: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  toggleBottomPanel: () =>
    set((s) => ({ bottomPanelCollapsed: !s.bottomPanelCollapsed })),
  setBottomPanelTab: (tab) => set({ bottomPanelActiveTab: tab }),
  toggleZenMode: () =>
    set((s) => ({
      zenMode: !s.zenMode,
      sidebarCollapsed: !s.zenMode ? true : false,
      rightPanelCollapsed: !s.zenMode ? true : false,
      bottomPanelCollapsed: !s.zenMode ? true : false,
    })),
}));
