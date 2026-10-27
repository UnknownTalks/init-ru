import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { storyLayout } from "./story-navigation.mjs";

export async function renderStoryMap(root) {
  const lesson = "01-foundations/01-from-data-to-agents";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const layout = storyLayout(story);
  const revision = createHash("sha256")
    .update(await readFile(path.join(root, "site/map.js")))
    .update(await readFile(path.join(root, "site/map.css")))
    .digest("hex")
    .slice(0, 12);
  const glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
  const model = {
    title: story.title,
    chapters: story.chapters,
    basics: story.basics,
    glossary: glossary.terms,
    ...layout,
  };
  const json = JSON.stringify(model).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080a10"><title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/story-map.css?v=${revision}"></head>
<body>
<header class="topbar"><a class="brand" href="./">UNKNOWN<span>TALKS</span><small>/ init-ru</small></a><nav id="chapters" aria-label="Этапы от данных до агентов"></nav><a class="glossary-link" href="../../glossary.html" target="_blank">Словарь</a><a class="agent-link" href="agent.html">Для агента</a><button id="overview" aria-label="Показать всю карту">Вся карта <kbd>O</kbd></button><button id="fullscreen" aria-label="Полный экран">↗</button></header>
<div class="location-bar"><button id="history-back" disabled>← Назад по переходам</button><nav id="breadcrumbs" aria-label="Вы находитесь здесь"></nav></div>
<main id="stage" aria-label="Интерактивная карта" tabindex="0"><div id="world"><svg id="connections" aria-hidden="true"></svg><div id="scenes"></div></div><div class="zoom"><button id="zoom-in" aria-label="Приблизить">+</button><button id="zoom-out" aria-label="Отдалить">−</button></div></main>
<footer class="transport"><div class="current"><div id="chapter-label"></div><div id="scene-title" aria-live="polite"></div></div><button id="route-start">К выбору тем</button></footer>
<aside id="position-panel"><strong>Вы на карте</strong><svg id="minimap" aria-label="Схема тем и текущая позиция"></svg><span id="position-caption"></span></aside>
<span id="study-storage-status" role="status"></span>
<div id="travel-status" role="status" hidden></div>
<dialog id="term-dialog"><button id="term-close" aria-label="Закрыть определение">×</button><h2 id="term-title"></h2><p id="term-definition"></p><p id="term-example"></p><div id="term-actions"></div></dialog>
<div id="hint">Выбирайте вопросы на карточке <span>·</span> O — вся карта <span>·</span> колесо — масштаб</div>
<script id="story-data" type="application/json">${json}</script><script src="../../static/story-map.js?v=${revision}"></script>
</body></html>`;
  const output = path.join(root, "public", lesson, "map.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
  // Keep links shared before the move to a website-only format working.
  await writeFile(path.join(root, "public", lesson, "map.canvas.html"), html);
}
