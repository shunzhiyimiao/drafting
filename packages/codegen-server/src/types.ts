/**
 * Types matching the Rust Patchboard data model (camelCase JSON).
 * These are the input types for code generation.
 */

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
  lifecycle: string;
  extends: string[];
  methods: SocketMethod[];
}

export interface AdapterParamType {
  kind: "socketDep" | "primitive";
  socketId?: string;
  typeName?: string;
}

export interface AdapterConstructorParam {
  name: string;
  paramType: AdapterParamType;
}

export interface AdapterNode {
  id: string;
  name: string;
  implements: string[];
  constructorParams: AdapterConstructorParam[];
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
  adapters: AdapterNode[];
  wires: Wire[];
  entryPoints: EntryPoint[];
}

export interface GenerateSocketsParams {
  projectRoot: string;
  sockets: SocketDefinition[];
  scopeName: string;
}

export interface GenerateAdapterSkeletonParams {
  projectRoot: string;
  adapter: AdapterNode;
  sockets: SocketDefinition[];
  scopeName: string;
}

export interface GenerateWiringParams {
  projectRoot: string;
  canvas: Canvas;
  sockets: SocketDefinition[];
  scopeName: string;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}
