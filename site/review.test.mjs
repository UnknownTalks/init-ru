import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request } from "node:http";
import { ReviewStore, reviewMarkdown } from "./review-store.mjs";
import { createPreviewServer, defaultReviewFile } from "./serve.mjs";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = (n = 1) => ({
  clientId: "request-" + String(n).padStart(8, "0"),
  body: "Тут нужно объяснить причину.",
  category: "explanation",
  anchor: {
    kind: "text",
    page: "/init-ru/01-foundations/01-from-data-to-agents/chat.html",
    elementId: "tokens-word-gap",
    label: "Словарь",
    quote: { exact: "незнакомое название", prefix: "", suffix: "" },
  },
  context: {
    sourceRevision: "test",
    pageVersion: "example",
    viewport: { width: 390, height: 844 },
  },
});
async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ut-review-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, "private", "comments.json");
}

test("concurrent comments survive and retries are idempotent", async (t) => {
  const file = await temporary(t),
    store = new ReviewStore(file);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) => store.create(input(i))),
  );
  const again = await store.create(input(3)),
    data = await store.read();
  assert.equal(data.comments.length, 12);
  assert.equal(new Set(data.comments.map((c) => c.id)).size, 12);
  assert.equal(again.clientId, input(3).clientId);
  await assert.rejects(
    async () =>
      store.create({
        ...input(3),
        body: "Другой текст после потерянного ответа",
      }),
    { status: 409 },
  );
  assert.equal(
    (await store.read()).comments.find((c) => c.id === again.id).body,
    input(3).body,
  );
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});
test("edits detect stale changes; resolving preserves the original location", async (t) => {
  const store = new ReviewStore(await temporary(t)),
    original = await store.create(input());
  const edited = await store.update(original.id, {
    body: "Исправить пример",
    baseUpdatedAt: original.updatedAt,
  });
  assert.notEqual(edited.updatedAt, original.updatedAt);
  await assert.rejects(
    store.update(original.id, {
      body: "Устаревшая правка",
      baseUpdatedAt: original.updatedAt,
    }),
    { status: 409 },
  );
  const resolved = await store.update(original.id, {
    status: "resolved",
    resolution: "Добавлена причина выбора.",
    baseUpdatedAt: edited.updatedAt,
  });
  assert.deepEqual(resolved.anchor, original.anchor);
  assert.equal(resolved.body, "Исправить пример");
  const fresh = new ReviewStore(store.file);
  assert.equal(
    (await fresh.read()).comments[0].resolution,
    "Добавлена причина выбора.",
  );
  assert.match(reviewMarkdown(await fresh.read()), /незнакомое название/);
  await store.update(original.id, { status: "open" });
  assert.equal((await store.read()).comments[0].resolution, null);
});
test("a damaged file is reported and never replaced with an empty list", async (t) => {
  const file = await temporary(t),
    store = new ReviewStore(file);
  await store.initialize();
  await writeFile(file, "not json");
  await assert.rejects(store.create(input()));
  assert.equal(await readFile(file, "utf8"), "not json");
});
test("local HTTP injection, origin checks and UTF-8 persistence", async (t) => {
  const file = await temporary(t),
    { server } = await createPreviewServer({ root, reviewFile: file });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port,
    page = "/init-ru/01-foundations/01-from-data-to-agents/chat.html";
  const html = await (await fetch(origin + page)).text();
  assert.match(html, /ut-review-config/);
  assert.match(html, /__review\/review.js/);
  assert(
    !(
      await readFile(
        path.join(root, "public", page.slice("/init-ru/".length)),
        "utf8",
      )
    ).includes("ut-review-config"),
    "Review code must not enter generated public pages",
  );
  assert(
    !defaultReviewFile(root).startsWith(root + path.sep),
    "Feedback must stay outside the public repository",
  );
  assert.equal(
    (
      await fetch(origin + "/__review/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify(input()),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/__review/api/comments", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(input()),
      })
    ).status,
    415,
  );
  const payload = Buffer.from(JSON.stringify(input()));
  const result = await new Promise((resolve, reject) => {
    const req = request(
      origin + "/__review/api/comments",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on("error", reject);
    for (let i = 0; i < payload.length; i++)
      req.write(payload.subarray(i, i + 1));
    req.end();
  });
  assert.equal(result.status, 201);
  assert.equal(JSON.parse(result.text).body, input().body);
  assert.equal(
    (await (await fetch(origin + "/__review/api")).json()).comments.length,
    1,
  );
  assert.match(
    await (await fetch(origin + "/__review/export.md")).text(),
    /Тут нужно объяснить/,
  );
  const blocked = await new Promise((resolve, reject) => {
    const req = request(
      origin + "/__review/api",
      { headers: { Host: "evil.example" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(blocked, 403);
});

test("deleting is reversible, preserves the block, and excludes feedback from the agent report", async (t) => {
  const store = new ReviewStore(await temporary(t));
  const original = await store.create({
    ...input(),
    anchor: { ...input().anchor, kind: "block" },
  });
  const deleted = await store.update(original.id, {
    status: "deleted",
    baseUpdatedAt: original.updatedAt,
  });
  assert.equal(deleted.previousStatus, "open");
  assert.deepEqual(deleted.anchor, original.anchor);
  assert(!reviewMarkdown(await store.read()).includes(original.body));
  await assert.rejects(
    store.update(original.id, { body: "editing a deleted item" }),
    { status: 409 },
  );
  const restored = await store.update(original.id, {
    status: deleted.previousStatus,
    baseUpdatedAt: deleted.updatedAt,
  });
  assert.equal(restored.status, "open");
  assert.equal(restored.deletedAt, undefined);
  assert.match(
    reviewMarkdown(await store.read()),
    /Тут нужно объяснить причину/,
  );
  const closed = await store.update(original.id, {
    status: "resolved",
    resolution: "Original resolution",
  });
  const trashed = await store.update(original.id, { status: "deleted" });
  assert.equal(trashed.previousStatus, "resolved");
  const recovered = await store.update(original.id, {
    status: trashed.previousStatus,
  });
  assert.equal(recovered.resolution, closed.resolution);
  assert.equal(recovered.resolvedAt, closed.resolvedAt);
});
