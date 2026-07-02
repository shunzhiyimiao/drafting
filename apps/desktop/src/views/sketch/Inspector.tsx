import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2, Link2Off } from "lucide-react";
import {
  BUTTON_VARIANTS,
  COLOR_TOKENS,
  CROSS_AXES,
  MAIN_AXES,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_TOKENS,
  type ColorToken,
  type RadiusToken,
  type Size,
  type SketchNode,
  type SpacingStep,
} from "@drafting/sketch-core";
import { allNodeIds, findNode, useSketchStore } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getBlueprint, updateBlueprintStructured } from "../../lib/blueprint-api";
import type { Blueprint } from "../../types/blueprint-types";

/** The §7 Inspector: every control is an enumerated dropdown/toggle over the
 *  finite alphabet — the editor structurally cannot produce an off-token or
 *  out-of-scale Spec. The lone open hatch is the fixed-px field. */
export function SketchInspector() {
  const active = useSketchStore((s) => s.active);
  const selectedNodeId = useSketchStore((s) => s.selectedNodeId);

  if (!active) return null;
  const hit = selectedNodeId ? findNode(active.root, selectedNodeId) : null;
  const node = hit?.node ?? null;
  const isRoot = node?.id === active.root.id;

  return (
    <div className="p-3 flex flex-col gap-4">
      <SketchSection />
      {node && (
        <>
          <NodeSection node={node} />
          {!isRoot && <BindingSection nodeId={node.id} />}
        </>
      )}
      <DanglingSection />
    </div>
  );
}

// ---------------------------------------------------------- grid helpers --

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2">
      <span className="text-[10px] text-text-muted truncate" title={label}>
        {label}
      </span>
      {children}
    </div>
  );
}

const selectCls =
  "w-full text-[11px] bg-bg-primary border border-border rounded px-1.5 py-1 text-text-secondary focus:outline-none";
const inputCls =
  "w-full text-[11px] px-1.5 py-1 rounded border border-border bg-bg-primary text-text-secondary focus:outline-none";

function TokenSelect<T extends string>({
  value,
  options,
  onChange,
  allowNone,
}: {
  value: T | undefined;
  options: readonly T[];
  onChange: (v: T | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <select
      className={selectCls}
      value={value ?? "__none__"}
      onChange={(e) =>
        onChange(e.target.value === "__none__" ? undefined : (e.target.value as T))
      }
    >
      {allowNone && <option value="__none__">—</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function SizeControl({
  value,
  onChange,
}: {
  value: Size;
  onChange: (s: Size) => void;
}) {
  return (
    <div className="flex gap-1">
      <select
        className={selectCls}
        value={value.mode}
        onChange={(e) => {
          const mode = e.target.value as Size["mode"];
          onChange(mode === "fixed" ? { mode, px: 100 } : { mode });
        }}
      >
        <option value="hug">hug</option>
        <option value="fill">fill</option>
        <option value="fixed">fixed</option>
      </select>
      {value.mode === "fixed" && (
        <input
          type="number"
          min={1}
          className={`${inputCls} w-16`}
          value={value.px}
          onChange={(e) => onChange({ mode: "fixed", px: Math.max(1, Number(e.target.value) || 1) })}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------- sections --

function SketchSection() {
  const active = useSketchStore((s) => s.active)!;
  const updateSketchMeta = useSketchStore((s) => s.updateSketchMeta);
  const index = useBlueprintStore((s) => s.index);
  const features = (index?.blueprints ?? []).filter((b) => b.type === "feature");

  return (
    <Section title="Sketch">
      <Row label="name">
        <input
          className={inputCls}
          value={active.name}
          onChange={(e) => updateSketchMeta({ name: e.target.value })}
        />
      </Row>
      <Row label="blueprint">
        <select
          className={selectCls}
          value={active.blueprintRef ?? "__none__"}
          onChange={(e) =>
            updateSketchMeta({
              blueprintRef: e.target.value === "__none__" ? null : e.target.value,
            })
          }
        >
          <option value="__none__">— unbound</option>
          {features.map((f) => (
            <option key={f.blueprintId} value={f.blueprintId}>
              {f.displayName}
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

function NodeSection({ node }: { node: SketchNode }) {
  const updateNode = useSketchStore((s) => s.updateNode);
  const sketches = useSketchStore((s) => s.sketches);
  const up = (mutate: (n: SketchNode) => void) => updateNode(node.id, mutate);

  return (
    <>
      <Section title={`${node.kind} · sizing`}>
        <Row label="width">
          <SizeControl
            value={node.sizing.width}
            onChange={(size) => up((n) => (n.sizing.width = size))}
          />
        </Row>
        <Row label="height">
          <SizeControl
            value={node.sizing.height}
            onChange={(size) => up((n) => (n.sizing.height = size))}
          />
        </Row>
      </Section>

      {node.kind === "stack" && (
        <Section title="layout">
          <Row label="direction">
            <TokenSelect
              value={node.layout.direction}
              options={["row", "col"] as const}
              onChange={(v) => v && up((n) => n.kind === "stack" && (n.layout.direction = v))}
            />
          </Row>
          <Row label="gap">
            <select
              className={selectCls}
              value={node.layout.gap}
              onChange={(e) =>
                up((n) => n.kind === "stack" && (n.layout.gap = Number(e.target.value) as SpacingStep))
              }
            >
              {SPACING_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          <Row label="padding">
            <select
              className={selectCls}
              value={node.layout.padding.top}
              onChange={(e) =>
                up((n) => {
                  if (n.kind !== "stack") return;
                  const step = Number(e.target.value) as SpacingStep;
                  n.layout.padding = { top: step, right: step, bottom: step, left: step };
                })
              }
            >
              {SPACING_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s} (all)
                </option>
              ))}
            </select>
          </Row>
          <Row label="mainAxis">
            <TokenSelect
              value={node.layout.mainAxis}
              options={MAIN_AXES}
              onChange={(v) => v && up((n) => n.kind === "stack" && (n.layout.mainAxis = v))}
            />
          </Row>
          <Row label="crossAxis">
            <TokenSelect
              value={node.layout.crossAxis}
              options={CROSS_AXES}
              onChange={(v) => v && up((n) => n.kind === "stack" && (n.layout.crossAxis = v))}
            />
          </Row>
        </Section>
      )}

      {node.kind === "text" && (
        <Section title="text">
          <Row label="role">
            <TokenSelect
              value={node.role}
              options={TYPE_TOKENS}
              onChange={(v) => v && up((n) => n.kind === "text" && (n.role = v))}
            />
          </Row>
          <Row label="content">
            <input
              className={inputCls}
              value={node.content}
              onChange={(e) => up((n) => n.kind === "text" && (n.content = e.target.value))}
            />
          </Row>
        </Section>
      )}

      {node.kind === "button" && (
        <Section title="button">
          <Row label="label">
            <input
              className={inputCls}
              value={node.label}
              onChange={(e) => up((n) => n.kind === "button" && (n.label = e.target.value))}
            />
          </Row>
          <Row label="variant">
            <TokenSelect
              value={node.variant}
              options={BUTTON_VARIANTS}
              onChange={(v) => v && up((n) => n.kind === "button" && (n.variant = v))}
            />
          </Row>
          <Row label="intent">
            <select
              className={selectCls}
              value={node.intent?.kind ?? "none"}
              onChange={(e) =>
                up((n) => {
                  if (n.kind !== "button") return;
                  const kind = e.target.value as "none" | "submit" | "navigate";
                  n.intent = kind === "navigate" ? { kind, to: null } : { kind };
                })
              }
            >
              <option value="none">none</option>
              <option value="submit">submit</option>
              <option value="navigate">navigate</option>
            </select>
          </Row>
          {node.intent?.kind === "navigate" && (
            <Row label="→ sketch">
              <select
                className={selectCls}
                value={node.intent.to ?? "__none__"}
                onChange={(e) =>
                  up((n) => {
                    if (n.kind === "button" && n.intent?.kind === "navigate") {
                      n.intent.to = e.target.value === "__none__" ? null : e.target.value;
                    }
                  })
                }
              >
                <option value="__none__">—</option>
                {sketches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
          )}
        </Section>
      )}

      {node.kind === "input" && (
        <Section title="input">
          <Row label="label">
            <input
              className={inputCls}
              value={node.label}
              onChange={(e) => up((n) => n.kind === "input" && (n.label = e.target.value))}
            />
          </Row>
          <Row label="placeholder">
            <input
              className={inputCls}
              value={node.placeholder ?? ""}
              onChange={(e) =>
                up((n) => n.kind === "input" && (n.placeholder = e.target.value || undefined))
              }
            />
          </Row>
          <Row label="type">
            <TokenSelect
              value={node.type}
              options={["text", "email", "password"] as const}
              onChange={(v) => v && up((n) => n.kind === "input" && (n.type = v))}
            />
          </Row>
        </Section>
      )}

      {node.kind === "image" && (
        <Section title="image">
          <Row label="src">
            <input
              className={inputCls}
              value={node.src}
              onChange={(e) => up((n) => n.kind === "image" && (n.src = e.target.value))}
            />
          </Row>
          <Row label="alt">
            <input
              className={inputCls}
              value={node.alt}
              onChange={(e) => up((n) => n.kind === "image" && (n.alt = e.target.value))}
            />
          </Row>
        </Section>
      )}

      <Section title="style">
        <Row label="bg">
          <TokenSelect<ColorToken>
            value={node.style?.bg}
            options={COLOR_TOKENS}
            allowNone
            onChange={(v) => up((n) => (n.style = { ...(n.style ?? {}), bg: v }))}
          />
        </Row>
        <Row label="fg">
          <TokenSelect<ColorToken>
            value={node.style?.fg}
            options={COLOR_TOKENS}
            allowNone
            onChange={(v) => up((n) => (n.style = { ...(n.style ?? {}), fg: v }))}
          />
        </Row>
        <Row label="border">
          <div className="flex gap-1">
            <select
              className={selectCls}
              value={node.style?.border?.width ?? "none"}
              onChange={(e) =>
                up((n) => {
                  const width = e.target.value as "none" | "thin" | "thick";
                  const color = n.style?.border?.color ?? "border";
                  n.style = {
                    ...(n.style ?? {}),
                    border: width === "none" ? undefined : { width, color },
                  };
                })
              }
            >
              <option value="none">none</option>
              <option value="thin">thin</option>
              <option value="thick">thick</option>
            </select>
            {node.style?.border && (
              <TokenSelect<ColorToken>
                value={node.style.border.color}
                options={COLOR_TOKENS}
                onChange={(v) =>
                  v &&
                  up((n) => {
                    if (n.style?.border) n.style.border.color = v;
                  })
                }
              />
            )}
          </div>
        </Row>
        <Row label="radius">
          <TokenSelect<RadiusToken>
            value={node.style?.radius}
            options={RADIUS_TOKENS}
            allowNone
            onChange={(v) => up((n) => (n.style = { ...(n.style ?? {}), radius: v }))}
          />
        </Row>
      </Section>
    </>
  );
}

// ------------------------------------------------------------- bindings --

/** Load the bound feature blueprint for the binding surface. Bind/unbind
 *  writes the CRITERION half via blueprint storage — the §6 write invariant:
 *  Sketch never writes .blueprint.md, this component only edits criteria
 *  through the blueprint API (spreading originals so ids/markerExtras/
 *  sketchNode survive — the 9eada7c discipline). */
function useBoundFeature(): [Blueprint | null, () => Promise<void>] {
  const active = useSketchStore((s) => s.active);
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const [feature, setFeature] = useState<Blueprint | null>(null);

  const reload = useCallback(async () => {
    if (!projectRoot || !active?.blueprintRef) {
      setFeature(null);
      return;
    }
    try {
      setFeature(await getBlueprint(projectRoot, active.blueprintRef));
    } catch {
      setFeature(null);
    }
  }, [projectRoot, active?.blueprintRef]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return [feature, reload];
}

async function setCriterionBinding(
  projectRoot: string,
  feature: Blueprint,
  criterionId: string,
  sketchNode: { sketchId: string; nodeId: string } | undefined,
) {
  const sections = feature.sections.map((s) =>
    s.kind.kind === "acceptanceCriteria"
      ? {
          ...s,
          criteria: s.criteria.map((c) =>
            c.id === criterionId ? { ...c, sketchNode } : c,
          ),
        }
      : s,
  );
  await updateBlueprintStructured(
    projectRoot,
    feature.frontMatter.blueprintId,
    feature.frontMatter,
    sections,
  );
}

function BindingSection({ nodeId }: { nodeId: string }) {
  const active = useSketchStore((s) => s.active)!;
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const [feature, reload] = useBoundFeature();

  if (!active.blueprintRef) {
    return (
      <Section title="criteria">
        <p className="text-[10px] text-text-muted">
          Bind this sketch to a feature blueprint to attach criteria.
        </p>
      </Section>
    );
  }
  if (!feature) return null;

  const criteria = feature.sections
    .filter((s) => s.kind.kind === "acceptanceCriteria")
    .flatMap((s) => s.criteria);

  return (
    <Section title="criteria">
      {criteria.length === 0 && (
        <p className="text-[10px] text-text-muted">The bound feature has no criteria yet.</p>
      )}
      {criteria.map((c) => {
        const boundHere = c.sketchNode?.sketchId === active.id && c.sketchNode.nodeId === nodeId;
        const boundElsewhere = !boundHere && c.sketchNode !== undefined;
        return (
          <div key={c.id ?? c.text} className="flex items-start gap-1.5">
            <button
              title={boundHere ? "Unbind from this node" : "Bind to the selected node"}
              onClick={async () => {
                if (!projectRoot || !c.id) return;
                await setCriterionBinding(
                  projectRoot,
                  feature,
                  c.id,
                  boundHere ? undefined : { sketchId: active.id, nodeId },
                );
                await reload();
              }}
              className={`mt-0.5 shrink-0 ${
                boundHere ? "text-accent" : "text-text-muted hover:text-accent"
              }`}
            >
              {boundHere ? <Link2 size={11} /> : <Link2Off size={11} />}
            </button>
            <span
              className={`text-[10px] leading-snug ${
                boundHere
                  ? "text-text-primary"
                  : boundElsewhere
                    ? "text-text-muted"
                    : "text-text-secondary"
              }`}
            >
              {c.text}
              {boundElsewhere && (
                <span className="text-text-muted"> · bound to {c.sketchNode!.nodeId.slice(0, 6)}…</span>
              )}
            </span>
          </div>
        );
      })}
    </Section>
  );
}

/** §6 rule 2: delete → dangling, not cascade. Surface criteria whose node is
 *  gone so a human re-binds or clears — a signal, not an error. */
function DanglingSection() {
  const active = useSketchStore((s) => s.active)!;
  const projectRoot = useSketchStore((s) => s.projectRoot);
  const [feature, reload] = useBoundFeature();

  if (!feature || !active.blueprintRef) return null;
  const ids = new Set(allNodeIds(active.root));
  const dangling = feature.sections
    .filter((s) => s.kind.kind === "acceptanceCriteria")
    .flatMap((s) => s.criteria)
    .filter((c) => c.sketchNode?.sketchId === active.id && !ids.has(c.sketchNode.nodeId));

  if (dangling.length === 0) return null;

  return (
    <Section title="dangling">
      {dangling.map((c) => (
        <div key={c.id ?? c.text} className="flex items-start gap-1.5">
          <AlertTriangle size={11} className="text-warning shrink-0 mt-0.5" />
          <span className="text-[10px] text-text-secondary leading-snug flex-1">
            {c.text}
            <span className="text-text-muted"> — the node it verified is gone</span>
          </span>
          <button
            onClick={async () => {
              if (!projectRoot || !c.id) return;
              await setCriterionBinding(projectRoot, feature, c.id, undefined);
              await reload();
            }}
            className="text-[10px] text-accent hover:text-accent-hover shrink-0"
          >
            clear
          </button>
        </div>
      ))}
    </Section>
  );
}
