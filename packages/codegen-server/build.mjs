// Bundles codegen-server into a single self-contained CommonJS file
// (dist/codegen-server.cjs) so the packaged Drafting app can launch it with
// plain `node`, with no tsx / source tree / node_modules required at runtime.
// The only runtime dependency is Node.js >= 18 on the user's machine.
//
// Dev still runs `tsx src/index.ts` (see package.json "start"); this bundle is
// only used by release builds (wired via tauri.conf bundle.resources).
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  // .cjs extension forces CommonJS even though package.json sets "type":"module".
  format: "cjs",
  outfile: "dist/codegen-server.cjs",
  logLevel: "info",
  // ts-morph ships its own TypeScript and bundles cleanly. If the runtime ever
  // complains about missing lib.*.d.ts, mark "typescript" external here and
  // ship node_modules/typescript/lib alongside the .cjs instead.
});

console.error("[build] wrote dist/codegen-server.cjs");
