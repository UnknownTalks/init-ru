import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ReviewStore, ReviewError, reviewMarkdown } from "./review-store.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exec = promisify(execFile);
export const defaultReviewFile = (root) =>
  path.join(
    path.dirname(root),
    ".local-reviews",
    path.basename(root),
    "comments.json",
  );
async function revision(root) {
  try {
    return (
      await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: root })
    ).stdout.trim();
  } catch {
    return "uncommitted";
  }
}
function send(response, code, value, type = "application/json; charset=utf-8") {
  const body = type.startsWith("application/json")
    ? JSON.stringify(value)
    : value;
  response.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}
async function body(request) {
  if (!request.headers["content-type"]?.startsWith("application/json"))
    throw new ReviewError(415, "JSON required");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    bytes += chunk.length;
    if (bytes > 100000) throw new ReviewError(413, "Request too large");
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new ReviewError(400, "Invalid JSON");
  }
}
export async function createPreviewServer({
  root = defaultRoot,
  reviewFile = defaultReviewFile(root),
} = {}) {
  root = path.resolve(root);
  const publicRoot = path.join(root, "public");
  await stat(publicRoot);
  const { default: serve } = await import(
    pathToFileURL(
      path.join(root, ".cache/quartz/node_modules/serve-handler/src/index.js"),
    )
  );
  const store = new ReviewStore(reviewFile);
  await store.initialize();
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host || "";
      const url = new URL(request.url, "http://" + host);
      if (
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        Number(url.port || 80) !== server.address().port
      )
        throw new ReviewError(403, "Local preview only");
      if (request.headers.origin && request.headers.origin !== url.origin)
        throw new ReviewError(403, "Same-origin requests only");
      if (
        [
          "/__review/review.js",
          "/__review/review.css",
          "/__review/review-history.js",
          "/__review/review-history.css",
        ].includes(url.pathname)
      ) {
        const name = path.basename(url.pathname);
        send(
          response,
          200,
          await readFile(path.join(root, "site", name), "utf8"),
          name.endsWith("js")
            ? "text/javascript; charset=utf-8"
            : "text/css; charset=utf-8",
        );
        return;
      }
      if (
        url.pathname === "/__review/history" &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        send(
          response,
          200,
          `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>История правок · UnknownTalks</title><link rel="stylesheet" href="/__review/review-history.css"></head><body><main><a href="/init-ru/01-foundations/01-from-data-to-agents/chat.html">← К проекту</a><h1>История правок</h1><p>Выполненные и удалённые правки. Исходные фрагменты сохранены как история.</p><div class="controls"><select id="filter" aria-label="Что показать"><option value="resolved">Выполненные</option><option value="deleted">Удалённые</option></select><button id="refresh">Обновить</button></div><p id="status" role="status"></p><section id="items"></section></main><script src="/__review/review-history.js"></script></body></html>`,
          "text/html; charset=utf-8",
        );
        return;
      }
      if (url.pathname === "/__review/api" && request.method === "GET") {
        send(response, 200, {
          ...(await store.read()),
          file: store.file,
          sourceRevision: await revision(root),
        });
        return;
      }
      if (url.pathname === "/__review/export.md" && request.method === "GET") {
        send(
          response,
          200,
          reviewMarkdown(await store.read()),
          "text/markdown; charset=utf-8",
        );
        return;
      }
      if (
        url.pathname === "/__review/api/comments" &&
        request.method === "POST"
      ) {
        send(response, 201, await store.create(await body(request)));
        return;
      }
      const update = url.pathname.match(
        /^\/__review\/api\/comments\/(R\d{4,})$/,
      );
      if (update && request.method === "PATCH") {
        send(response, 200, await store.update(update[1], await body(request)));
        return;
      }
      if (url.pathname.startsWith("/__review/"))
        throw new ReviewError(404, "Not found");
      if (!["GET", "HEAD"].includes(request.method))
        throw new ReviewError(405, "Read-only preview");
      const relative = decodeURIComponent(
        url.pathname.replace(/^\/init-ru(?=\/|$)/, ""),
      ).replace(/^\/+/, "");
      const local = path.resolve(publicRoot, relative);
      if (local !== publicRoot && !local.startsWith(publicRoot + path.sep))
        throw new ReviewError(403, "Outside preview");
      if (relative.includes("\0")) throw new ReviewError(400, "Invalid path");
      for (const candidate of [
        local,
        local + ".html",
        path.join(local, "index.html"),
      ]) {
        if (
          !candidate.endsWith(".html") ||
          !candidate.startsWith(publicRoot + path.sep)
        )
          continue;
        try {
          if (!(await stat(candidate)).isFile()) continue;
          const html = await readFile(candidate, "utf8");
          const config = JSON.stringify({
            api: "/__review/api",
            sourceRevision: await revision(root),
            pageVersion: createHash("sha256")
              .update(html)
              .digest("hex")
              .slice(0, 16),
          }).replaceAll("<", "\\u003c");
          const injection = `<script id="ut-review-config" type="application/json">${config}</script><script src="/__review/review.js" defer></script>`;
          const output = /<\/body>/i.test(html)
            ? html.replace(/<\/body>/i, injection + "</body>")
            : html + injection;
          if (request.method === "HEAD") {
            response.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            });
            response.end();
          } else send(response, 200, output, "text/html; charset=utf-8");
          return;
        } catch (error) {
          if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
        }
      }
      request.url = "/" + relative + url.search;
      await serve(request, response, { public: publicRoot, cleanUrls: false });
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (!(error instanceof ReviewError))
        console.error("Local review error:", error.message);
      send(response, error.status || 500, {
        error: error.status
          ? error.message
          : "Не удалось сохранить или прочитать локальные замечания. Данные не сброшены.",
      });
    }
  });
  return { server, store };
}
export async function startPreview(options = {}) {
  const { server, store } = await createPreviewServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8080, "127.0.0.1", resolve);
  });
  console.log(
    `Local review: http://127.0.0.1:${server.address().port}/init-ru/01-foundations/01-from-data-to-agents/chat.html`,
  );
  console.log(`Private comments: ${store.file}`);
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    option = (name) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (args.includes("--review-summary")) {
    const store = new ReviewStore(
      option("--review-file") || defaultReviewFile(defaultRoot),
    );
    process.stdout.write(reviewMarkdown(await store.read()));
  } else
    await startPreview({
      port: Number(option("--port") || 8080),
      reviewFile: option("--review-file") || defaultReviewFile(defaultRoot),
    });
}
