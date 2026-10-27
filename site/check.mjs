import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = path.join(root, "public"),
  lesson = "01-foundations/01-from-data-to-agents",
  origin = "https://unknowntalks.github.io",
  prefix = "/init-ru/";
const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  ),
  glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
const errors = [],
  scenes = new Map(story.scenes.map((scene) => [scene.id, scene])),
  terms = new Map(glossary.terms.map((term) => [term.id, term]));
const require = (ok, message) => {
  if (!ok) errors.push(message);
};
require(story.schemaVersion === 2, "Wrong story version");
require(scenes.size === story.scenes.length, "Duplicate scene IDs");
require(terms.size === glossary.terms.length, "Duplicate glossary IDs");
require(new Set(story.basics).size ===
  story.basics.length, "Duplicate main scenes");
for (const id of story.basics) {
  const scene = scenes.get(id);
  require(scene && !scene.optional && !scene.parent, "Invalid main scene " +
    id);
}
for (const scene of story.scenes) {
  require(scene.scene &&
    scene.problem &&
    scene.solution &&
    scene.takeaway &&
    scene.nextQuestion, "Missing narrative " + scene.id);
  require(scene.attempt?.text &&
    scene.attempt?.outcome &&
    scene.approaches?.length &&
    scene.example?.before &&
    scene.example?.after &&
    scene.example?.why, "Missing worked example " + scene.id);
  require(scene.visual?.kind &&
    scene.sources?.length, "Missing visual or references " + scene.id);
  require(scene.terms.every((id) => terms.has(id)), "Unknown term " + scene.id);
  if (scene.optional) {
    require(scene.title.startsWith("+ "), "Optional title lacks + " + scene.id);
    require(scenes.has(scene.parent), "Missing optional parent " + scene.id);
    const seen = new Set([scene.id]);
    let parent = scene.parent;
    while (parent) {
      if (seen.has(parent)) {
        errors.push("Parent cycle " + scene.id);
        break;
      }
      seen.add(parent);
      parent = scenes.get(parent)?.parent;
    }
  } else {
    require(story.basics.includes(scene.id), "Main scene not ordered " +
      scene.id);
    require(scene.check?.choices?.some((choice) => choice.correct) &&
      scene.check.choices.some(
        (choice) => !choice.correct,
      ), "Missing understanding check " + scene.id);
    const prose = [
      scene.title,
      scene.scene,
      scene.problem,
      scene.solution,
      scene.example.before,
      scene.example.after,
      scene.takeaway,
    ].join(" ");
    require(!/\d|Python|dict\.|\bID\b/.test(
      prose,
    ), "Main line contains numeric or programming prerequisite " + scene.id);
  }
  if (scene.visual.parts)
    require(scene.visual.parts.join("") ===
      scene.visual.text, "Token pieces do not reassemble " + scene.id);
}
for (const term of glossary.terms) {
  require(term.definition &&
    term.example &&
    term.source &&
    scenes.has(term.topic), "Incomplete glossary " + term.id);
  require(![
    "id",
    "list",
    "queue",
    "dictionary",
    "sorting",
    "function",
  ].includes(term.id), "Unrelated programming term " + term.id);
}
const exported = JSON.parse(
  await readFile(path.join(out, lesson, "story.json"), "utf8"),
);
require(JSON.stringify(exported) ===
  JSON.stringify(story), "JSON export differs");
const markdown = await readFile(path.join(out, lesson, "agent.md"), "utf8");
require(markdown ===
  (await readFile(
    path.join(out, "llms-full.txt"),
    "utf8",
  )), "Plain-text exports differ");
for (const scene of story.scenes) {
  const values = [
    scene.scene,
    scene.problem,
    scene.solution,
    scene.takeaway,
    scene.attempt.text,
    scene.attempt.outcome,
    ...scene.approaches.flatMap((item) => [item.title, item.text]),
    ...Object.values(scene.example),
    ...scene.sources.map((item) => item.url),
  ];
  require(values.every((value) =>
    markdown.includes(value),
  ), "Incomplete agent scene " + scene.id);
}
let mdCount = 0,
  htmlCount = 0;
async function walk(dir, visit) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      ["site", "node_modules", "public"].includes(entry.name)
    )
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, visit);
    else await visit(file);
  }
}
await walk(root, async (file) => {
  if (!file.endsWith(".md")) return;
  mdCount++;
  for (const [, target] of (await readFile(file, "utf8")).matchAll(
    /\]\(([^\s)]+)\)/g,
  )) {
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) continue;
    require(existsSync(
      path.resolve(
        path.dirname(file),
        decodeURIComponent(target.split(/[?#]/)[0]),
      ),
    ), "Markdown link " + path.relative(root, file) + " → " + target);
  }
});
await walk(out, async (file) => {
  if (!file.endsWith(".html")) return;
  htmlCount++;
  const base = new URL(
    prefix + path.relative(out, file).split(path.sep).join("/"),
    origin,
  );
  for (const [, target] of (await readFile(file, "utf8")).matchAll(
    /(?:href|src)="([^"]+)"/g,
  )) {
    if (/^(?:#|data:|mailto:|javascript:)/i.test(target)) continue;
    const url = new URL(target.replaceAll("&amp;", "&"), base);
    if (url.origin !== origin) continue;
    if (url.pathname === prefix.slice(0, -1)) url.pathname = prefix;
    require(url.pathname.startsWith(prefix), "Outside site " + url.pathname);
    const local = path.join(
      out,
      decodeURIComponent(url.pathname.slice(prefix.length)),
    );
    require([local, local + ".html", path.join(local, "index.html")].some(
      existsSync,
    ), "HTML link " + path.relative(out, file) + " → " + target);
  }
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked linear story, optional branches, token assembly, non-code main line, glossary, complete agent exports, ${mdCount} Markdown files and ${htmlCount} HTML pages.`,
  );
