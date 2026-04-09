/**
 * TypeScript mirror of Rust Patchboard types.
 * Must match serde JSON output (camelCase) exactly.
 */

export type SocketLifecycle = "draft" | "stable" | "deprecated" | "removed";

export interface MethodParam {
  name: string;
  paramType: string;
  optional: boolean;
}

export interface SocketMethod {
  name: string;
  params: MethodParam[];
  returnType: string;
}

export interface SocketDefinition {
  id: string;
  fullName: string;
  displayName: string;
  lifecycle: SocketLifecycle;
  extends: string[];
  methods: SocketMethod[];
  createdAt: number;
  updatedAt: number;
}

export interface RegistryEntry {
  id: string;
  fullName: string;
  displayName: string;
  lifecycle: SocketLifecycle;
  updatedAt: number;
}

export interface RegistryIndex {
  version: number;
  sockets: RegistryEntry[];
}

export type AdapterParamType =
  | { kind: "socketDep"; socketId: string }
  | { kind: "primitive"; typeName: string };

export interface AdapterConstructorParam {
  name: string;
  paramType: AdapterParamType;
}

export interface Position {
  x: number;
  y: number;
}

export interface AdapterNode {
  id: string;
  name: string;
  implements: string[];
  constructorParams: AdapterConstructorParam[];
  position: Position;
}

export interface SocketReference {
  socketId: string;
  position: Position;
}

export interface Wire {
  id: string;
  fromAdapterId: string;
  fromSocketId: string;
  toAdapterId: string;
  toParamName: string;
}

export interface EntryPoint {
  id: string;
  adapterId: string;
  exportName: string;
}

export interface Canvas {
  id: string;
  name: string;
  socketRefs: SocketReference[];
  adapters: AdapterNode[];
  wires: Wire[];
  entryPoints: EntryPoint[];
  createdAt: number;
  updatedAt: number;
}

export interface CanvasSummary {
  id: string;
  name: string;
  adapterCount: number;
  wireCount: number;
  updatedAt: number;
}

export interface PatchboardConfig {
  version: number;
  scopeName: string;
  socketsPackage: string;
  adaptersPackage: string;
  wiringPackage: string;
}

export interface CreateSocketInput {
  fullName: string;
  displayName: string;
  extends: string[];
  methods: SocketMethod[];
}

export interface UpdateSocketInput {
  id: string;
  fullName?: string;
  displayName?: string;
  lifecycle?: SocketLifecycle;
  extends?: string[];
  methods?: SocketMethod[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CodeGenResult {
  success: boolean;
  files: string[];
  errors: string[];
}
