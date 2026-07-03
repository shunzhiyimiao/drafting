/**
 * The second serializer (K3): IR → live elements for the editor canvas.
 *
 * `createElement` is injected so this package stays framework-free; the
 * frontend passes React.createElement. Every structural decision (tag,
 * className, data-sk, handler placement) was already made by `toIR` —
 * this is a trivial projection, which is what makes parity near-tautological.
 *
 * Repeat nodes are the one projection with breadth: where toJsxString emits
 * `{data.<dataKey>.map((item) => …)}` once, this renders one template
 * instance per Spec `sampleRows` row — same template IR, bound fields
 * substituted with the row's values. Every instance carries the template
 * node's data-sk (plural semantics: select one, all light up).
 */
import type { IRNode } from "./emit.js";

export type CreateElement<E> = (
  tag: string,
  props: Record<string, unknown> | null,
  ...children: Array<E | string>
) => E;

/** Handlers inside a list template receive their row as `item`. */
export type HandlerMap = Record<string, ((item?: unknown) => void) | undefined>;

/** The enclosing repeat instance while projecting a template subtree. */
interface RowScope {
  row: Record<string, unknown>;
}

export function toElement<E>(ir: IRNode, h: CreateElement<E>, handlers: HandlerMap = {}): E {
  return project(ir, h, handlers, null, null);
}

function project<E>(
  ir: IRNode,
  h: CreateElement<E>,
  handlers: HandlerMap,
  scope: RowScope | null,
  instanceKey: string | null,
): E {
  const props: Record<string, unknown> = { className: ir.className };
  if (ir.dataSk) {
    props["data-sk"] = ir.dataSk;
    // Stable identity for list reconciliation; non-React `h`s can ignore it.
    props.key = instanceKey ?? ir.dataSk;
  }
  for (const [k, v] of Object.entries(ir.attrs)) props[k] = v;
  if (ir.attrBinds) {
    for (const [k, field] of Object.entries(ir.attrBinds)) {
      props[k] = scope ? String(scope.row[field] ?? "") : "";
    }
  }
  if (ir.handlerId) {
    const handler = handlers[ir.handlerId];
    props.onClick =
      ir.handlerItemType && scope ? handler && (() => handler(scope.row)) : handler;
  }

  if (ir.repeat) {
    // One instance per sample row — the canvas half of the map projection.
    // Instances are siblings sharing the template's data-sk, so the instance
    // root's reconciliation key carries a row discriminator.
    const template = ir.children[0];
    return h(
      ir.tag,
      props,
      ...ir.repeat.sampleRows.map((row, i) =>
        project(template, h, handlers, { row }, `${template.dataSk}@${i}`),
      ),
    );
  }
  if (ir.textBind) {
    return h(ir.tag, props, scope ? String(scope.row[ir.textBind] ?? "") : "");
  }
  if (ir.text !== null) {
    return h(ir.tag, props, ir.text);
  }
  return h(ir.tag, props, ...ir.children.map((c) => project(c, h, handlers, scope, null)));
}
