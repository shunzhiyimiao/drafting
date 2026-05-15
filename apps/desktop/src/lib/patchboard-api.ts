import { invoke } from "@tauri-apps/api/core";
import type {
  RegistryIndex,
  SocketDefinition,
  CreateSocketInput,
  UpdateSocketInput,
  Canvas,
  CanvasSummary,
  ValidationResult,
  CodeGenResult,
  WireBridge,
} from "../types/patchboard-types";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export async function patchboardInit(projectRoot: string): Promise<void> {
  return invoke("patchboard_init", { projectRoot });
}

// ---------------------------------------------------------------------------
// Registry / Socket CRUD
// ---------------------------------------------------------------------------

export async function listSockets(
  projectRoot: string,
): Promise<RegistryIndex> {
  return invoke("patchboard_list_sockets", { projectRoot });
}

export async function getSocket(
  projectRoot: string,
  socketId: string,
): Promise<SocketDefinition> {
  return invoke("patchboard_get_socket", { projectRoot, socketId });
}

export async function createSocket(
  projectRoot: string,
  input: CreateSocketInput,
): Promise<SocketDefinition> {
  return invoke("patchboard_create_socket", { projectRoot, input });
}

export async function updateSocket(
  projectRoot: string,
  input: UpdateSocketInput,
): Promise<SocketDefinition> {
  return invoke("patchboard_update_socket", { projectRoot, input });
}

export async function deleteSocket(
  projectRoot: string,
  socketId: string,
): Promise<void> {
  return invoke("patchboard_delete_socket", { projectRoot, socketId });
}

// ---------------------------------------------------------------------------
// Canvas CRUD
// ---------------------------------------------------------------------------

export async function listCanvases(
  projectRoot: string,
): Promise<CanvasSummary[]> {
  return invoke("patchboard_list_canvases", { projectRoot });
}

export async function getCanvas(
  projectRoot: string,
  canvasId: string,
): Promise<Canvas> {
  return invoke("patchboard_get_canvas", { projectRoot, canvasId });
}

export async function createCanvas(
  projectRoot: string,
  name: string,
): Promise<Canvas> {
  return invoke("patchboard_create_canvas", { projectRoot, name });
}

export async function saveCanvas(
  projectRoot: string,
  canvasData: Canvas,
): Promise<void> {
  return invoke("patchboard_save_canvas", { projectRoot, canvasData });
}

export async function deleteCanvas(
  projectRoot: string,
  canvasId: string,
): Promise<void> {
  return invoke("patchboard_delete_canvas", { projectRoot, canvasId });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function validateCanvas(
  projectRoot: string,
  canvasId: string,
): Promise<ValidationResult> {
  return invoke("patchboard_validate_canvas", { projectRoot, canvasId });
}

export async function classifyWires(
  projectRoot: string,
  canvasId: string,
): Promise<WireBridge[]> {
  return invoke("patchboard_classify_wires", { projectRoot, canvasId });
}

// ---------------------------------------------------------------------------
// Code Generation
// ---------------------------------------------------------------------------

export async function generateCode(
  projectRoot: string,
  canvasId: string,
): Promise<CodeGenResult> {
  return invoke("patchboard_generate_code", { projectRoot, canvasId });
}
