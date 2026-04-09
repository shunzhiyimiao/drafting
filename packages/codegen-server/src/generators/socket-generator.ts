import { Project } from "ts-morph";
import * as path from "node:path";
import * as fs from "node:fs";
import type { SocketDefinition, GenerateSocketsParams } from "../types.js";

/**
 * Generate packages/sockets/ from Socket definitions.
 * TOOL-OWNED: overwrites entirely on each generation.
 */
export function generateSockets(params: GenerateSocketsParams): string[] {
  const { projectRoot, sockets, scopeName } = params;
  const socketsDir = path.join(projectRoot, "packages/sockets/src");

  // Clean existing generated files
  if (fs.existsSync(socketsDir)) {
    fs.rmSync(socketsDir, { recursive: true });
  }
  fs.mkdirSync(socketsDir, { recursive: true });

  const project = new Project({ useInMemoryFileSystem: false });
  const generatedFiles: string[] = [];

  // Build a map of socket ID -> interface name for extends resolution
  const socketMap = new Map<string, SocketDefinition>();
  for (const socket of sockets) {
    socketMap.set(socket.id, socket);
  }

  for (const socket of sockets) {
    const interfaceName = getInterfaceName(socket.fullName);
    const filePath = getSocketFilePath(socketsDir, socket.fullName);
    const dirPath = path.dirname(filePath);
    fs.mkdirSync(dirPath, { recursive: true });

    let content = "";

    // Import extended sockets
    for (const extId of socket.extends) {
      const parent = socketMap.get(extId);
      if (parent) {
        const parentName = getInterfaceName(parent.fullName);
        const parentRelPath = getRelativeImport(filePath, getSocketFilePath(socketsDir, parent.fullName));
        content += `import type { ${parentName} } from "${parentRelPath}";\n`;
      }
    }

    if (socket.extends.length > 0) {
      content += "\n";
    }

    // Interface declaration
    const extendsClause = socket.extends
      .map((id) => {
        const parent = socketMap.get(id);
        return parent ? getInterfaceName(parent.fullName) : null;
      })
      .filter(Boolean)
      .join(", ");

    content += `export interface ${interfaceName}`;
    if (extendsClause) {
      content += ` extends ${extendsClause}`;
    }
    content += " {\n";

    for (const method of socket.methods) {
      const params = method.params
        .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.paramType}`)
        .join(", ");
      content += `  ${method.name}(${params}): ${method.returnType};\n`;
    }

    content += "}\n";

    fs.writeFileSync(filePath, content);
    generatedFiles.push(path.relative(projectRoot, filePath));
  }

  // Generate index.ts barrel export
  const indexPath = path.join(socketsDir, "index.ts");
  let indexContent = "";
  for (const socket of sockets) {
    const interfaceName = getInterfaceName(socket.fullName);
    const relPath = "./" + getSocketRelPath(socket.fullName).replace(/\.ts$/, "");
    indexContent += `export type { ${interfaceName} } from "${relPath}";\n`;
  }
  fs.writeFileSync(indexPath, indexContent);
  generatedFiles.push(path.relative(projectRoot, indexPath));

  return generatedFiles;
}

function getInterfaceName(fullName: string): string {
  const parts = fullName.split("/");
  return parts[parts.length - 1];
}

function getSocketRelPath(fullName: string): string {
  return fullName.replace(/\//g, "/") + ".ts";
}

function getSocketFilePath(socketsDir: string, fullName: string): string {
  return path.join(socketsDir, getSocketRelPath(fullName));
}

function getRelativeImport(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\.ts$/, "");
  if (!rel.startsWith(".")) {
    rel = "./" + rel;
  }
  return rel;
}
