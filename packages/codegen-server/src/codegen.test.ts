/**
 * Golden tests for the code generators — the constitution marks codegen as a
 * zero-tech-debt zone, so every generator's observable contract is locked
 * here: namespace layout, extends resolution, ownership rules (tool-owned
 * overwrite vs user-owned skip-if-exists), topological wiring order, type
 * bridge levels, and the JSON-RPC envelope.
 *
 * Assertions are structural (substrings + ordering), not whole-file
 * snapshots, so cosmetic formatting changes don't churn the suite while real
 * contract changes still fail loudly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { generateSockets } from "./generators/socket-generator.js";
import { generateAdapterSkeleton } from "./generators/adapter-skeleton.js";
import { generateWiring } from "./generators/wiring-generator.js";
import { generateScaffolding } from "./generators/scaffolding.js";
import { handleRequest } from "./rpc.js";
import type {
  AdapterNode,
  Canvas,
  SocketDefinition,
} from "./types.js";

const SCOPE = "@myapp";

const SOCKETS: SocketDefinition[] = [
  {
    id: "sock-logger",
    fullName: "log.Logger",
    displayName: "Logger",
    lifecycle: "stable",
    extends: [],
    methods: [
      {
        name: "log",
        params: [{ name: "msg", paramType: "string", optional: false }],
        returnType: "void",
      },
    ],
  },
  {
    id: "sock-structured",
    fullName: "log.StructuredLogger",
    displayName: "StructuredLogger",
    lifecycle: "draft",
    extends: ["sock-logger"],
    methods: [
      {
        name: "logJson",
        params: [
          {
            name: "payload",
            paramType: "Record<string, unknown>",
            optional: true,
          },
        ],
        returnType: "void",
      },
    ],
  },
  {
    id: "sock-email",
    fullName: "email.EmailSender",
    displayName: "EmailSender",
    lifecycle: "stable",
    extends: [],
    methods: [
      {
        name: "send",
        params: [
          { name: "to", paramType: "string", optional: false },
          { name: "body", paramType: "string", optional: false },
        ],
        returnType: "Promise<void>",
      },
    ],
  },
];

const CONSOLE_LOGGER: AdapterNode = {
  id: "ad-console",
  name: "ConsoleLogger",
  implements: ["sock-logger"],
  constructorParams: [],
};

// Depends on a socket it does NOT implement (Logger) plus a primitive —
// exercises both constructor-param kinds and the dep-import path.
const SMTP: AdapterNode = {
  id: "ad-smtp",
  name: "SmtpEmailSender",
  implements: ["sock-email"],
  constructorParams: [
    { name: "logger", paramType: { kind: "socketDep", socketId: "sock-logger" } },
    { name: "host", paramType: { kind: "primitive", typeName: "string" } },
  ],
};

// SMTP listed first on purpose: instantiation order must come from the wire
// topology, not the adapter array order.
const CANVAS: Canvas = {
  id: "cv-1",
  name: "Mail Canvas",
  adapters: [SMTP, CONSOLE_LOGGER],
  wires: [
    {
      id: "w1",
      fromAdapterId: "ad-console",
      fromSocketId: "sock-logger",
      toAdapterId: "ad-smtp",
      toParamName: "logger",
    },
  ],
  entryPoints: [{ id: "ep1", adapterId: "ad-smtp", exportName: "createMailer" }],
};

function withTmpDir(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-test-"));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

// ---------------------------------------------------------------- sockets --

test("sockets: namespaces map to directories, extends resolve, barrel exports", () => {
  withTmpDir((root) => {
    const files = generateSockets({
      projectRoot: root,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });

    assert.deepEqual(
      [...files].sort(),
      [
        "packages/sockets/src/email/EmailSender.ts",
        "packages/sockets/src/index.ts",
        "packages/sockets/src/log/Logger.ts",
        "packages/sockets/src/log/StructuredLogger.ts",
      ],
    );

    const logger = read(root, "packages/sockets/src/log/Logger.ts");
    assert.match(logger, /export interface Logger \{/);
    assert.match(logger, /  log\(msg: string\): void;/);

    const structured = read(
      root,
      "packages/sockets/src/log/StructuredLogger.ts",
    );
    assert.match(structured, /import type \{ Logger \} from "\.\/Logger";/);
    assert.match(structured, /export interface StructuredLogger extends Logger \{/);
    assert.match(
      structured,
      /  logJson\(payload\?: Record<string, unknown>\): void;/,
    );

    const email = read(root, "packages/sockets/src/email/EmailSender.ts");
    assert.match(email, /  send\(to: string, body: string\): Promise<void>;/);

    const index = read(root, "packages/sockets/src/index.ts");
    assert.match(index, /export type \{ Logger \} from "\.\/log\/Logger";/);
    assert.match(
      index,
      /export type \{ StructuredLogger \} from "\.\/log\/StructuredLogger";/,
    );
    assert.match(
      index,
      /export type \{ EmailSender \} from "\.\/email\/EmailSender";/,
    );
  });
});

test("sockets: package is tool-owned — regeneration removes stray files", () => {
  withTmpDir((root) => {
    generateSockets({ projectRoot: root, sockets: SOCKETS, scopeName: SCOPE });
    const stray = path.join(root, "packages/sockets/src/stray.ts");
    fs.writeFileSync(stray, "// user edit in tool-owned territory\n");

    generateSockets({ projectRoot: root, sockets: SOCKETS, scopeName: SCOPE });
    assert.equal(fs.existsSync(stray), false);
  });
});

// --------------------------------------------------------------- adapters --

test("adapter skeleton: marker, implements, ctor params, stubs, dep imports", () => {
  withTmpDir((root) => {
    const files = generateAdapterSkeleton({
      projectRoot: root,
      adapter: SMTP,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });
    assert.deepEqual(files, ["packages/adapters/src/SmtpEmailSender.ts"]);

    const src = read(root, "packages/adapters/src/SmtpEmailSender.ts");
    assert.match(src, /\/\/ @adapter-id: ad-smtp/);
    assert.match(src, /export class SmtpEmailSender implements EmailSender \{/);
    assert.match(
      src,
      /constructor\(private readonly logger: Logger, private readonly host: string\) \{\}/,
    );
    assert.match(src, /  send\(to: string, body: string\): Promise<void> \{/);
    assert.match(src, /throw new Error\("Not implemented"\)/);
    // Logger is only a constructor dependency (not implemented) — its type
    // must still be imported or the skeleton doesn't compile.
    const importLine = src.split("\n").find((l) => l.startsWith("import type"));
    assert.ok(importLine, "skeleton must import its socket types");
    assert.match(importLine!, /EmailSender/);
    assert.match(importLine!, /Logger/);
    assert.match(importLine!, new RegExp(`from "${SCOPE}/sockets"`));
  });
});

test("adapter skeleton: user-owned — never overwrites an existing file", () => {
  withTmpDir((root) => {
    const filePath = path.join(root, "packages/adapters/src/SmtpEmailSender.ts");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "// USER CONTENT — DO NOT TOUCH\n");

    const files = generateAdapterSkeleton({
      projectRoot: root,
      adapter: SMTP,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });
    assert.deepEqual(files, []);
    assert.equal(
      read(root, "packages/adapters/src/SmtpEmailSender.ts"),
      "// USER CONTENT — DO NOT TOUCH\n",
    );
  });
});

test("adapter skeleton: index.ts manifest lists all adapters, sorted", () => {
  withTmpDir((root) => {
    generateAdapterSkeleton({
      projectRoot: root,
      adapter: SMTP,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });
    generateAdapterSkeleton({
      projectRoot: root,
      adapter: CONSOLE_LOGGER,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });

    const index = read(root, "packages/adapters/src/index.ts");
    const consoleAt = index.indexOf(
      'export { ConsoleLogger } from "./ConsoleLogger";',
    );
    const smtpAt = index.indexOf(
      'export { SmtpEmailSender } from "./SmtpEmailSender";',
    );
    assert.ok(consoleAt >= 0 && smtpAt >= 0, index);
    assert.ok(consoleAt < smtpAt, "manifest must be sorted");
  });
});

// ----------------------------------------------------------------- wiring --

test("wiring: topological construction order, package imports, entry return", () => {
  withTmpDir((root) => {
    const files = generateWiring({
      projectRoot: root,
      canvas: CANVAS,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });
    assert.deepEqual(files, ["packages/wiring/src/mail-canvas.wiring.ts"]);

    const src = read(root, "packages/wiring/src/mail-canvas.wiring.ts");
    assert.match(src, new RegExp(`import \\{ .* \\} from "${SCOPE}/adapters";`));
    assert.match(src, /export function createMailer\(\): SmtpEmailSender \{/);

    // ConsoleLogger has no deps; SmtpEmailSender consumes it — construction
    // order must follow the wires even though the adapter array is reversed.
    const loggerAt = src.indexOf("const consoleLogger = new ConsoleLogger();");
    const smtpAt = src.indexOf(
      "const smtpEmailSender = new SmtpEmailSender(consoleLogger,",
    );
    assert.ok(loggerAt >= 0, src);
    assert.ok(smtpAt >= 0, src);
    assert.ok(loggerAt < smtpAt, "wired dependency must be constructed first");

    // The unwired primitive param degrades to an explicit TODO placeholder.
    assert.match(src, /undefined as any \/\* TODO: provide host: string \*\//);
    assert.match(src, /  return smtpEmailSender;\n\}/);
  });
});

test("wiring: risky (L2) bridge inserts a cast plus a TODO with the reason", () => {
  withTmpDir((root) => {
    generateWiring({
      projectRoot: root,
      canvas: CANVAS,
      sockets: SOCKETS,
      scopeName: SCOPE,
      bridges: [
        {
          wireId: "w1",
          level: "risky",
          reason: "narrowing conversion",
          blocking: false,
        },
      ],
    });

    const src = read(root, "packages/wiring/src/mail-canvas.wiring.ts");
    assert.match(src, /\/\/ TODO\[type-bridge L2\]: narrowing conversion/);
    assert.match(src, /\(consoleLogger as unknown as Logger\)/);
  });
});

test("wiring: an unwired socket dependency degrades to a marked placeholder", () => {
  withTmpDir((root) => {
    generateWiring({
      projectRoot: root,
      canvas: { ...CANVAS, wires: [] },
      sockets: SOCKETS,
      scopeName: SCOPE,
    });

    const src = read(root, "packages/wiring/src/mail-canvas.wiring.ts");
    assert.match(src, /undefined \/\* unwired: logger \*\//);
  });
});

test("wiring: a wire cycle neither hangs nor emits the cyclic adapters", () => {
  withTmpDir((root) => {
    const a: AdapterNode = {
      id: "ad-a",
      name: "AlphaAdapter",
      implements: ["sock-logger"],
      constructorParams: [
        { name: "peer", paramType: { kind: "socketDep", socketId: "sock-logger" } },
      ],
    };
    const b: AdapterNode = {
      id: "ad-b",
      name: "BetaAdapter",
      implements: ["sock-logger"],
      constructorParams: [
        { name: "peer", paramType: { kind: "socketDep", socketId: "sock-logger" } },
      ],
    };
    const cyclic: Canvas = {
      id: "cv-cycle",
      name: "cycle",
      adapters: [a, b],
      wires: [
        { id: "w-ab", fromAdapterId: "ad-a", fromSocketId: "sock-logger", toAdapterId: "ad-b", toParamName: "peer" },
        { id: "w-ba", fromAdapterId: "ad-b", fromSocketId: "sock-logger", toAdapterId: "ad-a", toParamName: "peer" },
      ],
      entryPoints: [{ id: "ep", adapterId: "ad-a", exportName: "createCycle" }],
    };

    // The canvas layer rejects cycles before codegen (hard constraint 7);
    // this locks the generator's defensive behavior if one slips through.
    generateWiring({
      projectRoot: root,
      canvas: cyclic,
      sockets: SOCKETS,
      scopeName: SCOPE,
    });
    const src = read(root, "packages/wiring/src/cycle.wiring.ts");
    assert.doesNotMatch(src, /new AlphaAdapter/);
    assert.doesNotMatch(src, /new BetaAdapter/);
    assert.match(src, /return undefined;/);
  });
});

// ------------------------------------------------------------ scaffolding --

test("scaffolding: creates workspace files with path aliases and workspace deps", () => {
  withTmpDir((tmp) => {
    const root = path.join(tmp, "My Project");
    fs.mkdirSync(root);
    const created = generateScaffolding({ projectRoot: root, scopeName: SCOPE });

    assert.deepEqual(
      [...created].sort(),
      [
        "package.json",
        "packages/adapters/package.json",
        "packages/sockets/package.json",
        "packages/wiring/package.json",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        "tsconfig.json",
      ],
    );

    const rootPkg = JSON.parse(read(root, "package.json"));
    assert.equal(rootPkg.name, "my-project");

    const base = JSON.parse(read(root, "tsconfig.base.json"));
    assert.deepEqual(base.compilerOptions.paths[`${SCOPE}/sockets`], [
      "packages/sockets/src/index.ts",
    ]);

    // tsserver only loads tsconfig.json — the base alone would be inert.
    const tsconfig = JSON.parse(read(root, "tsconfig.json"));
    assert.equal(tsconfig.extends, "./tsconfig.base.json");

    const adaptersPkg = JSON.parse(read(root, "packages/adapters/package.json"));
    assert.equal(adaptersPkg.name, `${SCOPE}/adapters`);
    assert.equal(adaptersPkg.dependencies[`${SCOPE}/sockets`], "workspace:*");
  });
});

test("scaffolding: user-owned once created — skip-if-exists, never overwrites", () => {
  withTmpDir((root) => {
    fs.writeFileSync(
      path.join(root, "package.json"),
      '{"name":"user-managed"}\n',
    );

    const created = generateScaffolding({ projectRoot: root, scopeName: SCOPE });
    assert.ok(!created.includes("package.json"));
    assert.equal(read(root, "package.json"), '{"name":"user-managed"}\n');
  });
});

// -------------------------------------------------------------- JSON-RPC --

test("rpc: ping round-trips, unknown method is -32601, handler errors are -32000", () => {
  const ping = handleRequest({ jsonrpc: "2.0", id: 1, method: "ping", params: {} });
  assert.deepEqual(ping, { jsonrpc: "2.0", id: 1, result: { status: "ok" } });

  const unknown = handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "nope",
    params: {},
  });
  assert.equal(unknown.error?.code, -32601);
  assert.equal(unknown.id, 2);

  // null params make the handler destructure throw — must surface as -32000,
  // not crash the server loop.
  const bad = handleRequest({
    jsonrpc: "2.0",
    id: 3,
    method: "generateSockets",
    params: null,
  });
  assert.equal(bad.error?.code, -32000);
  assert.equal(bad.id, 3);
});
