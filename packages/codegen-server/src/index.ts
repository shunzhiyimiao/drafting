import * as readline from "node:readline";
import { handleRequest } from "./rpc.js";
import type { JsonRpcRequest } from "./types.js";

/**
 * Codegen server: reads JSON-RPC requests from stdin (one per line),
 * writes JSON-RPC responses to stdout (one per line).
 * Stderr is used for logging.
 */

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

process.stderr.write("codegen-server started\n");

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request: JsonRpcRequest = JSON.parse(trimmed);
    const response = handleRequest(request);
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (err: any) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` },
    };
    process.stdout.write(JSON.stringify(errorResponse) + "\n");
  }
});

rl.on("close", () => {
  process.stderr.write("codegen-server stdin closed, exiting\n");
  process.exit(0);
});
