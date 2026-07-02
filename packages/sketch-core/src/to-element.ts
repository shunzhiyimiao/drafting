/**
 * The second serializer (K3): IR → live elements for the editor canvas.
 *
 * `createElement` is injected so this package stays framework-free; the
 * frontend passes React.createElement. Every structural decision (tag,
 * className, data-sk, handler placement) was already made by `toIR` —
 * this is a trivial projection, which is what makes parity near-tautological.
 */
import type { IRNode } from "./emit.js";

export type CreateElement<E> = (
  tag: string,
  props: Record<string, unknown> | null,
  ...children: Array<E | string>
) => E;

export type HandlerMap = Record<string, (() => void) | undefined>;

export function toElement<E>(ir: IRNode, h: CreateElement<E>, handlers: HandlerMap = {}): E {
  const props: Record<string, unknown> = { className: ir.className };
  if (ir.dataSk) {
    props["data-sk"] = ir.dataSk;
    // Stable identity for list reconciliation; non-React `h`s can ignore it.
    props.key = ir.dataSk;
  }
  for (const [k, v] of Object.entries(ir.attrs)) props[k] = v;
  if (ir.handlerId) props.onClick = handlers[ir.handlerId];

  if (ir.text !== null) {
    return h(ir.tag, props, ir.text);
  }
  return h(ir.tag, props, ...ir.children.map((c) => toElement(c, h, handlers)));
}
