import * as path from "node:path";
import * as fs from "node:fs";
import type { SocketDefinition, GenerateWiringParams, AdapterNode } from "../types.js";

/**
 * Generate wiring factory function from Canvas.
 * TOOL-OWNED: overwrites entirely on each generation.
 */
export function generateWiring(params: GenerateWiringParams): string[] {
  const { projectRoot, canvas, sockets, scopeName } = params;
  const wiringDir = path.join(projectRoot, "packages/wiring/src");
  fs.mkdirSync(wiringDir, { recursive: true });

  const socketMap = new Map<string, SocketDefinition>();
  for (const s of sockets) {
    socketMap.set(s.id, s);
  }

  // Topological sort of adapters by wire dependencies
  const sorted = topologicalSort(canvas.adapters, canvas.wires);

  // Build imports
  const socketImports = new Set<string>();
  const adapterImports = new Set<string>();

  for (const adapter of canvas.adapters) {
    adapterImports.add(adapter.name);
    for (const sid of adapter.implements) {
      const socket = socketMap.get(sid);
      if (socket) {
        socketImports.add(getInterfaceName(socket.fullName));
      }
    }
  }

  let content = "";
  if (socketImports.size > 0) {
    content += `import type { ${[...socketImports].join(", ")} } from "${scopeName}/sockets";\n`;
  }
  if (adapterImports.size > 0) {
    content += `import { ${[...adapterImports].join(", ")} } from "${scopeName}/adapters";\n`;
  }
  content += "\n";

  // Generate one factory per entry point
  for (const ep of canvas.entryPoints) {
    const entryAdapter = canvas.adapters.find((a) => a.id === ep.adapterId);
    if (!entryAdapter) continue;

    const returnType = entryAdapter.name;
    content += `export function ${ep.exportName}(): ${returnType} {\n`;

    // Instantiate adapters in topological order
    const varNames = new Map<string, string>();
    for (const adapter of sorted) {
      const varName = toCamelCase(adapter.name);
      varNames.set(adapter.id, varName);

      // Build constructor args
      const args = adapter.constructorParams
        .map((param) => {
          if (param.paramType.kind === "socketDep") {
            // Find the wire that provides this param
            const wire = canvas.wires.find(
              (w) => w.toAdapterId === adapter.id && w.toParamName === param.name,
            );
            if (wire) {
              return varNames.get(wire.fromAdapterId) ?? `undefined /* missing wire for ${param.name} */`;
            }
            return `undefined /* unwired: ${param.name} */`;
          }
          // Primitive params get a placeholder
          return `undefined as any /* TODO: provide ${param.name}: ${param.paramType.typeName ?? "unknown"} */`;
        })
        .join(", ");

      content += `  const ${varName} = new ${adapter.name}(${args});\n`;
    }

    const entryVar = varNames.get(ep.adapterId) ?? "undefined";
    content += `  return ${entryVar};\n`;
    content += "}\n\n";
  }

  const fileName = sanitizeFileName(canvas.name) + ".wiring.ts";
  const filePath = path.join(wiringDir, fileName);
  fs.writeFileSync(filePath, content);

  return [path.relative(projectRoot, filePath)];
}

function topologicalSort(
  adapters: AdapterNode[],
  wires: { fromAdapterId: string; toAdapterId: string }[],
): AdapterNode[] {
  const adapterMap = new Map<string, AdapterNode>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const a of adapters) {
    adapterMap.set(a.id, a);
    inDegree.set(a.id, 0);
    adj.set(a.id, []);
  }

  for (const w of wires) {
    if (adapterMap.has(w.fromAdapterId) && adapterMap.has(w.toAdapterId)) {
      adj.get(w.fromAdapterId)!.push(w.toAdapterId);
      inDegree.set(w.toAdapterId, (inDegree.get(w.toAdapterId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: AdapterNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(adapterMap.get(id)!);
    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

function toCamelCase(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
}

function getInterfaceName(fullName: string): string {
  const parts = fullName.split("/");
  return parts[parts.length - 1];
}
