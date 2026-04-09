import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { generateSockets } from "./generators/socket-generator.js";
import { generateAdapterSkeleton } from "./generators/adapter-skeleton.js";
import { generateWiring } from "./generators/wiring-generator.js";

type Handler = (params: any) => unknown;

const handlers: Record<string, Handler> = {
  ping: () => ({ status: "ok" }),

  generateSockets: (params) => {
    const files = generateSockets(params);
    return { files };
  },

  generateAdapterSkeleton: (params) => {
    const files = generateAdapterSkeleton(params);
    return { files };
  },

  generateWiring: (params) => {
    const files = generateWiring(params);
    return { files };
  },
};

export function handleRequest(request: JsonRpcRequest): JsonRpcResponse {
  const handler = handlers[request.method];
  if (!handler) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32601, message: `Method not found: ${request.method}` },
    };
  }

  try {
    const result = handler(request.params);
    return { jsonrpc: "2.0", id: request.id, result };
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32000, message: err.message ?? String(err) },
    };
  }
}
