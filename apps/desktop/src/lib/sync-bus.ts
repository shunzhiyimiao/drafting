import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface EventEnvelope<T = unknown> {
  origin: string;
  timestamp: number;
  payload: T;
}

export type SyncBusCallback = (envelope: EventEnvelope) => void;

/**
 * Subscribe to all Sync Bus events from the Rust backend.
 * Returns an unlisten function for cleanup.
 *
 * Subscribers should check envelope.origin to ignore self-originated events
 * (cycle prevention).
 */
export async function subscribeSyncBus(
  callback: SyncBusCallback,
  options?: { ignoreOrigin?: string },
): Promise<UnlistenFn> {
  return listen<EventEnvelope>("sync-bus-event", (event) => {
    const envelope = event.payload;
    if (options?.ignoreOrigin && envelope.origin === options.ignoreOrigin) {
      return;
    }
    callback(envelope);
  });
}
