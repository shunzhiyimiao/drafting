import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AiConfig,
  ChatRequest,
  ClaudeCodeImportResult,
  HealthCheckResult,
  Profile,
  ProfilePreset,
  StreamEvent,
  TaskId,
  TaskRoute,
} from "../types/ai-types";

export async function getConfig(projectRoot: string): Promise<AiConfig> {
  return invoke("ai_get_config", { projectRoot });
}

export async function saveConfig(
  projectRoot: string,
  configData: AiConfig,
): Promise<void> {
  return invoke("ai_save_config", { projectRoot, configData });
}

// --- Profile CRUD ---------------------------------------------------------

export async function createProfile(
  projectRoot: string,
  profile: Profile,
): Promise<Profile> {
  return invoke("ai_create_profile", { projectRoot, profile });
}

export async function updateProfile(
  projectRoot: string,
  profile: Profile,
): Promise<Profile> {
  return invoke("ai_update_profile", { projectRoot, profile });
}

export async function deleteProfile(
  projectRoot: string,
  profileId: string,
): Promise<void> {
  return invoke("ai_delete_profile", { projectRoot, profileId });
}

export async function cloneProfile(
  projectRoot: string,
  sourceProfileId: string,
): Promise<Profile> {
  return invoke("ai_clone_profile", { projectRoot, sourceProfileId });
}

/** Where the key was stored: "keychain" (normal) or "plaintextFile"
 *  (keychain unavailable — caller must warn the user loudly). */
export type KeyStorage = "keychain" | "plaintextFile";

export async function setProfileApiKey(
  projectRoot: string,
  profileId: string,
  apiKey: string,
): Promise<KeyStorage> {
  return invoke("ai_set_profile_api_key", { projectRoot, profileId, apiKey });
}

export async function clearProfileApiKey(
  projectRoot: string,
  profileId: string,
): Promise<void> {
  return invoke("ai_clear_profile_api_key", { projectRoot, profileId });
}

export async function listPresets(): Promise<ProfilePreset[]> {
  return invoke("ai_list_presets");
}

export async function importFromClaudeCode(
  projectRoot: string,
): Promise<ClaudeCodeImportResult> {
  return invoke("ai_import_from_claude_code", { projectRoot });
}

// --- Routes / global -----------------------------------------------------

export async function toggleGlobal(
  projectRoot: string,
  enabled: boolean,
): Promise<void> {
  return invoke("ai_toggle_global", { projectRoot, enabled });
}

export async function setTaskRoute(
  projectRoot: string,
  route: TaskRoute,
): Promise<void> {
  return invoke("ai_set_task_route", { projectRoot, route });
}

// --- Health checks --------------------------------------------------------

export async function checkProfileHealth(
  projectRoot: string,
  profileId: string,
): Promise<HealthCheckResult> {
  return invoke("ai_check_profile_health", { projectRoot, profileId });
}

export async function checkDraftHealth(
  projectRoot: string,
  draft: Profile,
  apiKey: string | null,
): Promise<HealthCheckResult> {
  return invoke("ai_check_draft_health", { projectRoot, draft, apiKey });
}

// --- Streaming ------------------------------------------------------------

/** One-shot task run: server collects the stream, returns the full text.
 *  The whole AI Provider Manager chain (route/privacy/audit/cost) applies. */
export async function runTaskCollect(
  projectRoot: string,
  taskId: TaskId,
  request: ChatRequest,
): Promise<string> {
  return invoke("ai_run_task_collect", { projectRoot, taskId, request });
}

export async function streamChat(
  projectRoot: string,
  taskId: TaskId,
  request: ChatRequest,
): Promise<string> {
  return invoke("ai_stream_chat", { projectRoot, taskId, request });
}

export async function cancelStream(streamId: string): Promise<boolean> {
  return invoke("ai_cancel_stream", { streamId });
}

export async function onStreamEvent(
  cb: (event: StreamEvent) => void,
): Promise<UnlistenFn> {
  return listen<StreamEvent>("ai-stream-event", (e) => cb(e.payload));
}

export async function streamChatToCompletion(
  projectRoot: string,
  taskId: TaskId,
  request: ChatRequest,
  onDelta?: (text: string) => void,
): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  streamId: string;
}> {
  let buffer = "";
  let resolveStreamId: (id: string) => void;
  const streamIdPromise = new Promise<string>((resolve) => {
    resolveStreamId = resolve;
  });
  let unlisten: UnlistenFn | null = null;

  const result = new Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    streamId: string;
  }>(async (resolve, reject) => {
    let myStreamId: string | null = null;
    unlisten = await onStreamEvent((ev) => {
      if (myStreamId && "streamId" in ev && ev.streamId !== myStreamId) {
        return;
      }
      switch (ev.type) {
        case "started":
          myStreamId = ev.streamId;
          resolveStreamId(ev.streamId);
          break;
        case "delta":
          buffer += ev.text;
          onDelta?.(ev.text);
          break;
        case "completed":
          unlisten?.();
          resolve({
            text: buffer,
            inputTokens: ev.inputTokens,
            outputTokens: ev.outputTokens,
            streamId: ev.streamId,
          });
          break;
        case "cancelled":
          unlisten?.();
          reject(new Error("stream cancelled"));
          break;
        case "failed":
          unlisten?.();
          reject(new Error(ev.error));
          break;
      }
    });

    try {
      const id = await streamChat(projectRoot, taskId, request);
      if (!myStreamId) {
        myStreamId = id;
        resolveStreamId(id);
      }
    } catch (e) {
      unlisten?.();
      reject(e);
    }
  });

  void streamIdPromise;
  return result;
}
