import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Link2, Link2Off, Plus, Trash2 } from "lucide-react";
import {
  BUTTON_VARIANTS,
  COLOR_TOKENS,
  CROSS_AXES,
  ITEM_FIELD_TYPES,
  MAIN_AXES,
  RADIUS_TOKENS,
  SPACING_STEPS,
  TYPE_TOKENS,
  isBind,
  validate,
  type BindableString,
  type ColorToken,
  type ItemFieldType,
  type ListP,
  type RadiusToken,
  type Size,
  type SketchNode,
  type SpacingStep,
} from "@drafting/sketch-core";
import { allNodeIds, findEnclosingList, findNode, useSketchStore } from "../../stores/sketch-store";
import { useBlueprintStore } from "../../stores/blueprint-store";
import { getBlueprint, updateBlueprintStructured } from "../../lib/blueprint-api";
import type { Blueprint } from "../../types/blueprint-types";
import { Dropdown } from "../../components/Dropdown";

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
      <ProblemsSection />
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

/** sketch-core's validate() is the single semantic gate (Rust stays
 *  structural); the Inspector is where its decidable error list surfaces. */
function ProblemsSection() {
  const active = useSketchStore((s) => s.active)!;
  const selectNode = useSketchStore((s) => s.selectNode);
  const errors = validate(active);
  if (errors.length === 0) return null;
  return (
    <Section title={`problems (${errors.length})`}>
      {errors.map((e, i) => (
        <button
          key={i}
          onClick={() => selectNode(e.nodeId)}
          className="flex items-start gap-1.5 text-left"
          title="Select the offending node"
        >
          <AlertTriangle size={11} className="text-error shrink-0 mt-0.5" />
          <span className="text-[10px] text-text-secondary leading-snug">{e.message}</span>
        </button>
      ))}
    </Section>
  );
}

// ---------------------------------------------------------- grid helpers --

/** Inspector section (S2a): collapsible, designer-panel style. Open by
 *  default; state is per-mount (deliberately not persisted). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border/30 pb-2 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-[10px] uppercase tracking-widest text-text-muted mb-1.5 hover:text-text-secondary"
      >
        {title}
        <ChevronDown
          size={11}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="flex flex-col gap-1.5">{children}</div>}
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

const inputCls =
  "w-full text-xs px-2 py-1.5 min-h-[28px] rounded-md border border-border bg-bg-primary text-text-secondary focus:border-accent focus:outline-none";

/** All Inspector selectors ride the portal Dropdown — native <select> popups
 *  get clipped by any backdrop-filter ancestor in WebKit (the exact bug the
 *  Dropdown component exists to solve), and every Inspector control sits
 *  inside a glass panel. */
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
    <Dropdown
      className="w-full"
      value={value ?? "__none__"}
      options={[
        ...(allowNone ? [{ value: "__none__", label: "—" }] : []),
        ...options.map((o) => ({ value: o, label: o })),
      ]}
      onChange={(v) => onChange(v === "__none__" ? undefined : (v as T))}
    />
  );
}

function SizeControl({
  value,
  onChange,
  exclude = [],
}: {
  value: Size;
  onChange: (s: Size) => void;
  /** Modes the Spec forbids in this position (Rev 5: frames can't hug,
   *  frame children can't fill) — hidden rather than error-surfaced. */
  exclude?: Size["mode"][];
}) {
  return (
    <div className="flex gap-1">
      <Dropdown
        className="flex-1"
        value={value.mode}
        options={[
          { value: "hug", label: "hug" },
          { value: "fill", label: "fill" },
          { value: "fixed", label: "fixed" },
        ].filter((o) => !exclude.includes(o.value as Size["mode"]))}
        onChange={(v) => {
          const mode = v as Size["mode"];
          onChange(mode === "fixed" ? { mode, px: 100 } : { mode });
        }}
      />
      {value.mode === "fixed" && (
        <input
          type="number"
          min={1}
          className={`${inputCls} w-16 shrink-0`}
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
        <Dropdown
          className="w-full"
          value={active.blueprintRef ?? "__none__"}
          options={[
            { value: "__none__", label: "— unbound" },
            ...features.map((f) => ({ value: f.blueprintId, label: f.displayName })),
          ]}
          onChange={(v) =>
            updateSketchMeta({ blueprintRef: v === "__none__" ? null : v })
          }
        />
      </Row>
    </Section>
  );
}

/** literal | bind switch for text.content / image.src. The bind branch only
 *  exists inside a list template (`list` non-null) — a dropdown over the
 *  declared itemShape fields, so the control can't produce an undeclared
 *  bind. Outside a template it stays a plain literal input. */
function BindableControl({
  value,
  list,
  onChange,
}: {
  value: BindableString;
  list: ListP | null;
  onChange: (v: BindableString) => void;
}) {
  const bound = isBind(value);
  if (!list) {
    return (
      <input
        className={inputCls}
        value={bound ? `{${value.bind}}` : value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <div className="flex gap-1">
      <Dropdown
        className="w-20 shrink-0"
        value={bound ? "bind" : "literal"}
        options={[
          { value: "literal", label: "literal" },
          { value: "bind", label: "bind" },
        ]}
        onChange={(v) => {
          if (v === "bind" && !bound) onChange({ bind: list.itemShape[0]?.name ?? "" });
          if (v === "literal" && bound) onChange("");
        }}
      />
      {bound ? (
        <Dropdown
          className="flex-1"
          value={value.bind}
          options={list.itemShape.map((f) => ({ value: f.name, label: f.name }))}
          onChange={(v) => onChange({ bind: v })}
        />
      ) : (
        <input
          className={inputCls}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function NodeSection({ node }: { node: SketchNode }) {
  const active = useSketchStore((s) => s.active)!;
  const updateNode = useSketchStore((s) => s.updateNode);
  const sketches = useSketchStore((s) => s.sketches);
  const up = (mutate: (n: SketchNode) => void) => updateNode(node.id, mutate);
  // Binds only resolve inside a list template — the control follows.
  const enclosingList = findEnclosingList(active.root, node.id);

  const sizeExclude: Size["mode"][] =
    node.kind === "frame" ? ["hug"] : node.pos ? ["fill"] : [];

  return (
    <>
      <Section title={`${node.kind} · sizing`}>
        <Row label="width">
          <SizeControl
            value={node.sizing.width}
            exclude={sizeExclude}
            onChange={(size) => up((n) => (n.sizing.width = size))}
          />
        </Row>
        <Row label="height">
          <SizeControl
            value={node.sizing.height}
            exclude={sizeExclude}
            onChange={(size) => up((n) => (n.sizing.height = size))}
          />
        </Row>
      </Section>

      {/* Position (Rev 5): a frame child's coordinates — document
          attributes, same undo stack as everything else. */}
      {node.pos && (
        <Section title="position">
          <Row label="x">
            <input
              type="number"
              className={inputCls}
              value={node.pos.x}
              onChange={(e) =>
                up((n) => {
                  if (n.pos) n.pos.x = Math.round(Number(e.target.value) || 0);
                })
              }
            />
          </Row>
          <Row label="y">
            <input
              type="number"
              className={inputCls}
              value={node.pos.y}
              onChange={(e) =>
                up((n) => {
                  if (n.pos) n.pos.y = Math.round(Number(e.target.value) || 0);
                })
              }
            />
          </Row>
        </Section>
      )}

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
            <Dropdown
              className="w-full"
              value={String(node.layout.gap)}
              options={SPACING_STEPS.map((s) => ({ value: String(s), label: String(s) }))}
              onChange={(v) =>
                up((n) => n.kind === "stack" && (n.layout.gap = Number(v) as SpacingStep))
              }
            />
          </Row>
          <Row label="padding">
            <Dropdown
              className="w-full"
              value={String(node.layout.padding.top)}
              options={SPACING_STEPS.map((s) => ({
                value: String(s),
                label: `${s} (all)`,
              }))}
              onChange={(v) =>
                up((n) => {
                  if (n.kind !== "stack") return;
                  const step = Number(v) as SpacingStep;
                  n.layout.padding = { top: step, right: step, bottom: step, left: step };
                })
              }
            />
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

      {node.kind === "list" && <ListSection node={node} />}

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
            <BindableControl
              value={node.content}
              list={enclosingList}
              onChange={(v) => up((n) => n.kind === "text" && (n.content = v))}
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
            <Dropdown
              className="w-full"
              value={node.intent?.kind ?? "none"}
              options={[
                { value: "none", label: "none" },
                { value: "submit", label: "submit" },
                { value: "navigate", label: "navigate" },
              ]}
              onChange={(v) =>
                up((n) => {
                  if (n.kind !== "button") return;
                  const kind = v as "none" | "submit" | "navigate";
                  n.intent = kind === "navigate" ? { kind, to: null } : { kind };
                })
              }
            />
          </Row>
          {node.intent?.kind === "navigate" && (
            <Row label="→ sketch">
              <Dropdown
                className="w-full"
                value={node.intent.to ?? "__none__"}
                options={[
                  { value: "__none__", label: "—" },
                  ...sketches.map((s) => ({ value: s.id, label: s.name })),
                ]}
                onChange={(v) =>
                  up((n) => {
                    if (n.kind === "button" && n.intent?.kind === "navigate") {
                      n.intent.to = v === "__none__" ? null : v;
                    }
                  })
                }
              />
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
            <BindableControl
              value={node.src}
              list={enclosingList}
              onChange={(v) => up((n) => n.kind === "image" && (n.src = v))}
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
            <Dropdown
              className="flex-1"
              value={node.style?.border?.width ?? "none"}
              options={[
                { value: "none", label: "none" },
                { value: "thin", label: "thin" },
                { value: "thick", label: "thick" },
              ]}
              onChange={(v) =>
                up((n) => {
                  const width = v as "none" | "thin" | "thick";
                  const color = n.style?.border?.color ?? "border";
                  n.style = {
                    ...(n.style ?? {}),
                    border: width === "none" ? undefined : { width, color },
                  };
                })
              }
            />
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

// ----------------------------------------------------------------- list --

/** The list's data surface: dataKey, the inline itemShape (add/remove/rename
 *  fields, the four types, single isKey), and the sampleRows table the canvas
 *  renders from. Renaming a field follows through sampleRows keys and binds —
 *  a rename must never silently orphan what points at it. */
function ListSection({ node }: { node: ListP }) {
  const updateNode = useSketchStore((s) => s.updateNode);
  const [newField, setNewField] = useState("");
  const up = (mutate: (l: ListP) => void) =>
    updateNode(node.id, (n) => {
      if (n.kind === "list") mutate(n);
    });

  const renameField = (from: string, to: string) =>
    up((l) => {
      const field = l.itemShape.find((f) => f.name === from);
      if (!field) return;
      field.name = to;
      for (const row of l.sampleRows) {
        if (from in row) {
          row[to] = row[from];
          delete row[from];
        }
      }
      const walk = (n: SketchNode) => {
        if (n.kind === "stack") n.children.forEach(walk);
        else if (n.kind === "list") walk(n.template);
        else if (n.kind === "text" && isBind(n.content) && n.content.bind === from)
          n.content = { bind: to };
        else if (n.kind === "image" && isBind(n.src) && n.src.bind === from)
          n.src = { bind: to };
      };
      walk(l.template);
    });

  return (
    <>
      <Section title="list · data">
        <Row label="dataKey">
          <input
            className={inputCls}
            value={node.dataKey}
            onChange={(e) => up((l) => (l.dataKey = e.target.value))}
          />
        </Row>
      </Section>

      <Section title="item shape">
        {node.itemShape.map((f, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              className={`${inputCls} flex-1 min-w-0`}
              value={f.name}
              onChange={(e) => renameField(f.name, e.target.value)}
            />
            <Dropdown
              className="w-24 shrink-0"
              value={f.type}
              options={ITEM_FIELD_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={(v) => up((l) => (l.itemShape[i].type = v as ItemFieldType))}
            />
            <input
              type="radio"
              name={`isKey-${node.id}`}
              checked={f.isKey === true}
              title="key field (React key of each row)"
              onChange={() =>
                up((l) =>
                  l.itemShape.forEach((g, j) => {
                    if (j === i) g.isKey = true;
                    else delete g.isKey;
                  }),
                )
              }
              className="shrink-0"
            />
            <button
              onClick={() =>
                up((l) => {
                  const name = l.itemShape[i].name;
                  l.itemShape.splice(i, 1);
                  for (const row of l.sampleRows) delete row[name];
                })
              }
              title="Remove field (binds pointing at it go red, never silently cleared)"
              className="shrink-0 text-text-muted hover:text-error"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <input
            className={`${inputCls} flex-1 min-w-0`}
            placeholder="new field…"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newField.trim()) {
                up((l) => l.itemShape.push({ name: newField.trim(), type: "string" }));
                setNewField("");
              }
            }}
          />
          <button
            onClick={() => {
              if (!newField.trim()) return;
              up((l) => l.itemShape.push({ name: newField.trim(), type: "string" }));
              setNewField("");
            }}
            className="shrink-0 text-text-muted hover:text-accent"
            title="Add field"
          >
            <Plus size={12} />
          </button>
        </div>
      </Section>

      <Section title={`sample rows (${node.sampleRows.length})`}>
        {node.sampleRows.map((row, ri) => (
          <div key={ri} className="flex items-start gap-1">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {node.itemShape.map((f) => (
                <Row key={f.name} label={f.name}>
                  {f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={row[f.name] === true}
                      onChange={(e) =>
                        up((l) => (l.sampleRows[ri][f.name] = e.target.checked))
                      }
                    />
                  ) : f.type === "number" ? (
                    <input
                      type="number"
                      className={inputCls}
                      value={typeof row[f.name] === "number" ? (row[f.name] as number) : ""}
                      onChange={(e) =>
                        up((l) => (l.sampleRows[ri][f.name] = Number(e.target.value) || 0))
                      }
                    />
                  ) : (
                    <input
                      className={inputCls}
                      value={typeof row[f.name] === "string" ? (row[f.name] as string) : ""}
                      onChange={(e) => up((l) => (l.sampleRows[ri][f.name] = e.target.value))}
                    />
                  )}
                </Row>
              ))}
            </div>
            <button
              onClick={() => up((l) => l.sampleRows.splice(ri, 1))}
              title="Remove row"
              className="shrink-0 mt-1.5 text-text-muted hover:text-error"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            up((l) => {
              const row: Record<string, unknown> = {};
              for (const f of l.itemShape) {
                row[f.name] =
                  f.type === "number"
                    ? 0
                    : f.type === "boolean"
                      ? false
                      : f.isKey
                        ? String(l.sampleRows.length + 1)
                        : "";
              }
              l.sampleRows.push(row);
            })
          }
          className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover"
        >
          <Plus size={11} />
          add row
        </button>
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
  const persistNodeIdForBinding = useSketchStore((s) => s.persistNodeIdForBinding);
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
                if (boundHere) {
                  await setCriterionBinding(projectRoot, feature, c.id, undefined);
                } else {
                  // persist-on-need case (a), §6 write order: the sketch
                  // domain persists sk:id (and flushes the file) BEFORE the
                  // blueprint domain writes the criterion marker.
                  const persisted = await persistNodeIdForBinding(nodeId);
                  if (!persisted) return;
                  await setCriterionBinding(projectRoot, feature, c.id, {
                    sketchId: active.id,
                    nodeId: persisted,
                  });
                }
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
