import * as path from "node:path";
import * as fs from "node:fs";
import type { GenerateScaffoldingParams } from "../types.js";

/**
 * Generate workspace scaffolding so the generated packages resolve in the
 * editor / LSP (fixes "Cannot find module '@myapp/sockets'"):
 *
 *   - package.json            (workspace root)
 *   - pnpm-workspace.yaml
 *   - tsconfig.base.json      (paths aliases for the generated packages)
 *   - tsconfig.json           (extends base; tsserver only picks up
 *                              tsconfig.json, so the base alone is inert)
 *   - packages/{sockets,adapters,wiring}/package.json
 *
 * USER-OWNED once created: every file is skip-if-exists, never overwritten.
 */
export function generateScaffolding(
  params: GenerateScaffoldingParams,
): string[] {
  const { projectRoot, scopeName } = params;
  const created: string[] = [];

  const writeIfMissing = (relPath: string, content: string) => {
    const filePath = path.join(projectRoot, relPath);
    if (fs.existsSync(filePath)) {
      return;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    created.push(relPath);
  };

  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

  writeIfMissing(
    "package.json",
    json({
      name: sanitizePackageName(path.basename(projectRoot)),
      version: "0.1.0",
      private: true,
      type: "module",
    }),
  );

  writeIfMissing("pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');

  writeIfMissing(
    "tsconfig.base.json",
    json({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        baseUrl: ".",
        paths: {
          [`${scopeName}/sockets`]: ["packages/sockets/src/index.ts"],
          [`${scopeName}/adapters`]: ["packages/adapters/src/index.ts"],
          [`${scopeName}/wiring/*`]: ["packages/wiring/src/*"],
        },
      },
    }),
  );

  writeIfMissing(
    "tsconfig.json",
    json({
      extends: "./tsconfig.base.json",
      include: ["packages"],
    }),
  );

  writeIfMissing(
    "packages/sockets/package.json",
    json({
      name: `${scopeName}/sockets`,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "src/index.ts",
      types: "src/index.ts",
    }),
  );

  writeIfMissing(
    "packages/adapters/package.json",
    json({
      name: `${scopeName}/adapters`,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "src/index.ts",
      types: "src/index.ts",
      dependencies: {
        [`${scopeName}/sockets`]: "workspace:*",
      },
    }),
  );

  writeIfMissing(
    "packages/wiring/package.json",
    json({
      name: `${scopeName}/wiring`,
      version: "0.1.0",
      private: true,
      type: "module",
      dependencies: {
        [`${scopeName}/sockets`]: "workspace:*",
        [`${scopeName}/adapters`]: "workspace:*",
      },
    }),
  );

  return created;
}

function sanitizePackageName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-_.]/g, "-")
    .replace(/^[-_.]+/, "");
  return sanitized || "my-project";
}
