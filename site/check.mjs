import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const origin = "https://unknowntalks.github.io";
const prefix = "/init-ru/";
const errors = [];
const glossary = JSON.parse(
  await readFile(path.join(root, "glossary.json"), "utf8"),
);
const termIds = new Set(glossary.terms.map((term) => term.id));
if (termIds.size !== glossary.terms.length)
  errors.push("Glossary: duplicate term IDs");
let markdownCount = 0,
  htmlCount = 0;
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
  } else if (path.basename(filename) === "story.json") {
    const story = JSON.parse(await readFile(filename, "utf8"));
    const scenes = new Map(story.scenes.map((scene) => [scene.id, scene]));
    const chapters = new Set(story.chapters.map((chapter) => chapter.id));
    const basics = new Set(story.basics);
    if (scenes.size !== story.scenes.length)
      errors.push("Story: duplicate scene IDs");
    if (basics.size !== story.basics.length || !basics.size)
      errors.push("Story: basic route must contain unique scene IDs");
    if (
      story.basics.length !== story.chapters.length ||
      story.basics.some(
        (id, index) => scenes.get(id)?.chapter !== story.chapters[index]?.id,
      )
    )
      errors.push("Story: basic route must follow the stages in order");
    for (const scene of story.scenes) {
      if (!chapters.has(scene.chapter))
        errors.push(`Story: unknown stage for ${scene.id}`);
      if (
        !scene.walkthrough?.length ||
        !scene.example?.steps?.length ||
        !scene.explanation ||
        !scene.bridge ||
        !scene.fact?.text ||
        !scene.fact?.kind ||
        !scene.sources?.length
      )
        errors.push(`Story: incomplete explanation or sources for ${scene.id}`);
      for (const target of scene.links || [])
        if (!scenes.has(target))
          errors.push(`Story: unknown related topic ${scene.id} → ${target}`);
      if (!scene.problem || !scene.factExplanation)
        errors.push(`Story: missing tab content for ${scene.id}`);
      if (!scene.terms?.length || scene.terms.some((id) => !termIds.has(id)))
        errors.push(`Story: missing or unknown terms for ${scene.id}`);
      if (basics.has(scene.id)) {
        if (scene.parent || scene.level !== 1)
          errors.push(`Story: invalid root ${scene.id}`);
      } else {
        const parent = scenes.get(scene.parent);
        if (
          !parent ||
          parent.chapter !== scene.chapter ||
          scene.level !== parent.level + 1
        )
          errors.push(`Story: invalid parent for ${scene.id}`);
      }
    }
    for (const term of glossary.terms)
      if (!term.definition || !term.example || !scenes.has(term.topic))
        errors.push(`Glossary: incomplete entry ${term.id}`);
    const relative = path.relative(root, path.dirname(filename));
    const exported = JSON.parse(
      await readFile(path.join(publicDir, relative, "story.json"), "utf8"),
    );
    if (JSON.stringify(exported) !== JSON.stringify(story))
      errors.push("Agent view: JSON differs from the lesson source");
    const markdown = await readFile(
      path.join(publicDir, relative, "agent.md"),
      "utf8",
    );
    const full = await readFile(path.join(publicDir, "llms-full.txt"), "utf8");
    if (full !== markdown) errors.push("Agent view: full-text formats differ");
    for (const scene of story.scenes) {
      const content = [
        ...scene.walkthrough,
        scene.problem,
        scene.explanation,
        scene.fact.text,
        scene.factExplanation,
        ...scene.example.steps.map((step) => step.text),
        ...scene.sources.map((source) => source.url),
      ];
      if (content.some((text) => !markdown.includes(text)))
        errors.push(`Agent view: incomplete topic ${scene.id}`);
    }
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
    `Checked ${markdownCount} Markdown files, ${htmlCount} HTML pages: internal links and resources resolve.`,
  );
