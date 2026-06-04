import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import {
  useNotificationStore,
  type Notification,
  type NotificationSeverity,
} from "../stores/notification-store";
import { useT } from "../lib/i18n";

/** Auto-dismiss delay per severity. Errors stay until dismissed (null). */
const AUTO_DISMISS_MS: Record<NotificationSeverity, number | null> = {
  error: null,
  warning: 10000,
  info: 6000,
  success: 4000,
};

function iconFor(sev: NotificationSeverity) {
  switch (sev) {
    case "error":
      return AlertCircle;
    case "warning":
      return AlertTriangle;
    case "success":
      return CheckCircle;
    default:
      return Info;
  }
}

const COLOR: Record<NotificationSeverity, string> = {
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-sky-400",
  success: "text-emerald-400",
};

function ToastItem({ n }: { n: Notification }) {
  const t = useT();
  const dismiss = useNotificationStore((s) => s.dismiss);
  const Icon = iconFor(n.severity);

  useEffect(() => {
    const ms = n.sticky ? null : AUTO_DISMISS_MS[n.severity];
    if (ms == null) return;
    const timer = setTimeout(() => dismiss(n.id), ms);
    return () => clearTimeout(timer);
  }, [n.id, n.severity, n.sticky, dismiss]);

  return (
    <div className="glass-thick pointer-events-auto w-80 rounded-lg p-3 shadow-lg">
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[n.severity]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{n.title}</p>
          {n.message && (
            <p className="mt-0.5 break-words text-xs text-text-secondary">
              {n.message}
            </p>
          )}
          {n.hint && <p className="mt-1 text-xs text-text-muted">{n.hint}</p>}
          {n.action && (
            <button
              className="mt-2 rounded bg-white/10 px-2 py-1 text-xs text-text-primary hover:bg-white/20"
              onClick={() => {
                n.action!.run();
                dismiss(n.id);
              }}
            >
              {n.action.label}
            </button>
          )}
        </div>
        <button
          aria-label={t("notif.dismiss")}
          className="shrink-0 text-text-muted hover:text-text-primary"
          onClick={() => dismiss(n.id)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Bottom-right stack of notification toasts. Mounted once in App. */
export function Toaster() {
  const notifications = useNotificationStore((s) => s.notifications);
  if (notifications.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <ToastItem key={n.id} n={n} />
      ))}
    </div>
  );
}
