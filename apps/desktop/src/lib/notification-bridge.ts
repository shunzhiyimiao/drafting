import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { subscribeSyncBus, type EventEnvelope } from "./sync-bus";
import { notify } from "../stores/notification-store";
import type { SketchMigrationReport } from "./sketch-api";
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
  // Sketch v2→v3 migration report (Rev 4, A2 obligation: user-visible).
  const unlistenMigration = await listen<SketchMigrationReport>("sketch:migration", (e) => {
    const r = e.payload;
    if (r.migrated.length === 0 && r.failed.length === 0) return;
    notify({
      severity: r.failed.length > 0 ? "warning" : "success",
      title: t("sketch.migration.title").replace("{n}", String(r.migrated.length)),
      message:
        r.failed.length > 0
          ? t("sketch.migration.failed")
              .replace("{n}", String(r.failed.length))
              .replace("{files}", r.failed.map((f) => f.file).join(", "))
          : t("sketch.migration.bak"),
      dedupeKey: "sketch-migration",
    });
  });

  const unlistenBus = await subscribeSyncBus((envelope: EventEnvelope) => {
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

    // -- Privacy filter blocked a file from entering an AI prompt -------------
    if (domain === "AiProvider" && event.type === "PrivacyViolationBlocked") {
      notify({
        severity: "warning",
        title: t("notif.ai.privacyBlocked.title"),
        message: `${String(data.file ?? "")} (${String(data.reason ?? "")})`,
        hint: t("notif.ai.privacyBlocked.hint"),
        dedupeKey: `ai-privacy:${String(data.file ?? "")}`,
      });
      return;
    }
  });

  return () => {
    unlistenMigration();
    unlistenBus();
  };
}
