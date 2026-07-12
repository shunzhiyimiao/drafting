/**
 * Atlas 测绘 — the TS leg (B-spade MVP, FACT level only).
 *
 * 与 K3 的语言分工同构:Rust 腿在 src-tauri/atlas/survey.rs,本文件是
 * TS 腿,Rust 经 RPC(`atlasScanTs`)编排。禁止任何推断:输出全部是
 * package.json 与 import 语句里直接读得出的事实。
 *
 * 范围:workspace 下的 package.json(根 + packages/* + apps/* 一层),每包
 * 统计源文件数、内部 import 边(相对路径 → 解析成项目相对文件路径)、
 * 外部 import 说明符清单。ts.preProcessFile 做词法级 import 提取 —— 快、
 * 零类型检查、确定性。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";

export interface TsEdge {
  from: string;
  to: string;
}

export interface TsPackage {
  name: string;
  dir: string;
  deps: string[];
  fileCount: number;
  internalEdges: TsEdge[];
  externalImports: string[];
}

export interface TsSurvey {
  packages: TsPackage[];
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target", ".git", "src-tauri"]);
const SOURCE_EXTS = [".ts", ".tsx"];
/** Bounded by design: a survey is a map, not a crawl. */
const MAX_FILES_PER_PACKAGE = 5000;

function listSourceFiles(dir: string, out: string[]): void {
  if (out.length >= MAX_FILES_PER_PACKAGE) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= MAX_FILES_PER_PACKAGE) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) listSourceFiles(full, out);
    } else if (SOURCE_EXTS.some((x) => e.name.endsWith(x)) && !e.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

/** Resolve a RELATIVE specifier to an existing source file (ts/tsx/index). */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  // `./a.js` in ESM-style TS resolves to a.ts — try the swap too.
  if (/\.(js|jsx)$/.test(base)) {
    candidates.push(base.replace(/\.jsx?$/, ".ts"), base.replace(/\.jsx?$/, ".tsx"));
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      // keep trying
    }
  }
  return null;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(dir: string): PackageJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

/** package.json dirs: root + one level under packages/ and apps/. */
function findPackageDirs(projectRoot: string): string[] {
  const dirs: string[] = [];
  if (fs.existsSync(path.join(projectRoot, "package.json"))) dirs.push(projectRoot);
  for (const bucket of ["packages", "apps"]) {
    const parent = path.join(projectRoot, bucket);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = path.join(parent, e.name);
      if (e.isDirectory() && fs.existsSync(path.join(dir, "package.json"))) {
        dirs.push(dir);
      }
    }
  }
  return dirs;
}

function scanPackage(projectRoot: string, dir: string): TsPackage {
  const pkg = readPackageJson(dir) ?? {};
  const deps = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i);

  // The root package surveys only its own top-level src (child packages
  // report themselves) — no double counting.
  const scanRoot =
    dir === projectRoot && fs.existsSync(path.join(dir, "src")) ? path.join(dir, "src") : dir;
  const files: string[] = [];
  if (dir === projectRoot) {
    if (scanRoot !== dir) listSourceFiles(scanRoot, files);
  } else {
    listSourceFiles(dir, files);
  }

  const rel = (p: string) => path.relative(projectRoot, p).split(path.sep).join("/");
  const internalEdges: TsEdge[] = [];
  const external = new Set<string>();

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const pre = ts.preProcessFile(content, true, true);
    for (const imp of pre.importedFiles) {
      const spec = imp.fileName;
      if (spec.startsWith(".")) {
        const target = resolveRelative(file, spec);
        if (target) internalEdges.push({ from: rel(file), to: rel(target) });
      } else {
        // Bare specifier → the package fact, scoped-aware (@scope/pkg).
        const parts = spec.split("/");
        external.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
      }
    }
  }
  internalEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return {
    name: pkg.name ?? path.basename(dir),
    dir: rel(dir) || ".",
    deps,
    fileCount: files.length,
    internalEdges,
    externalImports: [...external].sort(),
  };
}

export function atlasScanTs(params: { projectRoot: string }): TsSurvey {
  const { projectRoot } = params;
  const packages = findPackageDirs(projectRoot).map((dir) => scanPackage(projectRoot, dir));
  packages.sort((a, b) => a.name.localeCompare(b.name));
  return { packages };
}
