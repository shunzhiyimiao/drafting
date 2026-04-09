import * as path from "node:path";
import * as fs from "node:fs";
import type {
  SocketDefinition,
  GenerateAdapterSkeletonParams,
} from "../types.js";

/**
 * Generate adapter skeleton class. USER-OWNED: only generated if file doesn't exist.
 */
export function generateAdapterSkeleton(
  params: GenerateAdapterSkeletonParams,
): string[] {
  const { projectRoot, adapter, sockets, scopeName } = params;
  const adaptersDir = path.join(projectRoot, "packages/adapters/src");
  fs.mkdirSync(adaptersDir, { recursive: true });

  const filePath = path.join(adaptersDir, `${adapter.name}.ts`);

  // Skip if file already exists (user owns it)
  if (fs.existsSync(filePath)) {
    return [];
  }

  const socketMap = new Map<string, SocketDefinition>();
  for (const s of sockets) {
    socketMap.set(s.id, s);
  }

  const implementsNames = adapter.implements
    .map((id) => socketMap.get(id))
    .filter(Boolean)
    .map((s) => getInterfaceName(s!.fullName));

  // Build imports
  let content = "";
  const importedTypes = new Set<string>();
  for (const sid of adapter.implements) {
    const socket = socketMap.get(sid);
    if (socket) {
      const name = getInterfaceName(socket.fullName);
      importedTypes.add(name);
    }
  }

  if (importedTypes.size > 0) {
    content += `import type { ${[...importedTypes].join(", ")} } from "${scopeName}/sockets";\n\n`;
  }

  // Constructor params
  const ctorParams = adapter.constructorParams
    .map((p) => {
      if (p.paramType.kind === "socketDep") {
        const socket = socketMap.get(p.paramType.socketId ?? "");
        const typeName = socket
          ? getInterfaceName(socket.fullName)
          : "unknown";
        return `private readonly ${p.name}: ${typeName}`;
      }
      return `private readonly ${p.name}: ${p.paramType.typeName ?? "unknown"}`;
    })
    .join(", ");

  // Adapter marker comment
  content += `// @adapter-id: ${adapter.id}\n`;
  content += `export class ${adapter.name} implements ${implementsNames.join(", ")} {\n`;
  content += `  constructor(${ctorParams}) {}\n\n`;

  // Stub methods from all implemented sockets
  for (const sid of adapter.implements) {
    const socket = socketMap.get(sid);
    if (!socket) continue;
    for (const method of socket.methods) {
      const params = method.params
        .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.paramType}`)
        .join(", ");
      content += `  ${method.name}(${params}): ${method.returnType} {\n`;
      content += `    throw new Error("Not implemented");\n`;
      content += `  }\n\n`;
    }
  }

  content += "}\n";

  fs.writeFileSync(filePath, content);

  // Update index.ts manifest
  updateAdaptersIndex(adaptersDir);

  return [path.relative(projectRoot, filePath)];
}

function updateAdaptersIndex(adaptersDir: string): void {
  const indexPath = path.join(adaptersDir, "index.ts");
  const files = fs
    .readdirSync(adaptersDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .sort();

  let content = "";
  for (const file of files) {
    const moduleName = file.replace(/\.ts$/, "");
    content += `export { ${moduleName} } from "./${moduleName}";\n`;
  }
  fs.writeFileSync(indexPath, content);
}

function getInterfaceName(fullName: string): string {
  const parts = fullName.split("/");
  return parts[parts.length - 1];
}
