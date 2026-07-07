import * as fs from "node:fs";
import * as path from "node:path";
import {
  canonicalizeForMarkup,
  parseSketchMarkup,
  printSketchMarkup,
  SCHEMA_VERSION,
  type Sketch,
  type SketchNode,
} from "@drafting/sketch-core";

/**
 * v2 → v3 migration (Rev 4): `.sketch.json` documents become `.sketch`
 * markup, verified tree-by-tree before anything is renamed. The original is
 * kept as `.sketch.json.bak` — never deleted. Runs where the markup parser
 * lives (sketch-core is TS-only, per the K3 corollary); Rust invokes it over
 * the existing codegen RPC at project open, in the same commit that switches
 * Rust to reading `.sketch` — migrating earlier would strand the files.
 *
 * Refusals are loud and leave the original untouched: unparsable JSON, a
 * `semantics` field anywhere (the dialect has no spelling for it —
 * constraint 23 forbids dropping it silently), or a failed equivalence
 * check. Idempotent: files whose `.sketch` already exists are skipped.
 */
export interface MigrateSketchesParams {
  projectRoot: string;
}

export interface MigrationReport {
  migrated: string[];
  skipped: string[];
  failed: { file: string; reason: string }[];
}

function hasSemantics(n: SketchNode): boolean {
  if (n.kind !== "stack" && n.kind !== "list" && n.semantics !== undefined) return true;
  if (n.kind === "stack") return n.children.some(hasSemantics);
  if (n.kind === "list") return hasSemantics(n.template);
  return false;
}

/** Equality view for the equivalence check: schemaVersion neutralized (the
 *  markup is v3 by definition), everything else exact — every v2 ULID rides
 *  through as sk:id, so ids compare strictly. */
function comparable(s: Sketch): unknown {
  return { ...s, schemaVersion: 0 };
}

/** Key-order-independent serialization: the v2 file's key order and the
 *  parser's construction order differ; equality must not care. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, val]) => `${JSON.stringify(k)}:${stableStringify(val)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(v);
}

export function migrateSketches(params: MigrateSketchesParams): MigrationReport {
  const dir = path.join(params.projectRoot, "sketches");
  const report: MigrationReport = { migrated: [], skipped: [], failed: [] };
  if (!fs.existsSync(dir)) return report;

  const entries = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".sketch.json"))
    .sort();

  for (const name of entries) {
    const rel = `sketches/${name}`;
    const jsonPath = path.join(dir, name);
    const sketchPath = jsonPath.slice(0, -".json".length); // x.sketch.json → x.sketch

    if (fs.existsSync(sketchPath)) {
      report.skipped.push(rel);
      continue;
    }

    let original: Sketch;
    try {
      original = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Sketch;
    } catch (e) {
      report.failed.push({ file: rel, reason: `JSON 解析失败: ${(e as Error).message}` });
      continue;
    }

    if (hasSemantics(original.root)) {
      report.failed.push({
        file: rel,
        reason: "含 semantics 字段 — 方言 v3 无对应拼写，拒绝迁移以免静默丢失（constraint 23）",
      });
      continue;
    }

    try {
      const canonical = canonicalizeForMarkup(original);
      const markup = printSketchMarkup({ ...canonical, schemaVersion: SCHEMA_VERSION });
      const reparsed = parseSketchMarkup(markup).sketch;
      const a = stableStringify(comparable(canonical));
      const b = stableStringify(comparable(reparsed));
      if (a !== b) {
        report.failed.push({
          file: rel,
          reason: "等价验证失败：json 树 ≠ parse(markup)，原文件未改动",
        });
        continue;
      }
      fs.writeFileSync(sketchPath, markup);
      fs.renameSync(jsonPath, `${jsonPath}.bak`);
      report.migrated.push(rel);
    } catch (e) {
      report.failed.push({ file: rel, reason: (e as Error).message });
    }
  }
  return report;
}
