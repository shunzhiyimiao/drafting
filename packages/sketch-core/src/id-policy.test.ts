/**
 * persist-on-need policy tests (Rev 4 §6): tree-derivable needs are (b)
 * intent≠none anywhere and (c) binds/intent inside a template; everything
 * else stays session-temp. Existing ULIDs are never replaced; minting is
 * pure and idempotent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ensurePersistentIds, needsPersistentId } from "./id-policy.js";
import { isTempId, parseSketchMarkup, printSketchMarkup } from "./markup.js";
import type { ButtonP, Container, ListP, TextP } from "./spec.js";

const DOC = `<Sketch name="t" schemaVersion={3}>
  <Stack>
    <Text>plain</Text>
    <Button intent="submit">Send</Button>
    <Button>Quiet</Button>
    <List dataKey="rows">
      <ItemShape>
        <Field name="id" type="string" key />
        <Field name="pic" type="image" />
      </ItemShape>
      <Template>
        <Stack>
          <Text>{Bind id}</Text>
          <Image src={Bind pic} alt="p" />
          <Text>static</Text>
          <Button intent="navigate:sk_x">Open</Button>
        </Stack>
      </Template>
    </List>
  </Stack>
</Sketch>`;

test("policy: intent≠none persists anywhere; template binds persist; the rest stays temp", () => {
  const { sketch } = parseSketchMarkup(DOC);
  const root = sketch.root;
  const [plain, submit, quiet, list] = root.children as [TextP, ButtonP, ButtonP, ListP];

  assert.equal(needsPersistentId(plain, false), false);
  assert.equal(needsPersistentId(submit, false), true);
  assert.equal(needsPersistentId(quiet, false), false, "intent none = no external need");
  assert.equal(needsPersistentId(list, false), false);
  assert.equal(needsPersistentId(root, false), false, "containers have no tree-derivable need");

  const [bindText, bindImg, staticText, navBtn] = list.template.children as [TextP, any, TextP, ButtonP];
  assert.equal(needsPersistentId(bindText, true), true);
  assert.equal(needsPersistentId(bindImg, true), true);
  assert.equal(needsPersistentId(staticText, true), false);
  assert.equal(needsPersistentId(navBtn, true), true);
  // The same bind outside a template carries no plural-addressing need.
  assert.equal(needsPersistentId(bindText, false), false);
});

test("ensurePersistentIds mints exactly the needed ids, purely and idempotently", () => {
  const { sketch } = parseSketchMarkup(DOC);
  let n = 0;
  const mint = () => `01MINT${String(++n).padStart(20, "0")}`;

  const first = ensurePersistentIds(sketch, mint);
  assert.equal(first.minted.length, 4, "submit btn + bind text + bind img + nav btn");

  // Pure: the input tree was not mutated.
  assert.ok(isTempId((sketch.root.children[1] as ButtonP).id));

  const [, submit, quiet, list] = first.sketch.root.children as [TextP, ButtonP, ButtonP, ListP];
  assert.ok(!isTempId(submit.id));
  assert.ok(isTempId(quiet.id), "quiet button stays temp");
  assert.ok(isTempId(first.sketch.root.id), "root stays temp");
  const [bindText, , staticText] = list.template.children as [TextP, unknown, TextP];
  assert.ok(!isTempId(bindText.id));
  assert.ok(isTempId(staticText.id));

  // Idempotent: a second pass mints nothing and changes nothing.
  const second = ensurePersistentIds(first.sketch, mint);
  assert.deepEqual(second.minted, []);
  assert.deepEqual(second.sketch, first.sketch);

  // Minted ids survive the text round-trip (they print as sk:id).
  const reparsed = parseSketchMarkup(printSketchMarkup(first.sketch)).sketch;
  assert.equal((reparsed.root.children[1] as ButtonP).id, submit.id);
});

test("existing persistent ids are never replaced", () => {
  const doc = `<Sketch name="t" schemaVersion={3}>
  <Stack>
    <Button sk:id="01KEEPME00000000000000000X" intent="submit">Send</Button>
  </Stack>
</Sketch>`;
  const { sketch } = parseSketchMarkup(doc);
  const { sketch: out, minted } = ensurePersistentIds(sketch, () => "01NEW");
  assert.deepEqual(minted, []);
  assert.equal((out.root.children[0] as ButtonP).id, "01KEEPME00000000000000000X");
});

test("a container tree without needs round-trips with zero persisted ids", () => {
  const doc = `<Sketch name="t" schemaVersion={3}>
  <Stack>
    <Stack dir="row"><Text>a</Text></Stack>
    <Input label="Email" />
  </Stack>
</Sketch>`;
  const { sketch } = parseSketchMarkup(doc);
  const { sketch: out, minted } = ensurePersistentIds(sketch, () => "01NEW");
  assert.deepEqual(minted, []);
  assert.ok(!printSketchMarkup(out).includes("sk:id"));
});
