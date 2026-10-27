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
  const data = JSON.stringify({
    ...story,
    glossary: glossary.terms,
  }).replaceAll("<", "\\u003c");
  const revision = createHash("sha256")
    .update(await readFile(path.join(root, "site/lesson.js")))
    .update(await readFile(path.join(root, "site/lesson.css")))
    .digest("hex")
    .slice(0, 12);
  const directory = path.join(root, "public", lesson);
  await mkdir(directory, { recursive: true });
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#212121"><title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head>
<body>
<header class="app-header"><a class="brand" href="./" aria-label="К материалам встречи">UnknownTalks <span>/ init-ru</span></a><nav aria-label="Материалы"><button id="skills-open">Карта знаний <span id="header-progress"></span></button><a href="../../glossary.html" target="_blank">Словарь</a><button id="reading-open" aria-label="Настройки чтения">Чтение</button></nav></header>
<main id="transcript"><div class="book-heading"><h1>От данных до агента</h1><p>Саша хотел просто выбрать наушники. Команда взялась помочь. Получилось не сразу.</p><button class="text-button" id="about-open">Об этой истории и источниках</button></div><div id="messages"></div><div id="end-marker"></div></main>
<div class="composer-wrap"><button id="jump" hidden>К продолжению ↓</button><section id="composer" aria-label="Ваш ход в разговоре"></section><p class="composer-note" id="composer-note">Выбирайте вопросы вместо ввода текста. Это подготовленная история.</p></div>
<dialog id="skills"><header class="dialog-heading"><h2>Карта знаний</h2><button data-close aria-label="Закрыть карту">×</button></header><p id="skills-summary"></p><progress id="skills-progress" aria-label="Изученные главы"></progress><p class="muted small">Отмечайте изученное сами. Чтение и выбор ответа не ставят отметку автоматически. Всё сохраняется в этом браузере.</p><div id="skill-groups"></div><p class="muted small">Разборы «+» необязательны и не входят в основной прогресс.</p></dialog>
<dialog id="reading"><header class="dialog-heading"><h2>Как читать</h2><button data-close aria-label="Закрыть настройки">×</button></header><label for="speed">Появление ответа команды</label><select id="speed"><option value="normal">Постепенно</option><option value="fast">Быстрее</option><option value="instant">Сразу</option></select><p class="muted">Ответ можно раскрыть сразу в любой момент.</p><button id="book-mode" class="wide">Показать весь текст</button><p class="muted small">Для чтения как книги. Отметки изучения остаются вашими.</p><button id="chat-mode" class="wide">Вернуться к интерактивному прохождению</button><p id="storage-message" role="status"></p></dialog>
<dialog id="detail"><header class="dialog-heading"><h2 id="detail-title"></h2><button data-close aria-label="Закрыть разбор">×</button></header><div id="detail-body"></div></dialog>
<dialog id="about"><header class="dialog-heading"><h2>Одна история, разные открытия</h2><button data-close aria-label="Закрыть описание">×</button></header><p>Саша, команда и товары вымышлены. Команда объединяет работу разных исследователей, а порядок событий помогает понять зависимости между идеями. Это не буквальная история изобретения всех технологий одной компанией.</p><p>Механизмы настоящие. У каждой главы есть первичные источники; исторические подробности вынесены в разбор «+». Показанные границы токенов проверены настоящим токенизатором.</p><p>Вопросы внизу продолжают подготовленный сценарий. Живая модель здесь не подключена.</p><p><a href="materials.html">Материалы учебного примера</a> · <a href="agent.html">Полный текст для агента</a></p></dialog>
<p class="sr-only" id="announcement" role="status"></p><script id="lesson-data" type="application/json">${data}</script><script src="../../static/lesson.js?v=${revision}"></script></body></html>`;
  for (const name of [
    "chat.html",
    "story.html",
    "dialog.html",
    "map.html",
    "map.canvas.html",
    "formats.html",
  ])
    await writeFile(path.join(directory, name), html);
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  await writeFile(
    path.join(directory, "materials.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Материалы истории</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body><main class="document"><a href="chat.html">← К истории</a><h1>Материалы учебного примера</h1><p>${esc(materials.notice)}</p>${materials.materials.map((item) => `<article id="${item.id}"><p class="eyebrow">${esc(item.kind)}</p><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join("")}</main></body></html>`,
  );
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
    const target = `../chat.html#${id}`;
    await writeFile(
      path.join(directory, "notes", name + ".html"),
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Тема в истории</title></head><body><a href="${target}">Открыть объяснение</a></body></html>`,
    );
  }
}
