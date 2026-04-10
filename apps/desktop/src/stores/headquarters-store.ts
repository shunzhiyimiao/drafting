import { create } from "zustand";
import { useBlueprintStore } from "./blueprint-store";
import { usePatchboardStore } from "./patchboard-store";
import type { BlueprintIndexEntry } from "../types/blueprint-types";

export type HealthStatus = "healthy" | "attention" | "risk" | "alert";

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail?: string;
  source: "blueprint" | "patchboard" | "git" | "ai";
  actionLabel?: string;
  actionTarget?: string; // view id
}

export interface TodoItem {
  id: string;
  text: string;
  blueprintId: string;
  blueprintName: string;
  criterionIndex: number;
  priority: string;
}

export type SuggestionLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SmartSuggestion {
  level: SuggestionLevel;
  message: string;
  actionLabel: string;
  actionTarget: string; // view id
}

export type FeatureSort =
  | "priority"
  | "progress"
  | "updated"
  | "name";

export type FeatureFilter = "all" | "in-progress" | "with-alerts" | "stalled" | "empty" | "completed";

export type AlertDisplayMode = "expanded" | "collapsed" | "badge";

interface HeadquartersState {
  // Derived
  totalFeatures: number;
  totalCriteria: number;
  doneCriteria: number;
  overallProgress: number;
  health: HealthStatus;

  // Suggestion
  suggestion: SmartSuggestion;

  // Alerts
  alerts: Alert[];
  alertDisplayMode: AlertDisplayMode;

  // Todos
  todos: TodoItem[];

  // Feature view prefs
  featureSort: FeatureSort;
  featureFilter: FeatureFilter;

  // Actions
  setAlertDisplayMode: (mode: AlertDisplayMode) => void;
  setFeatureSort: (sort: FeatureSort) => void;
  setFeatureFilter: (filter: FeatureFilter) => void;
  recompute: () => void;
}

export const useHeadquartersStore = create<HeadquartersState>((set, get) => ({
  totalFeatures: 0,
  totalCriteria: 0,
  doneCriteria: 0,
  overallProgress: 0,
  health: "healthy",
  suggestion: {
    level: 7,
    message: "Welcome to Drafting. Start by creating your first Blueprint.",
    actionLabel: "New Blueprint",
    actionTarget: "blueprint",
  },
  alerts: [],
  alertDisplayMode: "expanded",
  todos: [],
  featureSort: "priority",
  featureFilter: "all",

  setAlertDisplayMode: (mode) => set({ alertDisplayMode: mode }),
  setFeatureSort: (sort) => set({ featureSort: sort }),
  setFeatureFilter: (filter) => set({ featureFilter: filter }),

  recompute: () => {
    const blueprintStore = useBlueprintStore.getState();
    const patchboardStore = usePatchboardStore.getState();

    const features: BlueprintIndexEntry[] = (blueprintStore.index?.blueprints ?? [])
      .filter((b) => b.type === "feature");

    const totalFeatures = features.length;
    const totalCriteria = features.reduce((acc, f) => acc + f.criteriaTotal, 0);
    const doneCriteria = features.reduce((acc, f) => acc + f.criteriaDone, 0);
    const overallProgress =
      totalCriteria > 0 ? Math.round((doneCriteria / totalCriteria) * 100) : 0;

    // Compute alerts
    const alerts: Alert[] = [];

    // Blueprint alerts
    for (const f of features) {
      if (f.criteriaTotal === 0) {
        alerts.push({
          id: `bp-empty-${f.blueprintId}`,
          severity: "warning",
          title: `"${f.displayName}" has no acceptance criteria`,
          source: "blueprint",
          actionLabel: "Open",
          actionTarget: "blueprint",
        });
      }
      if (f.status === "deprecated") {
        alerts.push({
          id: `bp-deprecated-${f.blueprintId}`,
          severity: "info",
          title: `"${f.displayName}" is deprecated`,
          source: "blueprint",
        });
      }
    }

    // Patchboard alerts
    const registry = patchboardStore.registry;
    if (registry && registry.sockets.length === 0 && totalFeatures > 0) {
      alerts.push({
        id: "pb-no-sockets",
        severity: "info",
        title: "No Sockets defined yet",
        detail: "Define Sockets in Patchboard to describe your architecture",
        source: "patchboard",
        actionLabel: "Open Patchboard",
        actionTarget: "patchboard",
      });
    }

    // Compute health
    let health: HealthStatus = "healthy";
    const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
    const errorAlerts = alerts.filter((a) => a.severity === "error").length;
    const warningAlerts = alerts.filter((a) => a.severity === "warning").length;

    if (criticalAlerts > 0) health = "alert";
    else if (errorAlerts > 0) health = "risk";
    else if (warningAlerts > 0) health = "attention";

    // Compute todos (un-checked criteria across all features)
    const todos: TodoItem[] = [];
    // Note: we don't have per-criterion data in the index, so we
    // just synthesize summary todos per feature with unfinished criteria.
    for (const f of features) {
      if (f.criteriaTotal > f.criteriaDone) {
        const remaining = f.criteriaTotal - f.criteriaDone;
        todos.push({
          id: `todo-${f.blueprintId}`,
          text: `${remaining} criteria remaining`,
          blueprintId: f.blueprintId,
          blueprintName: f.displayName,
          criterionIndex: 0,
          priority: f.priority,
        });
      }
    }

    // Compute smart suggestion (7-level priority chain)
    let suggestion: SmartSuggestion;

    if (criticalAlerts > 0) {
      // Level 1: critical
      const critical = alerts.find((a) => a.severity === "critical")!;
      suggestion = {
        level: 1,
        message: critical.title,
        actionLabel: critical.actionLabel ?? "Investigate",
        actionTarget: critical.actionTarget ?? "headquarters",
      };
    } else if (errorAlerts > 0) {
      // Level 2: error
      const err = alerts.find((a) => a.severity === "error")!;
      suggestion = {
        level: 2,
        message: err.title,
        actionLabel: err.actionLabel ?? "Fix",
        actionTarget: err.actionTarget ?? "headquarters",
      };
    } else if (features.some((f) => f.status === "in-progress" && daysSince(f.updatedAt) > 7)) {
      // Level 3: stalled
      const stalled = features.find(
        (f) => f.status === "in-progress" && daysSince(f.updatedAt) > 7,
      )!;
      suggestion = {
        level: 3,
        message: `"${stalled.displayName}" hasn't been updated in a week`,
        actionLabel: "Resume",
        actionTarget: "blueprint",
      };
    } else if (features.some((f) => f.status === "draft" && f.criteriaTotal === 0)) {
      // Level 4: empty draft
      const empty = features.find(
        (f) => f.status === "draft" && f.criteriaTotal === 0,
      )!;
      suggestion = {
        level: 4,
        message: `"${empty.displayName}" is empty — add acceptance criteria`,
        actionLabel: "Edit Blueprint",
        actionTarget: "blueprint",
      };
    } else if (features.some((f) => f.status === "in-progress")) {
      // Level 5: in-progress
      const active = features
        .filter((f) => f.status === "in-progress")
        .sort((a, b) => b.criteriaDone - a.criteriaDone)[0];
      suggestion = {
        level: 5,
        message: `Continue working on "${active.displayName}"`,
        actionLabel: "Open",
        actionTarget: "blueprint",
      };
    } else if (totalFeatures > 0) {
      // Level 6: healthy
      suggestion = {
        level: 6,
        message: `${totalFeatures} ${totalFeatures === 1 ? "feature" : "features"} tracked · ${overallProgress}% complete`,
        actionLabel: "Review",
        actionTarget: "blueprint",
      };
    } else {
      // Level 7: brand new
      suggestion = {
        level: 7,
        message: "Welcome to Drafting. Start by creating your first Blueprint.",
        actionLabel: "New Blueprint",
        actionTarget: "blueprint",
      };
    }

    // Auto-downgrade alert display mode if too many
    let alertDisplayMode = get().alertDisplayMode;
    if (alerts.length > 10 && alertDisplayMode === "expanded") {
      alertDisplayMode = "collapsed";
    }

    set({
      totalFeatures,
      totalCriteria,
      doneCriteria,
      overallProgress,
      health,
      suggestion,
      alerts,
      todos,
      alertDisplayMode,
    });
  },
}));

function daysSince(timestamp: number): number {
  const now = Date.now();
  return (now - timestamp) / (1000 * 60 * 60 * 24);
}

// Subscribe to Blueprint/Patchboard store changes to auto-recompute
useBlueprintStore.subscribe(() => {
  useHeadquartersStore.getState().recompute();
});
usePatchboardStore.subscribe(() => {
  useHeadquartersStore.getState().recompute();
});
