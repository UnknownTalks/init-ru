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
  chapters = new Map(story.chapters.map((chapter) => [chapter.id, chapter])),
  extras = new Map(story.extras.map((extra) => [extra.id, extra])),
  topics = new Set([...chapters.keys(), ...extras.keys()]),
  terms = new Map(glossary.terms.map((term) => [term.id, term]));
const require = (ok, message) => {
  if (!ok) errors.push(message);
};
require(story.schemaVersion === 3, "Wrong story version");
require(chapters.size === story.chapters.length, "Duplicate chapter IDs");
require(extras.size === story.extras.length, "Duplicate optional IDs");
require(topics.size === chapters.size + extras.size, "Duplicate topic IDs");
require(terms.size === glossary.terms.length, "Duplicate glossary IDs");
require(JSON.stringify(story.basics) ===
  JSON.stringify([...chapters.keys()]), "Main order differs");
require(JSON.stringify(story.groups.flatMap((group) => group.chapters)) ===
  JSON.stringify(story.basics), "Skill map differs from main line");
for (const chapter of story.chapters) {
  const team = chapter.messages.find((m) => m.speaker === "team");
  require(chapter.title &&
    chapter.messages.some((m) => m.speaker === "sasha") &&
    team, "Missing narrator " + chapter.id);
  require(chapter.messages.every(
    (m) =>
      ["sasha", "team"].includes(m.speaker) &&
      m.paragraphs.length &&
      m.paragraphs.every((p) => typeof p === "string" && p.length > 20),
  ), "Missing prose " + chapter.id);
  require(chapter.decision.afterTeamParagraph > 0 &&
    chapter.decision.afterTeamParagraph <
      team.paragraphs.length, "Invalid narrative pause " + chapter.id);
  require(chapter.decision.prompt &&
    chapter.decision.options.length >= 2 &&
    chapter.decision.options.every(
      (o) => o.label && o.reply.length > 80,
    ), "Incomplete choice branch " + chapter.id);
  const prose = chapter.messages.flatMap((m) => m.paragraphs).join(" ");
  require(!/\d|Python|dict\.|\bID\b/.test(
    prose,
  ), "Numeric or programming prerequisite " + chapter.id);
  require(prose.split(/\s+/).length > 110, "Narrative too short " + chapter.id);
  require(chapter.terms.every((id) => terms.has(id)), "Unknown term " +
    chapter.id);
  require(chapter.sources.length, "Missing sources " + chapter.id);
}
for (const extra of story.extras) {
  require(extra.title.startsWith("+ ") &&
    chapters.has(extra.parent), "Invalid optional parent " + extra.id);
  require(extra.paragraphs.length &&
    extra.sources.length &&
    extra.terms.every((id) => terms.has(id)), "Incomplete optional text " +
    extra.id);
}
for (const term of glossary.terms) {
  require(term.definition &&
    term.example &&
    term.source &&
    topics.has(term.topic), "Incomplete glossary " + term.id);
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
for (const chapter of story.chapters) {
  const values = [
    ...chapter.messages.flatMap((m) => m.paragraphs),
    chapter.decision.prompt,
    ...chapter.decision.options.flatMap((o) => [o.label, o.reply]),
    ...chapter.sources.map((s) => s.url),
  ];
  require(values.every((value) =>
    markdown.includes(value),
  ), "Incomplete agent chapter " + chapter.id);
}
for (const extra of story.extras)
  require(extra.paragraphs.every((p) =>
    markdown.includes(p),
  ), "Incomplete agent extra " + extra.id);
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
    `Checked prose narrative, interactive pauses, skill map, optional branches, glossary, complete agent exports, ${mdCount} Markdown files and ${htmlCount} HTML pages.`,
  );
