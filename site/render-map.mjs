import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export async function renderStoryMap(root) {
  const lesson = "01-foundations/01-from-data-to-agents";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const canvas = JSON.parse(
    await readFile(path.join(root, lesson, "map.canvas"), "utf8"),
  );
  const nodes = new Map(canvas.nodes.map((n) => [n.id, n]));
  const model = {
    title: story.title,
    chapters: story.chapters,
    scenes: story.scenes.map((scene, index) => {
      const node = nodes.get(scene.id);
      if (!node || node.type !== "file")
        throw new Error("Missing story scene in Canvas: " + scene.id);
      return {
        ...scene,
        number: index + 1,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        image: "./" + path.posix.relative(lesson, node.file),
      };
    }),
    edges: canvas.edges.filter(
      (edge) =>
        nodes.get(edge.fromNode)?.type === "file" &&
        nodes.get(edge.toNode)?.type === "file",
    ),
    groups: canvas.nodes.filter((node) => node.type === "group"),
  };
  const json = JSON.stringify(model).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#080a10"><title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/story-map.css"></head>
<body>
<header class="topbar"><a class="brand" href="./">UNKNOWN<span>TALKS</span><small>/ init-ru</small></a><nav id="chapters" aria-label="Ветки карты"></nav><button id="overview" aria-label="Показать всю карту">Вся карта <kbd>O</kbd></button><button id="fullscreen" aria-label="Полный экран">↗</button></header>
<main id="stage" aria-label="Интерактивная карта" tabindex="0"><div id="world"><svg id="connections" aria-hidden="true"></svg><div id="scenes"></div></div><div class="zoom"><button id="zoom-in" aria-label="Приблизить">+</button><button id="zoom-out" aria-label="Отдалить">−</button></div></main>
<footer class="transport"><button id="previous" aria-label="Предыдущая сцена">←</button><div class="current"><div id="chapter-label"></div><div id="scene-title" aria-live="polite"></div></div><button id="sources-toggle" aria-expanded="false">Источники</button><div class="counter"><span id="scene-number">01</span><span class="total"> / ${story.scenes.length}</span></div><button id="next" aria-label="Следующая сцена">→</button></footer>
<aside id="sources" aria-label="Первоисточники сцены" hidden></aside><div id="hint">← → — двигаться по рассказу <span>·</span> O — общий обзор <span>·</span> колесо — масштаб <span>·</span> перетаскивание — перемещение</div>
<script id="story-data" type="application/json">${json}</script><script src="../../static/story-map.js"></script>
</body></html>`;
  const output = path.join(root, "public", lesson, "map.canvas.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html);
}
