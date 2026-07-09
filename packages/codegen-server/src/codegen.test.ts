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
import { migrateSketches } from "./generators/sketch-migrator.js";
import { printNewSketch, scanSketches } from "./generators/sketch-scan.js";
import { generateAdapterSkeleton } from "./generators/adapter-skeleton.js";
import { generateWiring } from "./generators/wiring-generator.js";
import { generateScaffolding } from "./generators/scaffolding.js";
import { generateSketch } from "./generators/sketch-generator.js";
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

// ----------------------------------------------------------------- sketch --

const SKETCH_FIXTURE = `<Sketch sk:id="sk_login" name="Login Screen" blueprintRef="feat_login" schemaVersion={3}>
  <Stack sk:id="root" gap={6} pad={6} h="fill">
    <Button sk:id="submit" variant="primary" intent="submit" w="fill">Sign in</Button>
  </Stack>
</Sketch>
`;

function seedSketch(root: string, rel = "sketches/login-screen.sketch"): string {
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), SKETCH_FIXTURE);
  return rel;
}

test("sketch: emits the generated half, sibling, ui scaffolding and tokens", () => {
  withTmpDir((root) => {
    const rel = seedSketch(root);
    const files = generateSketch({ projectRoot: root, sketchPath: rel });

    assert.deepEqual(
      [...files].sort(),
      [
        "packages/ui/package.json",
        "packages/ui/src/generated/login-screen.generated.tsx",
        "packages/ui/src/login-screen.tsx",
        "packages/ui/tsconfig.json",
        "tokens.default.json",
      ],
    );

    const gen = read(root, "packages/ui/src/generated/login-screen.generated.tsx");
    assert.match(gen, /AUTO-GENERATED/);
    // Provenance comment points at the REAL file, not a name-derived guess.
    assert.match(gen, /from sketches\/login-screen\.sketch/);
    assert.match(gen, /export function LoginScreen\(/);
    assert.match(gen, /export type SketchHandlers = \{/);
    assert.match(gen, /"submit"\?: \(\) => void;/);
    assert.match(gen, /data-sk="submit"/);

    const sibling = read(root, "packages/ui/src/login-screen.tsx");
    assert.match(
      sibling,
      /import \{ LoginScreen as Generated, type SketchHandlers \} from "\.\/generated\/login-screen\.generated";/,
    );
    assert.match(sibling, /export function LoginScreen\(\)/);
    // No workspace at the root → the sibling carries the wiring instructions.
    assert.match(sibling, /not a pnpm workspace/);

    // No patchboard config → the ui package lands under the default scope.
    const pkg = JSON.parse(read(root, "packages/ui/package.json"));
    assert.equal(pkg.name, "@app/ui");

    // tsconfig turns on the jsx transform the generated .tsx needs. This
    // root has no tsconfig.base.json → the scaffold self-heals to a
    // standalone inline config instead of extending a missing file.
    const tsconfig = JSON.parse(read(root, "packages/ui/tsconfig.json"));
    assert.equal(tsconfig.extends, undefined);
    assert.equal(tsconfig.compilerOptions.jsx, "react-jsx");
    assert.equal(tsconfig.compilerOptions.strict, true);

    // tokens.default.json is a complete offline-readable binding table.
    const tokens = JSON.parse(read(root, "tokens.default.json"));
    assert.equal(tokens.colors.primary, "blue-600");
    assert.deepEqual(tokens.spacing, [0, 1, 2, 3, 4, 6, 8, 12, 16, 24]);
  });
});

test("sketch: ownership — generated is overwritten, sibling never is", () => {
  withTmpDir((root) => {
    const rel = seedSketch(root);
    generateSketch({ projectRoot: root, sketchPath: rel });

    fs.writeFileSync(
      path.join(root, "packages/ui/src/generated/login-screen.generated.tsx"),
      "// clobbered\n",
    );
    fs.writeFileSync(path.join(root, "packages/ui/src/login-screen.tsx"), "// USER\n");

    const second = generateSketch({ projectRoot: root, sketchPath: rel });
    assert.match(
      read(root, "packages/ui/src/generated/login-screen.generated.tsx"),
      /AUTO-GENERATED/,
    );
    assert.equal(read(root, "packages/ui/src/login-screen.tsx"), "// USER\n");
    assert.ok(!second.includes("packages/ui/src/login-screen.tsx"));
    assert.ok(second.includes("packages/ui/src/generated/login-screen.generated.tsx"));
  });
});

const LIST_SKETCH_FIXTURE = `<Sketch sk:id="sk_inbox" name="Inbox" schemaVersion={3}>
  <Stack sk:id="root" gap={4} pad={6} h="fill">
    <List sk:id="mail-list" dataKey="inbox">
      <ItemShape>
        <Field name="id" type="string" key />
        <Field name="subject" type="string" />
      </ItemShape>
      <d:Sample id="m1" subject="Hello" />
      <Template>
        <Stack sk:id="mail-row" dir="row" gap={2} pad={2} cross="center">
          <Text sk:id="mail-subject">{Bind subject}</Text>
          <Button sk:id="mail-open" variant="ghost" intent="navigate">Open</Button>
        </Stack>
      </Template>
    </List>
  </Stack>
</Sketch>
`;

test("sketch: a list emits map/key/item type, and the sibling gets a data stub", () => {
  withTmpDir((root) => {
    const rel = "sketches/inbox.sketch";
    fs.mkdirSync(path.join(root, "sketches"), { recursive: true });
    fs.writeFileSync(path.join(root, rel), LIST_SKETCH_FIXTURE);
    generateSketch({ projectRoot: root, sketchPath: rel });

    const gen = read(root, "packages/ui/src/generated/inbox.generated.tsx");
    assert.match(gen, /export type InboxItem = \{/);
    assert.match(gen, /"mail-open"\?: \(item: InboxItem\) => void;/);
    assert.match(gen, /data: \{ inbox: InboxItem\[\] \}/);
    assert.match(gen, /\{data\.inbox\.map\(\(item\) => \(/);
    assert.match(gen, /key=\{item\.id\}/);
    assert.match(gen, /\{item\.subject\}/);
    assert.match(gen, /onClick=\{\(\) => handlers\["mail-open"\]\?\.\(item\)\}/);

    // The sibling is scaffolded with an empty-rows stub — the seam where the
    // user wires real data (lists only render; data is the sibling's job).
    const sibling = read(root, "packages/ui/src/inbox.tsx");
    assert.match(sibling, /<Generated data=\{\{ inbox: \[\] \}\} handlers=\{handlers\} \/>/);
  });
});

test("sketch: a monorepo host keeps the extends-based tsconfig and a bare sibling", () => {
  withTmpDir((root) => {
    // A workspace-shaped host: base config + pnpm workspace manifest.
    fs.writeFileSync(path.join(root, "tsconfig.base.json"), "{}\n");
    fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    const rel = seedSketch(root);
    generateSketch({ projectRoot: root, sketchPath: rel });

    const tsconfig = JSON.parse(read(root, "packages/ui/tsconfig.json"));
    assert.equal(tsconfig.extends, "../../tsconfig.base.json");
    assert.equal(tsconfig.compilerOptions.strict, undefined, "base owns the shared options");

    const sibling = read(root, "packages/ui/src/login-screen.tsx");
    assert.ok(!sibling.includes("not a pnpm workspace"), "no wiring note on a workspace host");
  });
});

test("scanSketches returns entity meta per file and names unparsable ones", () => {
  withTmpDir((root) => {
    seedSketch(root);
    fs.writeFileSync(path.join(root, "sketches/broken.sketch"), "<Panel />");
    const report = scanSketches({ projectRoot: root });
    assert.deepEqual(report.entries, [
      {
        file: "sketches/login-screen.sketch",
        id: "sk_login",
        name: "Login Screen",
        blueprintRef: "feat_login",
      },
    ]);
    assert.equal(report.failed.length, 1);
    assert.equal(report.failed[0].file, "sketches/broken.sketch");
    assert.match(report.failed[0].reason, /根元素必须是 <Sketch>/);
  });
});

test("printNewSketch emits canonical v3 markup that scans back", () => {
  withTmpDir((root) => {
    const { markup } = printNewSketch({ sketchId: "sk_new", name: "Fresh", blueprintRef: "01F" });
    assert.match(markup, /<Sketch sk:id="sk_new" name="Fresh" blueprintRef="01F" schemaVersion=\{3\}>/);
    assert.match(markup, /<Stack gap=\{4\} pad=\{4\} h="fill" \/>/);
    fs.mkdirSync(path.join(root, "sketches"), { recursive: true });
    fs.writeFileSync(path.join(root, "sketches/fresh.sketch"), markup);
    const report = scanSketches({ projectRoot: root });
    assert.equal(report.entries[0].id, "sk_new");
  });
});

test("sketch: package scope comes from .patchboard/config.json when present", () => {
  withTmpDir((root) => {
    fs.mkdirSync(path.join(root, ".patchboard"), { recursive: true });
    fs.writeFileSync(path.join(root, ".patchboard/config.json"), '{"scopeName":"@myapp"}');
    const rel = seedSketch(root);
    generateSketch({ projectRoot: root, sketchPath: rel });
    const pkg = JSON.parse(read(root, "packages/ui/package.json"));
    assert.equal(pkg.name, "@myapp/ui");
  });
});

// -------------------------------------------------------------- migration --

const V2_INBOX_JSON = JSON.stringify(
  {
    id: "sk_inbox",
    name: "Inbox",
    blueprintRef: "01FEAT",
    schemaVersion: 2,
    root: {
      kind: "stack",
      id: "root",
      layout: {
        direction: "col",
        gap: 4,
        // non-uniform padding — the per-edge migration-fidelity case
        padding: { top: 6, right: 2, bottom: 6, left: 2 },
        mainAxis: "start",
        crossAxis: "stretch",
      },
      sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
      style: { border: { width: "thin", color: "border" }, radius: "md" },
      children: [
        {
          kind: "button",
          id: "go",
          label: "Go",
          variant: "ghost",
          // navigate WITH target — the intent:to fidelity case
          intent: { kind: "navigate", to: "sk_next" },
          sizing: { width: { mode: "hug" }, height: { mode: "hug" } },
        },
        {
          kind: "list",
          id: "mail-list",
          dataKey: "inbox",
          itemShape: [
            { name: "id", type: "string", isKey: true },
            { name: "unread", type: "boolean" },
          ],
          sampleRows: [{ id: "m1", unread: true }],
          template: {
            kind: "stack",
            id: "row",
            layout: {
              direction: "row",
              gap: 2,
              padding: { top: 2, right: 2, bottom: 2, left: 2 },
              mainAxis: "start",
              crossAxis: "center",
            },
            sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
            children: [
              {
                kind: "text",
                id: "subj",
                role: "body",
                content: { bind: "id" },
                sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
              },
            ],
          },
          sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
        },
      ],
    },
  },
  null,
  2,
);

function seedV2(root: string, name: string, json: string): string {
  fs.mkdirSync(path.join(root, "sketches"), { recursive: true });
  fs.writeFileSync(path.join(root, "sketches", name), json);
  return `sketches/${name}`;
}

test("migration: a v2 document becomes verified .sketch markup with a .bak left behind", () => {
  withTmpDir((root) => {
    seedV2(root, "inbox.sketch.json", V2_INBOX_JSON);
    const report = migrateSketches({ projectRoot: root });
    assert.deepEqual(report.migrated, ["sketches/inbox.sketch.json"]);
    assert.deepEqual(report.failed, []);

    const markup = read(root, "sketches/inbox.sketch");
    // Entity + fidelity spot checks: per-edge pad, border, navigate target,
    // typed sample rows, bind, and every ULID preserved as sk:id.
    assert.match(markup, /<Sketch sk:id="sk_inbox" name="Inbox" blueprintRef="01FEAT" schemaVersion=\{3\}>/);
    assert.match(markup, /pad="6 2"/);
    assert.match(markup, /border="thin border"/);
    assert.match(markup, /intent="navigate:sk_next"/);
    assert.match(markup, /<d:Sample id="m1" unread="true" \/>/);
    assert.match(markup, /\{Bind id\}/);
    assert.match(markup, /sk:id="mail-list"/);

    assert.ok(fs.existsSync(path.join(root, "sketches/inbox.sketch.json.bak")), "original kept as .bak");
    assert.ok(!fs.existsSync(path.join(root, "sketches/inbox.sketch.json")), "json renamed away");

    // Idempotent: a second run skips (the .sketch already exists — even if
    // someone restores the .bak to .json).
    fs.copyFileSync(
      path.join(root, "sketches/inbox.sketch.json.bak"),
      path.join(root, "sketches/inbox.sketch.json"),
    );
    const again = migrateSketches({ projectRoot: root });
    assert.deepEqual(again.migrated, []);
    assert.deepEqual(again.skipped, ["sketches/inbox.sketch.json"]);
  });
});

test("migration: refusals are loud and leave the original untouched", () => {
  withTmpDir((root) => {
    // A semantics field — the dialect has no spelling for it.
    const withSemantics = JSON.parse(V2_INBOX_JSON);
    withSemantics.root.children[0].semantics = { declared: "button" };
    seedV2(root, "sem.sketch.json", JSON.stringify(withSemantics));
    // Unparsable JSON.
    seedV2(root, "broken.sketch.json", "{ not json");

    const report = migrateSketches({ projectRoot: root });
    assert.deepEqual(report.migrated, []);
    assert.equal(report.failed.length, 2);
    const reasons = Object.fromEntries(report.failed.map((f) => [f.file, f.reason]));
    assert.match(reasons["sketches/sem.sketch.json"], /semantics/);
    assert.match(reasons["sketches/broken.sketch.json"], /JSON 解析失败/);

    // Originals untouched, no partial outputs.
    assert.ok(fs.existsSync(path.join(root, "sketches/sem.sketch.json")));
    assert.ok(fs.existsSync(path.join(root, "sketches/broken.sketch.json")));
    assert.ok(!fs.existsSync(path.join(root, "sketches/sem.sketch")));
    assert.ok(!fs.existsSync(path.join(root, "sketches/broken.sketch")));
  });
});

test("migration: v2 spelling variants canonicalize instead of failing equivalence", () => {
  withTmpDir((root) => {
    const variants = JSON.parse(V2_INBOX_JSON);
    delete variants.root.children[0].intent; // absent intent ≡ none
    variants.root.style = { border: { width: "none", color: "border" } }; // none-border ≡ no border
    seedV2(root, "variants.sketch.json", JSON.stringify(variants));

    const report = migrateSketches({ projectRoot: root });
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.migrated, ["sketches/variants.sketch.json"]);
    const markup = read(root, "sketches/variants.sketch");
    assert.ok(!markup.includes("intent="), "canonical none-intent is omitted");
    assert.ok(!markup.includes("border="), "none-border is omitted");
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
