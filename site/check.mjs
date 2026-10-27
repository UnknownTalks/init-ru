import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const origin = "https://unknowntalks.github.io";
const prefix = "/init-ru/";
const errors = [];
let markdownCount = 0,
  htmlCount = 0,
  canvasCount = 0;
async function walk(directory, visit) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      ["site", "node_modules", "public"].includes(entry.name)
    )
      continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename, visit);
    else if (entry.isFile()) await visit(filename);
  }
}
await walk(root, async (filename) => {
  if (filename.endsWith(".md")) {
    markdownCount++;
    const text = await readFile(filename, "utf8");
    for (const [, target] of text.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
      const relative = decodeURIComponent(target.split(/[?#]/)[0]);
      if (!existsSync(path.resolve(path.dirname(filename), relative)))
        errors.push(`Markdown: ${path.relative(root, filename)} → ${target}`);
    }
  } else if (filename.endsWith(".canvas")) {
    canvasCount++;
    const canvas = JSON.parse(await readFile(filename, "utf8"));
    const ids = new Set();
    for (const node of canvas.nodes) {
      if (ids.has(node.id)) errors.push(`Duplicate canvas node: ${node.id}`);
      ids.add(node.id);
      if (node.type === "file" && !existsSync(path.join(root, node.file)))
        errors.push(`Canvas file: ${node.file}`);
    }
    for (const edge of canvas.edges)
      if (!ids.has(edge.fromNode) || !ids.has(edge.toNode))
        errors.push(`Canvas edge: ${edge.id}`);
  }
});
if (!existsSync(path.join(publicDir, "index.html")))
  throw new Error("Build the site first: node site/build.mjs");
await walk(publicDir, async (filename) => {
  if (!filename.endsWith(".html")) return;
  htmlCount++;
  const html = await readFile(filename, "utf8");
  const base = new URL(
    prefix + path.relative(publicDir, filename).split(path.sep).join("/"),
    origin,
  );
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:#|data:|mailto:|javascript:)/i.test(target)) continue;
    const url = new URL(target.replaceAll("&amp;", "&"), base);
    if (url.origin !== origin) continue;
    if (url.pathname === prefix.slice(0, -1)) url.pathname = prefix;
    if (!url.pathname.startsWith(prefix)) {
      errors.push(`Outside site path: ${url.pathname}`);
      continue;
    }
    const local = path.join(
      publicDir,
      decodeURIComponent(url.pathname.slice(prefix.length)),
    );
    if (
      ![local, local + ".html", path.join(local, "index.html")].some(existsSync)
    )
      errors.push(`HTML: ${path.relative(publicDir, filename)} → ${target}`);
  }
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${markdownCount} Markdown files, ${canvasCount} canvas and ${htmlCount} HTML pages: internal links and resources resolve.`,
  );
