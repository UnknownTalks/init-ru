import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createStaticServer({ root = defaultRoot } = {}) {
  root = path.resolve(root);
  const publicRoot = path.join(root, "public");
  await stat(publicRoot);
  const { default: serve } = await import(pathToFileURL(
    path.join(root, ".cache/quartz/node_modules/serve-handler/src/index.js"),
  ));
  const server = createServer(async (request, response) => {
    const fail = (status, message) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? "" : message);
    };
    try {
      const url = new URL(request.url, "http://" + (request.headers.host || ""));
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
          Number(url.port || 80) !== server.address().port ||
          (request.headers.origin && request.headers.origin !== url.origin)) {
        fail(403, "Local preview only");return;
      }
      if (!["GET", "HEAD"].includes(request.method)) { fail(405, "Read-only preview");return; }
      const relative = decodeURIComponent(url.pathname.replace(/^\/init-ru(?=\/|$)/, "")).replace(/^\/+/, "");
      const local = path.resolve(publicRoot, relative);
      if (relative.includes("\0") || relative.split(/[\\/]/).some(part => part.startsWith(".")) ||
          (local !== publicRoot && !local.startsWith(publicRoot + path.sep))) {
        fail(403, "Outside preview");return;
      }
      // serve-handler with cleanUrls:false does not resolve directory indexes.
      // Match GitHub Pages' real directory URLs without an SPA fallback.
      let served = relative;
      const info = await stat(local).catch(error => {
        if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
        return null;
      });
      if (info?.isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          response.writeHead(308, { Location: url.pathname + "/" + url.search });
          response.end(); return;
        }
        served = path.posix.join(relative, "index.html");
      }
      request.url = "/" + served + url.search;
      await serve(request, response, { public: publicRoot, cleanUrls: false, directoryListing: false });
    } catch (error) {
      if (response.headersSent) { response.end();return; }
      fail(error instanceof URIError || error instanceof TypeError ? 400 : 500, "Unable to serve page");
    }
  });
  return server;
}

export async function startPreview(options = {}) {
  const server = await createStaticServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8080, "127.0.0.1", resolve);
  });
  console.log(`Local pages: http://127.0.0.1:${server.address().port}/init-ru/01-foundations/01-from-data-to-agents/chat.html`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), index = args.indexOf("--port");
  await startPreview({ port: index >= 0 ? Number(args[index + 1]) : 8080 });
}
