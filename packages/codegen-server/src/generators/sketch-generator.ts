import * as path from "node:path";
import * as fs from "node:fs";
import {
  defaultTheme,
  pascalCase,
  toJsxString,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_TOKENS,
  COLOR_TOKENS,
  type Sketch,
} from "@drafting/sketch-core";

/**
 * Sketch → React (docs/sketch-design.md §4/§6). The class core is
 * @drafting/sketch-core — the SAME implementation the editor canvas renders
 * with (K3: one codebase). This generator only decides file layout:
 *
 *   packages/ui/src/generated/<slug>.generated.tsx  TOOL-OWNED, overwritten
 *   packages/ui/src/<slug>.tsx                      generated once, USER-OWNED
 *   packages/ui/{package.json,tsconfig.json}        scaffolding, skip-if-exists
 *   tokens.default.json                             scaffolding, skip-if-exists
 */
export interface GenerateSketchParams {
  projectRoot: string;
  /** Project-relative path, e.g. "sketches/login-screen.sketch.json". */
  sketchPath: string;
  /** Package scope for the ui package name; defaults from
   *  .patchboard/config.json, then "@app". */
  scopeName?: string;
}

export function generateSketch(params: GenerateSketchParams): string[] {
  const { projectRoot, sketchPath } = params;
  const scope = params.scopeName ?? detectScope(projectRoot);

  const raw = fs.readFileSync(path.join(projectRoot, sketchPath), "utf8");
  const sketch = JSON.parse(raw) as Sketch;
  const slug = path.basename(sketchPath).replace(/\.sketch\.json$/, "");
  const component = pascalCase(sketch.name);

  const written: string[] = [];
  const write = (rel: string, content: string, overwrite: boolean) => {
    const abs = path.join(projectRoot, rel);
    if (!overwrite && fs.existsSync(abs)) return;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel);
  };

  // --- the generated half: tool-owned, regenerated wholesale ---
  write(
    `packages/ui/src/generated/${slug}.generated.tsx`,
    toJsxString(sketch, defaultTheme, sketchPath),
    true,
  );

  // --- the sibling: generated once, then the user's wiring surface ---
  write(
    `packages/ui/src/${slug}.tsx`,
    [
      `// ${slug}.tsx — yours. Wire node intents to real behavior here; the`,
      `// generated half never touches this file and regenerating never will.`,
      `import { ${component} as Generated, type SketchHandlers } from "./generated/${slug}.generated";`,
      ``,
      `const handlers: SketchHandlers = {`,
      `  // "<node-id>": () => { … },   // stale ids fail tsc — see SketchHandlers`,
      `};`,
      ``,
      `export function ${component}() {`,
      `  return <Generated handlers={handlers} />;`,
      `}`,
      ``,
    ].join("\n"),
    false,
  );

  // --- ui package scaffolding: skip-if-exists (user-owned once created) ---
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  write(
    "packages/ui/package.json",
    json({
      name: `${scope}/ui`,
      version: "0.1.0",
      private: true,
      type: "module",
      dependencies: { react: "^18.3.1" },
    }),
    false,
  );
  write(
    "packages/ui/tsconfig.json",
    json({
      extends: "../../tsconfig.base.json",
      compilerOptions: { jsx: "react-jsx" },
      include: ["src"],
    }),
    false,
  );

  // --- tokens.default.json: the token→value binding table, in git (§5/§6) ---
  write(
    "tokens.default.json",
    json({
      colors: defaultTheme.colors,
      radius: defaultTheme.radius,
      type: defaultTheme.type,
      spacing: SPACING_STEPS,
      // Recorded so the file is a complete, offline-readable token census.
      tokens: { color: COLOR_TOKENS, radius: RADIUS_TOKENS, type: TYPE_TOKENS },
    }),
    false,
  );

  return written;
}

function detectScope(projectRoot: string): string {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".patchboard/config.json"), "utf8"),
    ) as { scopeName?: string };
    if (typeof cfg.scopeName === "string" && cfg.scopeName.length > 0) {
      return cfg.scopeName;
    }
  } catch {
    // Not a Patchboard project — fine, Sketch stands alone.
  }
  return "@app";
}
