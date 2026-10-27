import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export async function renderLesson(root) {
  const lesson = "01-foundations/01-from-data-to-agents";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
  const materials = JSON.parse(
    await readFile(path.join(root, lesson, "materials.json"), "utf8"),
  );
  const model = JSON.stringify({
    ...story,
    glossary: glossary.terms,
    materials,
  }).replaceAll("<", "\\u003c");
  const revision = createHash("sha256")
    .update(await readFile(path.join(root, "site/lesson.js")))
    .update(await readFile(path.join(root, "site/lesson.css")))
    .digest("hex")
    .slice(0, 12);
  const directory = path.join(root, "public", lesson);
  await mkdir(directory, { recursive: true });
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#10141c"><title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body>
  <header class="app-header"><a class="brand" href="./">UNKNOWN<span>TALKS</span></a><nav id="view-switch" aria-label="Способ прохождения"><button data-view="story">Визуальная история</button><button data-view="dialog">Диалог</button><button data-view="map">Карта истории</button></nav><a href="../../glossary.html" target="_blank">Термины</a><a class="agent-link" href="agent.html">Для агента</a><button id="fullscreen" aria-label="Полный экран">↗</button></header>
  <div class="route-bar"><button id="route-toggle" aria-expanded="false">Линия истории ▾</button><span id="chapter-label"></span><span id="progress-label"></span><progress id="progress" value="0" max="1" aria-label="Изучение основной истории"></progress></div>
  <nav id="route" aria-label="Основная линия" hidden></nav>
  <main id="reader"><div class="scene-heading"><span id="scene-kicker"></span><h1 id="scene-title"></h1><label class="study"><input id="study" type="checkbox">Я разобрался с этой сценой</label></div>
  <p id="dialog-notice" hidden>Подготовленный диалог по сценарию. Ответы продолжают историю; живая модель здесь не подключена.</p>
  <div class="lesson-content"><section class="story-column"><div class="actor"><span class="avatar person">С</span><div><span class="actor-label">Саша и его задача</span><p id="scene"></p></div></div>
  <section class="problem"><span class="section-label">Какую проблему увидела команда</span><h2 id="problem"></h2></section>
  <section id="attempt" class="attempt"><span id="attempt-label" class="section-label"></span><p id="attempt-text"></p><p id="attempt-outcome" class="attempt-outcome"></p></section>
  <div id="solution" hidden><div class="actor"><span class="avatar team">К</span><div><span class="actor-label">Что предлагает исследовательская команда</span><p id="solution-text"></p></div></div><div id="approaches"></div></div>
  <button id="reveal" class="primary">Показать решение команды →</button></section>
  <section class="visual-column" aria-label="Наглядный пример"><div id="visual"></div><div class="example-result"><span id="result-label" class="section-label"></span><p id="result"></p><p id="result-why"></p></div></section></div>
  <section id="checkpoint" class="checkpoint" hidden><h2 id="check-question"></h2><div id="choices"></div><p id="feedback" role="status"></p></section>
  <div id="takeaway" class="takeaway" hidden></div>
  <section id="extras" aria-label="Необязательные углубления"></section>
  <details class="source-details"><summary>На чём основано объяснение</summary><p>Команда и товары — персонажи учебной истории. Ссылки ниже ведут к настоящим работам. Результаты демонстраций и условные схемы подписаны отдельно.</p><div id="sources"></div></details>
  <nav class="scene-navigation" aria-label="Продолжение истории"><button id="previous"></button><button id="next" class="primary"></button></nav>
  </main><main id="map-view" hidden><h1>Одна линия — от данных до агента</h1><p>Основная история идёт по стрелкам. Ветки с «+» можно оставить на потом: они не нужны, чтобы дойти до результата Саши.</p><div id="story-map"><svg id="map-lines" aria-hidden="true"></svg><div id="map-nodes"></div></div></main>
  <dialog id="detail"><button class="close" id="detail-close" aria-label="Закрыть разбор">×</button><div id="detail-content"></div></dialog>
  <dialog id="term"><button class="close" id="term-close" aria-label="Закрыть определение">×</button><h2 id="term-title"></h2><p id="term-definition"></p><p id="term-example"></p><a id="term-source" target="_blank" rel="noopener noreferrer">Источник ↗</a></dialog>
  <p id="storage-message" role="status"></p><script id="lesson-data" type="application/json">${model}</script><script src="../../static/lesson.js?v=${revision}"></script></body></html>`;
  for (const name of [
    "story.html",
    "dialog.html",
    "map.html",
    "map.canvas.html",
  ])
    await writeFile(path.join(directory, name), html);
  const formats = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Как пройти историю · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body class="formats"><header class="app-header"><a class="brand" href="./">UNKNOWN<span>TALKS</span></a><a href="../../glossary.html">Термины</a><a href="agent.html">Для агента</a></header><main class="formats-main"><span class="eyebrow">Одна задача. Одна команда. Разные способы пройти.</span><h1>Как данные стали помощником Саши</h1><p class="lead">Саша выбирает наушники для звонков в шумном месте. Команда пробует решения, встречает ограничения и постепенно собирает агента. Каждый новый механизм отвечает на проблему, которая уже возникла в истории.</p><div class="format-grid"><a class="format-card" href="story.html"><div class="format-sketch visual-sketch"><span>Проблема</span><b>→</b><span>Идея</span><b>→</b><span>Результат</span></div><h2>Визуальная история</h2><p>Для звонка и самостоятельного чтения. Ситуация, попытка команды, наглядная схема и следующий вопрос.</p><strong>Начать историю →</strong></a><a class="format-card" href="dialog.html"><div class="format-sketch chat-sketch"><span>А почему так не сработало?</span><span>Давайте проверим на задаче Саши.</span></div><h2>Диалог с продолжением</h2><p>Для самостоятельного прохождения. Выбор ответа вызывает объяснение и продолжает ту же историю.</p><strong>Войти в диалог →</strong></a><a class="format-card" href="map.html"><div class="format-sketch map-sketch"><span>Данные → Модель → Агент</span><small>＋ детали &nbsp; ＋ детали</small></div><h2>Карта истории</h2><p>Для обзора и повторения. Видно основную линию, текущую сцену, изученное и необязательные ответвления.</p><strong>Открыть карту →</strong></a></div><p class="format-note">Во всех видах один сценарий и одни отметки изучения в этом браузере. Товары и материалы их проверки вымышлены; научные источники настоящие. В основной линии нет кода и числовых расчётов.</p><section class="format-outline"><h2>Что станет понятнее</h2><p>Какие бывают данные · как устроены токены и векторы · как модель учится и генерирует ответ · чем контекст отличается от дообучения · откуда берутся выдуманные ответы · как поиск и инструменты приводят к агентному циклу.</p></section></main></body></html>`;
  await writeFile(path.join(directory, "formats.html"), formats);
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  await writeFile(
    path.join(directory, "materials.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Материалы истории Саши</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body class="formats"><main class="formats-main"><a href="story.html">← К истории</a><h1>Материалы учебного примера</h1><p class="lead">${esc(materials.notice)}</p>${materials.materials.map((item) => `<article class="material" id="${item.id}"><span class="eyebrow">${esc(item.kind)}</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join("")}</main></body></html>`,
  );
  // Old standalone notes now lead to the corresponding scene in the story.
  const notes = {
    data: "data",
    processing: "data-quality",
    history: "history",
    training: "training",
    tokens: "tokens",
    llm: "vectors",
    generation: "generation",
    code: "tools",
    agents: "agent",
    applications: "agent",
    outlook: "ending",
    decisions: "decisions",
  };
  await mkdir(path.join(directory, "notes"), { recursive: true });
  for (const [name, id] of Object.entries(notes)) {
    const target = `../story.html#${id}`;
    await writeFile(
      path.join(directory, "notes", name + ".html"),
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Тема в новой истории</title></head><body><a href="${target}">Открыть объяснение в истории Саши</a></body></html>`,
    );
  }
}
