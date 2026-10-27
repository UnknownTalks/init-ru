import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the Obsidian vault at the repository root. Quartz and its generated
// content live in an ignored cache; no copies of lesson sources are maintained.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".cache", "quartz");
const revision = (
  await readFile(path.join(root, "site/quartz-revision.txt"), "utf8")
).trim();
if (!/^[a-f0-9]{40}$/.test(revision))
  throw new Error("Invalid Quartz revision");
const run = (command, args, cwd = cache) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });
await mkdir(path.dirname(cache), { recursive: true });
if (!existsSync(path.join(cache, ".git"))) {
  run(
    "git",
    [
      "clone",
      "--no-checkout",
      "https://github.com/jackyzha0/quartz.git",
      cache,
    ],
    root,
  );
}
const current = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: cache,
  encoding: "utf8",
}).trim();
if (current !== revision) {
  run("git", ["fetch", "--depth", "1", "origin", revision]);
  run("git", ["checkout", "--detach", revision]);
} else if (!existsSync(path.join(cache, "package.json"))) {
  run("git", ["checkout", "--detach", revision]);
}
const installed = path.join(cache, ".installed-revision");
if (
  !existsSync(installed) ||
  (await readFile(installed, "utf8")).trim() !== revision ||
  !existsSync(path.join(cache, "node_modules/.bin/esbuild"))
) {
  run("npm", ["ci", "--no-audit", "--no-fund"]);
  await writeFile(installed, revision + "\n");
}
await cp(
  path.join(root, "site/quartz.config.yaml"),
  path.join(cache, "quartz.config.yaml"),
);
await cp(
  path.join(root, "site/custom.scss"),
  path.join(cache, "quartz/styles/custom.scss"),
);
const content = path.join(cache, "content");
const { slug: headingSlug } = await import(
  path.join(cache, "node_modules/github-slugger/index.js")
);
await rm(content, { recursive: true, force: true });
await mkdir(content, { recursive: true });
const allowed = new Set([
  ".md",
  ".canvas",
  ".html",
  ".js",
  ".json",
  ".txt",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".mp3",
  ".mp4",
]);
const toWebPath = (name) => name.replace(/(^|\/)README\.md$/g, "$1index.md");
async function stage(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      entry.name === "site" ||
      entry.name === "node_modules" ||
      entry.name === "public"
    )
      continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, toWebPath(entry.name));
    if (entry.isDirectory()) {
      await stage(from, to);
      continue;
    }
    if (!entry.isFile() || !allowed.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith(".md")) {
      // README remains the GitHub/Obsidian entry. Only build output uses index.
      const markdown = (await readFile(from, "utf8")).replace(
        /\]\(([^\s)]*)README\.md([#?][^)]*)?\)/g,
        "]($1index.md$2)",
      );
      await writeFile(to, markdown);
    } else if (entry.name.endsWith(".canvas")) {
      const canvas = JSON.parse(await readFile(from, "utf8"));
      for (const node of canvas.nodes ?? []) {
        if (node.type === "file") {
          node.file = toWebPath(node.file);
          if (node.subpath?.startsWith("#") && !node.subpath.startsWith("#^"))
            node.subpath = "#" + headingSlug(node.subpath.slice(1));
        }
        if (node.type === "text") {
          const folder = path
            .relative(root, path.dirname(from))
            .split(path.sep)
            .join("/");
          node.text = node.text.replace(
            /\]\(([^)]+\.md)\)/g,
            (match, target) => {
              if (!existsSync(path.join(root, target))) return match;
              return (
                "](" +
                path.posix
                  .relative(folder, toWebPath(target))
                  .replace(/\.md$/, ".html") +
                ")"
              );
            },
          );
        }
      }
      await writeFile(to, JSON.stringify(canvas));
    } else {
      await cp(from, to);
    }
  }
}
await stage(root, content);
const args = [
  "quartz/bootstrap-cli.mjs",
  "build",
  "--concurrency",
  "2",
  "--output",
  path.join(root, "public"),
];
run(process.execPath, args);
// Quartz slugifies asset names (including .html and uppercase filenames).
// Preserve standalone demonstrations verbatim so their relative assets also
// work from file:// in Obsidian and from GitHub Pages.
async function copyDemos(source, relative = "") {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      ["site", "node_modules", "public"].includes(entry.name)
    )
      continue;
    const next = path.join(source, entry.name);
    const nextRelative = path.join(relative, entry.name);
    if (entry.name === "demos") {
      await cp(next, path.join(root, "public", nextRelative), {
        recursive: true,
      });
    } else {
      await copyDemos(next, nextRelative);
    }
  }
}
await copyDemos(root);
async function finishLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "demos") await finishLinks(filename);
      continue;
    }
    if (!entry.name.endsWith(".html")) continue;
    const html = await readFile(filename, "utf8");
    const fixed = html
      .replace(
        /href="([^"#?]*\/demos\/[^"#?.]+)([#?][^"]*)?"/g,
        'href="$1.html$2" data-router-ignore',
      )
      .replace(/href="([^"#?]*\.canvas)([#?][^"]*)?"/g, 'href="$1.html$2"');
    if (html !== fixed) await writeFile(filename, fixed);
  }
}
await finishLinks(path.join(root, "public"));
await cp(path.join(cache, "LICENSE.txt"), path.join(root, "public/static/quartz-license.txt"));
if (process.argv.includes("--serve")) {
  const { createServer } = await import("node:http");
  const { default: serve } = await import(
    path.join(cache, "node_modules/serve-handler/src/index.js")
  );
  createServer((request, response) => {
    if (request.url === "/init-ru" || request.url.startsWith("/init-ru/"))
      request.url = request.url.slice("/init-ru".length) || "/";
    return serve(request, response, {
      public: path.join(root, "public"),
      cleanUrls: !request.url.split("?")[0].includes("/demos/"),
    });
  }).listen(8080, "127.0.0.1", () =>
    console.log("Preview: http://127.0.0.1:8080/init-ru/"),
  );
}
