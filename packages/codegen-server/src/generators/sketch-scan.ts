import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseSketchMarkup,
  printSketchMarkup,
  SCHEMA_VERSION,
  type Sketch,
} from "@drafting/sketch-core";

/**
 * Structure-for-Rust (Rev 4, A4): the markup parser is single-implementation
 * in sketch-core, so anything Rust needs to KNOW about a sketch (as opposed
 * to store) comes through these RPCs. Rust keeps raw text I/O and the
 * derived index; it never parses the dialect.
 */

export interface ScanSketchesParams {
  projectRoot: string;
}

export interface SketchScanEntry {
  /** Project-relative file, e.g. "sketches/inbox.sketch". */
  file: string;
  id: string;
  name: string;
  blueprintRef: string | null;
}

export interface ScanReport {
  entries: SketchScanEntry[];
  /** Files that didn't parse — surfaced, never silently dropped. */
  failed: { file: string; reason: string }[];
}

export function scanSketches(params: ScanSketchesParams): ScanReport {
  const dir = path.join(params.projectRoot, "sketches");
  const report: ScanReport = { entries: [], failed: [] };
  if (!fs.existsSync(dir)) return report;

  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".sketch"))
    .sort();
  for (const name of names) {
    const rel = `sketches/${name}`;
    try {
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      const { sketch } = parseSketchMarkup(raw);
      report.entries.push({
        file: rel,
        id: sketch.id,
        name: sketch.name,
        blueprintRef: sketch.blueprintRef,
      });
    } catch (e) {
      report.failed.push({ file: rel, reason: (e as Error).message });
    }
  }
  return report;
}

export interface PrintNewSketchParams {
  /** Minted by the caller (Rust owns entity-id minting on create). */
  sketchId: string;
  name: string;
  blueprintRef?: string | null;
}

/** Canonical markup for a fresh sketch — the same default screen the old
 *  storage::create built (a fill column with a padded root). Printing lives
 *  here so Rust never needs a second printer. */
export function printNewSketch(params: PrintNewSketchParams): { markup: string } {
  const sketch: Sketch = {
    id: params.sketchId,
    name: params.name,
    blueprintRef: params.blueprintRef ?? null,
    schemaVersion: SCHEMA_VERSION,
    root: {
      kind: "stack",
      id: "",
      layout: {
        direction: "col",
        gap: 4,
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        mainAxis: "start",
        crossAxis: "stretch",
      },
      sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
      children: [],
    },
  };
  return { markup: printSketchMarkup(sketch) };
}
