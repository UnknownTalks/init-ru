import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { validResponse, solutionValue } from "./exercise.mjs";
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
  chapters = new Map(story.chapters.map((c) => [c.id, c])),
  characters = new Map(story.characters.map((c) => [c.id, c])),
  terms = new Map(glossary.terms.map((t) => [t.id, t]));
const require = (ok, message) => {
  if (!ok) errors.push(message);
};
const events = new Map(),
  threads = new Map(),
  questions = new Map();
for (const c of story.chapters) {
  for (const e of [...c.intro, ...c.outro]) {
    require(!events.has(e.id), "Duplicate event " + e.id);
    events.set(e.id, { event: e, chapter: c });
    for (const attachment of e.attachments || []) {
      require(!events.has(attachment.id), "Duplicate attachment " + attachment.id);
      require(attachment.type === "visual", "Unsupported attachment " + attachment.id);
      events.set(attachment.id, { event: attachment, chapter: c });
    }
  }
  for (const t of c.threads) {
    require(!threads.has(t.id), "Duplicate thread " + t.id);
    threads.set(t.id, t);
    for (const e of t.messages) {
      require(!events.has(e.id), "Duplicate event " + e.id);
      events.set(e.id, { event: e, chapter: c, thread: t });
    }
  }
  for (const q of c.checks) {
    require(!questions.has(q.id), "Duplicate check " + q.id);
    questions.set(q.id, q);
  }
}
require(story.schemaVersion === 6, "Expected story schema v6");
require(chapters.size === story.chapters.length, "Duplicate chapter IDs");
require(JSON.stringify(story.basics) ===
  JSON.stringify([...chapters.keys()]), "Main order differs");
require(Array.isArray(story.chapterGroups) && story.chapterGroups.length > 0 &&
  new Set(story.chapterGroups.map((g) => g.id)).size === story.chapterGroups.length &&
  story.chapterGroups.every((g) => g.id && g.title && g.chapters.length) &&
  JSON.stringify(story.chapterGroups.flatMap((g) => g.chapters)) === JSON.stringify(story.basics),
  "Chapter groups must cover the main path once, in order");
for (const group of story.chapterGroups)
  require(group.chapters.every((id, index) => !!chapters.get(id).decision === (index === group.chapters.length - 1)),
    "Continuation must occur once at each chapter boundary: " + group.id);
for (const c of story.chapters) {
  require(c.title &&
    c.elapsed &&
    c.intro.length &&
    Array.isArray(c.outro) &&
    Array.isArray(c.sources) &&
    (c.sources.length || !c.terms.length), "Incomplete chapter " + c.id);
  require(c.number === `${story.chapters.indexOf(c) + 1}` &&
    Number.isInteger(c.day) && c.day > 0 &&
    (!story.chapters.indexOf(c) || c.day >= story.chapters[story.chapters.indexOf(c) - 1].day),
    "Invalid section number/day " + c.id);
  require(!c.decision || (c.decision.options.length >= 2 &&
    c.decision.options.every(
      (o) => o.label && o.reply,
    )), "Missing shared-path choices " + c.id);
  require(c.terms.every((id) => terms.has(id)), "Unknown chapter term " + c.id);
  for (const part of ["problem", "attempts", "resolution"])
    require(c.arc[part]?.length &&
      c.arc[part].every(
        (id) => events.get(id)?.chapter.id === c.id && !events.get(id)?.thread,
      ), "Missing core causal arc " + part + " " + c.id);
  for (const q of c.checks) {
    require(q.question &&
      q.options.length >= 2 &&
      Number.isInteger(q.correct) &&
      q.options[q.correct] &&
      q.explanation, "Incomplete assessment " + q.id);
    require(q.references.length >= 2 &&
      q.references.every((id) =>
        events.has(id),
      ), "Broken forwarded reference " + q.id);
    require(q.terms.every((id) => terms.has(id)), "Unknown check term " + q.id);
  }
}
for (const [id, { event: e }] of events) {
  require(["message", "narration", "visual"].includes(
    e.type,
  ), "Unknown event type " + id);
  if (e.type === "message")
    require(characters.has(e.speaker) &&
      e.paragraphs.length &&
      e.time &&
      e.paragraphs.every((p) => p.length > 10), "Invalid speaker/prose/time " +
      id);
  if (e.type === "visual")
    require(e.items.length && e.title && e.caption, "Unlabelled visual " + id);
  if (e.kind === "table")
    require(e.columns?.length === 3 && e.items.every((item) => item.label && item.text && item.result), "Incomplete comparison table " + id);
}
const tokenVisual = events.get("tokens-pieces")?.event;
require(tokenVisual?.kind === "token-table" && tokenVisual.items.every((item) => /^ID \d+$/.test(item.text)),
  "Token table must contain pieces and numeric IDs");
require(tokenVisual?.items.map((item) => item.label.replaceAll("␠", " ")).join("") ===
  "Проверьте микрофон.", "Token pieces do not reconstruct text");
for (const t of glossary.terms)
  require(t.definition &&
    t.example &&
    t.source &&
    (chapters.has(t.topic) || threads.has(t.topic)), "Missing definition/topic " + t.id);
const outcomes = new Map(story.outcomes.map((o) => [o.id, o]));
require(outcomes.size > 0 && outcomes.size === story.outcomes.length, "Expected unique outcomes");
for (const outcome of outcomes.values())
  require(outcome.claim && outcome.evidenceMessages.length && outcome.evidenceMessages.every((id) =>
    events.has(id) && !events.get(id).thread), "Outcome needs main-route evidence: " + outcome.id);
const formIds = new Set();
for (const form of story.assessment.forms) {
  require(!formIds.has(form.id), "Duplicate form " + form.id); formIds.add(form.id);
  require(["practice", "independent"].includes(form.purpose), "Unknown form purpose " + form.id);
  for (const outcome of outcomes.keys()) {
    const relevant = form.questions.filter((q) => q.outcome === outcome);
    require(relevant.length === 2 && ["cause", "transfer"].every((kind) => relevant.some((q) => q.kind === kind)),
      "Missing cause/transfer pair " + form.id + " / " + outcome);
  }
  for (const q of form.questions) {
    require(!questions.has(q.id), "Duplicate check " + q.id); questions.set(q.id, q);
    require(outcomes.has(q.outcome) && (q.exercise ? validResponse(q.exercise, Object.fromEntries(q.exercise.fields.map(f => [f.id, solutionValue(f)]))) : q.options.length === 4 && new Set(q.options).size === 4 && Number.isInteger(q.correct) && q.options[q.correct]) && q.question && q.explanation,
      "Invalid final check " + q.id);
    require(q.references.length >= 2 && q.references.every((id) => events.has(id) && !events.get(id).thread),
      "Final check requires missing/optional explanation " + q.id);
  }
}
function checkTree(node) {
  if (node.children) {
    require(node.children.length > 1, "Not a branching skill tree " + node.id);
    for (const c of node.children) checkTree(c);
  } else
    require(outcomes.has(node.outcome) && node.id === node.outcome &&
      node.chapters.every((id) => chapters.has(id)), "Broken outcome leaf " + node.id);
}
checkTree(story.skillTree);
// Check the authored schedule independently of playback speed and open branches.
let previousTime = -1;
for (const c of story.chapters) {
  const schedule = c.decision ? [
    ...c.intro.filter((e) => e.type === "message"),
    { id: c.id + "--sent", time: c.sentTime },
    { id: c.id + "--reply", time: c.replyTime },
    ...c.outro.filter((e) => e.type === "message"),
  ] : [...c.intro, ...c.outro].filter((e) => e.type === "message");
  for (const e of schedule) {
    require(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.time), "Invalid message time " + e.id);
    const [hours, minutes] = e.time.split(":").map(Number);
    const current = c.day * 1440 + hours * 60 + minutes;
    require(current >= previousTime, "Message chronology goes backwards at " + e.id);
    previousTime = current;
  }
  for (const thread of c.threads) {
    let last = "00:00";
    for (const e of thread.messages.filter((e) => e.type === "message")) {
      require(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.time) && e.time >= last,
        "Invalid internal chronology " + e.id);
      last = e.time;
    }
  }
}
const exported = JSON.parse(
  await readFile(path.join(out, lesson, "story.json"), "utf8"),
);
require(JSON.stringify(exported) ===
  JSON.stringify(story), "JSON export differs");
const markdown = await readFile(path.join(out, lesson, "agent.md"), "utf8");
const exportedText = (text) => text.replaceAll("{{name}}, ", "").replaceAll("{{name}}", "вы");
require(!markdown.includes("{{name}}"), "Unresolved participant name in text export");
require(markdown ===
  (await readFile(
    path.join(out, "llms-full.txt"),
    "utf8",
  )), "Text exports differ");
for (const [id, { event: e }] of events)
  require((e.paragraphs || [e.text || e.title, e.caption || ""]).every((p) =>
    markdown.includes(exportedText(p)),
  ), "Incomplete exported event " + id);
for (const [id, { event: e }] of events)
  if (e.kind === "table")
    require([...e.columns, ...e.items.flatMap((item) => [item.label, item.text, item.result])].every((value) => markdown.includes(value)), "Incomplete exported table " + id);
for (const q of questions.values())
  require([q.question, q.explanation, ...(q.options || []), ...(q.exercise ? [q.exercise.prompt, ...q.exercise.fields.map(f => f.label)] : []), ...q.references].every(
    (v) => markdown.includes(v),
  ), "Incomplete exported check " + q.id);
for (const c of chapters.values())
  require([
    // The current route uses Continue and the first authored exchange. Other
    // variants remain in JSON for old reading anchors and local review bindings.
    ...(c.decision?.options.slice(0, 1) || []).flatMap((o) => [o.label, o.reply]),
    ...c.sources.map((s) => s.url),
  ].every((v) => markdown.includes(v)), "Incomplete exported choice/source " +
    c.id);
for (const t of threads.values())
  require((t.sources || []).every((source) => markdown.includes(source.url)),
    "Incomplete exported thread source " + t.id);
let mdCount = 0,
  htmlCount = 0;
async function walk(dir, visit, sourceOnly = true) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (sourceOnly && (
      entry.name.startsWith(".") ||
      ["site", "node_modules", "public"].includes(entry.name)
    ))
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, visit, sourceOnly);
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
    const source = path.resolve(path.dirname(file), decodeURIComponent(target.split(/[?#]/)[0]));
    const generated = path.join(out, path.relative(root, source));
    const knownGenerated = path.dirname(source) === path.join(root, lesson) && ['chat.html', 'agent.html', 'materials.html'].includes(path.basename(source));
    require(knownGenerated && existsSync(generated) || existsSync(
      path.resolve(
        path.dirname(file),
        decodeURIComponent(target.split(/[?#]/)[0]),
      ),
    ), "Markdown link " + path.relative(root, file) + " → " + target);
  }
});
await walk(out, async (file) => {
  require(!/(?:^|\/)(?:AGENTS\.md|SKILL\.md|LEARNING_FORMULA\.md|AUTHORING_PLAYBOOK\.md|RESEARCH_FOUNDATIONS\.md|QUALITY_GATES\.md|comments\.json|agent-review\.json|review(?:-history)?\.(?:js|css))$/i.test(file) &&
    !path.relative(out, file).split(path.sep).some((part) => ["authoring", ".local-reviews", "__agent_review"].includes(part)),
    "Private authoring/review file in output: " + path.relative(out, file));
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
}, false); // Inspect every generated directory, including hidden private data.
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked schema v6, causal arcs, cast, internal threads, ${outcomes.size} outcomes, practice/independent pairs, forwarded sources, token table, agent exports, privacy, ${mdCount} Markdown files and ${htmlCount} HTML pages.`,
  );
