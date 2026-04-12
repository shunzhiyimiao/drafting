import { invoke } from "@tauri-apps/api/core";
import type { AiConfig, ProviderId, TaskRoute } from "../types/ai-types";

export async function getConfig(projectRoot: string): Promise<AiConfig> {
  return invoke("ai_get_config", { projectRoot });
}

export async function saveConfig(
  projectRoot: string,
  configData: AiConfig,
): Promise<void> {
  return invoke("ai_save_config", { projectRoot, configData });
}

export async function setApiKey(
  projectRoot: string,
  providerId: ProviderId,
  apiKey: string,
): Promise<void> {
  return invoke("ai_set_api_key", { projectRoot, providerId, apiKey });
}

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

export async function checkProviderHealth(
  projectRoot: string,
  providerId: ProviderId,
): Promise<boolean> {
  return invoke("ai_check_provider_health", { projectRoot, providerId });
}
