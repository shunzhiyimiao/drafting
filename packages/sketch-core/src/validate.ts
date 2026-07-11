/**
 * Semantic validation — the SINGLE implementation (K3 discipline extended to
 * meaning): Rust does structural serde only; everything a Spec can get
 * *semantically* wrong is decided here, as a decidable error list the editor
 * Inspector surfaces. The fold stays total regardless — an invalid Spec still
 * folds deterministically; it just fails tsc downstream, and these errors
 * name the reason upstream.
 *
 * Rules 1–3 are the pinned list/data-binding rules; 4–7 are their decidability
 * prerequisites (bind scoping, the nested-list park, and the identifier /
 * uniqueness facts that `data.<dataKey>` / `item.<name>` syntax and the
 * derived type names rest on).
 */
import type { ItemField, ListP, Sketch, SketchNode } from "./spec.js";
import { isBind } from "./spec.js";

export interface ValidationError {
  /** The node the error anchors to (the list node for shape/row errors). */
  nodeId: string;
  message: string;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Does a sample value match the declared field type? `image` is a URL string. */
function valueMatches(field: ItemField, value: unknown): boolean {
  switch (field.type) {
    case "string":
    case "image":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
  }
}

export function validate(sketch: Sketch): ValidationError[] {
  const errors: ValidationError[] = [];
  const dataKeysSeen = new Map<string, string>(); // dataKey → first list node id

  /** Frame position rules (Rev 5): pos ⟺ parent is a frame; a frame can't
   *  hug (absolute children give it no intrinsic size); its children can't
   *  fill (fill has no meaning at a point). */
  const checkPos = (node: SketchNode, inFrame: boolean) => {
    if (inFrame && !node.pos) {
      errors.push({ nodeId: node.id, message: "frame child is missing pos (x/y)" });
    }
    if (!inFrame && node.pos) {
      errors.push({ nodeId: node.id, message: "pos (x/y) is only legal on a frame's direct children" });
    }
    if (inFrame && (node.sizing.width.mode === "fill" || node.sizing.height.mode === "fill")) {
      errors.push({ nodeId: node.id, message: "frame children cannot use fill sizing — use hug or fixed" });
    }
  };

  const walk = (node: SketchNode, list: ListP | null, inFrame: boolean) => {
    checkPos(node, inFrame);
    switch (node.kind) {
      case "stack":
        node.children.forEach((child) => walk(child, list, false));
        return;
      case "frame":
        if (node.sizing.width.mode === "hug" || node.sizing.height.mode === "hug") {
          errors.push({ nodeId: node.id, message: "a frame cannot hug — its positioned children give it no intrinsic size" });
        }
        node.children.forEach((child) => walk(child, list, true));
        return;
      case "list": {
        if (list) {
          // Parked, not park-adjacent: nested repeats would shadow the
          // generated `item` binding. Rejected until a spade designs them.
          errors.push({ nodeId: node.id, message: "nested lists are not supported" });
        }
        validateList(node, errors, dataKeysSeen);
        walk(node.template, node, false);
        return;
      }
      case "text":
        if (isBind(node.content)) checkBind(node.id, node.content.bind, "content", list, errors);
        return;
      case "image":
        if (isBind(node.src)) checkBind(node.id, node.src.bind, "src", list, errors);
        return;
      case "button":
      case "input":
        return;
    }
  };

  walk(sketch.root, null, false);
  return errors;
}

function checkBind(
  nodeId: string,
  field: string,
  prop: string,
  list: ListP | null,
  errors: ValidationError[],
) {
  if (!list) {
    errors.push({
      nodeId,
      message: `${prop} binds "${field}" outside a list template — binds only resolve inside one`,
    });
    return;
  }
  if (!list.itemShape.some((f) => f.name === field)) {
    errors.push({
      nodeId,
      message: `${prop} binds "${field}", which is not a declared itemShape field`,
    });
  }
}

function validateList(
  list: ListP,
  errors: ValidationError[],
  dataKeysSeen: Map<string, string>,
) {
  // dataKey becomes `data.<dataKey>` and the derived item type name.
  if (!IDENT.test(list.dataKey)) {
    errors.push({
      nodeId: list.id,
      message: `dataKey "${list.dataKey}" must be a valid identifier (it becomes data.<dataKey>)`,
    });
  }
  if (dataKeysSeen.has(list.dataKey)) {
    errors.push({
      nodeId: list.id,
      message: `dataKey "${list.dataKey}" is already used by another list`,
    });
  } else {
    dataKeysSeen.set(list.dataKey, list.id);
  }

  // Field names become `item.<name>` and item-type members.
  const names = new Set<string>();
  for (const f of list.itemShape) {
    if (!IDENT.test(f.name)) {
      errors.push({
        nodeId: list.id,
        message: `field "${f.name}" must be a valid identifier (it becomes item.<name>)`,
      });
    }
    if (names.has(f.name)) {
      errors.push({ nodeId: list.id, message: `duplicate field "${f.name}" in itemShape` });
    }
    names.add(f.name);
  }

  // Exactly one key — the React key of each rendered row.
  const keys = list.itemShape.filter((f) => f.isKey);
  if (keys.length !== 1) {
    errors.push({
      nodeId: list.id,
      message: `itemShape must have exactly one isKey field (found ${keys.length})`,
    });
  }

  // Sample rows: keys ⊆ itemShape, values match the declared types.
  const shape = new Map(list.itemShape.map((f) => [f.name, f]));
  list.sampleRows.forEach((row, i) => {
    for (const [key, value] of Object.entries(row)) {
      const field = shape.get(key);
      if (!field) {
        errors.push({
          nodeId: list.id,
          message: `sampleRows[${i}] has key "${key}" not declared in itemShape`,
        });
      } else if (!valueMatches(field, value)) {
        errors.push({
          nodeId: list.id,
          message: `sampleRows[${i}].${key} is not a ${field.type === "image" ? "string (image URL)" : field.type}`,
        });
      }
    }
  });
}
