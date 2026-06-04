import { create } from "zustand";

/**
 * Global, app-wide notification surface (toasts). Any module can push a
 * user-visible "what happened + what to do" message here instead of failing
 * silently or dumping a raw error to the console.
 */

export type NotificationSeverity = "error" | "warning" | "info" | "success";

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface Notification {
  id: string;
  severity: NotificationSeverity;
  /** Short headline — what happened. */
  title: string;
  /** Optional detail (often a raw error/reason). */
  message?: string;
  /** Optional guidance — what to do about it. */
  hint?: string;
  action?: NotificationAction;
  /** Sticky notifications are never auto-dismissed. */
  sticky?: boolean;
  createdAt: number;
  /** While a notification with this key is live, repeats are ignored. */
  dedupeKey?: string;
}

export interface NotifyInput {
  severity?: NotificationSeverity;
  title: string;
  message?: string;
  hint?: string;
  action?: NotificationAction;
  sticky?: boolean;
  dedupeKey?: string;
}

interface NotificationState {
  notifications: Notification[];
  /** Push a notification. Returns its id, or null if deduped. */
  notify: (input: NotifyInput) => string | null;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const nextId = () => `n${++seq}`;

/** Cap visible toasts so a burst of failures can't bury the UI. */
const MAX_VISIBLE = 5;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  notify: (input) => {
    const { dedupeKey } = input;
    if (dedupeKey && get().notifications.some((n) => n.dedupeKey === dedupeKey)) {
      return null;
    }
    const n: Notification = {
      id: nextId(),
      severity: input.severity ?? "info",
      title: input.title,
      message: input.message,
      hint: input.hint,
      action: input.action,
      sticky: input.sticky,
      createdAt: Date.now(),
      dedupeKey,
    };
    set((s) => ({ notifications: [...s.notifications, n].slice(-MAX_VISIBLE) }));
    return n.id;
  },
  dismiss: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  clear: () => set({ notifications: [] }),
}));

/** Imperative helper for non-React call sites (event bridges, async flows). */
export function notify(input: NotifyInput): string | null {
  return useNotificationStore.getState().notify(input);
}
