import type { UnlistenFn } from "@tauri-apps/api/event";
import { subscribeSyncBus, type EventEnvelope } from "./sync-bus";
import { notify } from "../stores/notification-store";
import { t } from "./i18n";

/**
 * Sync Bus payload shape: SyncBusEvent serializes as
 * `{ domain, event: { type, data } }` (see src-tauri sync_bus/events.rs).
 */
interface BusPayload {
  domain: string;
  event: { type: string; data?: Record<string, unknown> };
}

/**
 * Subscribe to the Sync Bus and surface failure-class events as user-visible
 * notifications. Without this, several backend failures (notably LSP crashes)
 * are completely silent on the frontend.
 *
 * Returns an unlisten function for cleanup.
 */
export async function startNotificationBridge(): Promise<UnlistenFn> {
  return subscribeSyncBus((envelope: EventEnvelope) => {
    const p = envelope.payload as BusPayload | undefined;
    if (!p || !p.event) return;
    const { domain, event } = p;
    const data = event.data ?? {};

    // -- LSP failures: previously fully silent (console.warn only) -----------
    if (domain === "Editor" && event.type === "LspFailed") {
      notify({
        severity: "error",
        title: t("notif.lsp.failed.title"),
        message: data.reason ? String(data.reason) : undefined,
        hint: t("notif.lsp.failed.hint"),
        dedupeKey: "lsp-failed",
      });
      return;
    }

    // -- AI stream failures (includes bad/missing API key) -------------------
    if (domain === "AiProvider" && event.type === "StreamFailed") {
      const err = data.error ? String(data.error) : "";
      const isAuth =
        /401|403|unauthor|api[\s_-]?key|invalid.*key|missing.*key|no.*key|credential/i.test(
          err,
        );
      notify({
        severity: "error",
        title: t("notif.ai.failed.title"),
        message: err || undefined,
        hint: isAuth
          ? t("notif.ai.failed.hint.auth")
          : t("notif.ai.failed.hint.generic"),
        dedupeKey: `ai-failed:${String(data.stream_id ?? "")}`,
      });
      return;
    }

    // -- AI monthly budget exceeded ------------------------------------------
    if (domain === "AiProvider" && event.type === "BudgetExceeded") {
      notify({
        severity: "warning",
        title: t("notif.ai.budgetExceeded.title"),
        hint: t("notif.ai.budgetExceeded.hint"),
        dedupeKey: "ai-budget-exceeded",
      });
      return;
    }
  });
}
