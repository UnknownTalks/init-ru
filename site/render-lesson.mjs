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
  const data = JSON.stringify({
    ...story,
    glossary: glossary.terms,
  }).replaceAll("<", "\\u003c");
  const revision = createHash("sha256")
    .update(await readFile(path.join(root, "site/lesson.js")))
    .update(await readFile(path.join(root, "site/lesson.css")))
    .digest("hex")
    .slice(0, 12);
  const out = path.join(root, "public", lesson);
  await mkdir(out, { recursive: true });
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#202122"><title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body>
 <header class="app-header"><a class="brand" href="./">UnknownTalks <span>/ init-ru</span></a><nav aria-label="Материалы истории"><a href="../../glossary.html" target="_blank">Словарь</a><button id="settings-open" aria-label="Настройки переписки">⋯</button></nav></header>
 <main class="conversation"><section class="opening"><p class="eyebrow">Встреча 1 · Основы AI</p><h1>${story.title}</h1>${story.premise.setup.map((text) => `<p>${text}</p>`).join("")}<div id="opening-composer" aria-label="Первое сообщение Саши"></div></section>
 <button id="return-inline" class="text-button" hidden>Вернуться к прохождению</button><section id="messages" aria-label="Переписка Саши и команды"></section><div id="typing-status" role="status" class="sr-only"></div><div id="new-message-status" role="status" class="sr-only" aria-atomic="true"></div><div id="playback-controls" hidden><button id="reveal-now">Показать сообщения сразу</button><button id="pause">Пауза</button></div>
 <section id="final-check" hidden><h2>Что осталось в памяти?</h2><p>Можно проверить связи между понятиями. При ошибке Нина перешлёт сообщения, где проблема привела к решению.</p><button id="all-checks">Проверить всю тему</button><div id="final-check-body"></div></section>
 <footer class="story-footer"><button id="progress-open" aria-label="Открыть дерево навыков"><span><strong id="progress-label">История ещё не началась</strong><span class="small muted">Дерево навыков ↗</span></span><progress id="story-progress" max="100" value="0"></progress></button><p class="small muted">Полоса показывает продвижение по основной переписке. Проверка понимания учитывается отдельно.</p><p class="small"><a href="agent.html">Для своего агента</a> · <button id="about-open" class="text-button">О персонажах и источниках</button></p><p id="storage-message" class="small" role="status"></p></footer></main>
 <dialog id="skills"><header class="dialog-heading"><h2>Дерево навыков</h2><button data-close aria-label="Закрыть дерево">×</button></header><p id="skill-summary"></p><p class="small muted">Ветви связаны с понятиями, а не порядком глав. «Проверено» означает верный ответ на вопросы этой ветви, а не гарантию владения навыком.</p><div id="skill-tree"></div></dialog>
 <dialog id="settings"><header class="dialog-heading"><h2>Переписка</h2><button data-close aria-label="Закрыть настройки">×</button></header><label for="pace">Появление сообщений</label><select id="pace"><option value="normal">Как в мессенджере</option><option value="fast">Быстрее</option><option value="instant">Без ожидания</option></select><p class="muted small">Новые сообщения отмечены словом «Новое» и светлой рамкой. Экран остаётся на месте; кнопка перехода ведёт к первому непрочитанному сообщению. Точки означают подготовленную анимацию набора. История не подключена к живой модели.</p><button id="read-all" class="wide">Открыть всю переписку</button><button id="back-to-chat" class="wide">Вернуться к прохождению</button><button id="restart-chat" class="wide">Начать переписку заново</button><p class="small muted">Повторный запуск начинает историю с первого сообщения. Результаты вопросов сохраняются. Дополнительные переписки можно раскрывать по ходу истории.</p><a href="agent.md">Полный текст и все внутренние чаты</a></dialog>
 <dialog id="about"><header class="dialog-heading"><h2>О персонажах</h2><button data-close aria-label="Закрыть описание">×</button></header><div id="cast"></div><p>Это постановочная переписка: персонажи, товары, сроки и проверки в сюжете вымышлены. Идеи и первичные источники настоящие. Команда не изобрела все технологии ради покупки: она воспроизводит подходы разных исследователей на одной понятной задаче. Время сообщений задаёт ритм истории, а не длительность реального обучения больших моделей.</p><p>Разделение ролей условное: в настоящих командах обязанности пересекаются. <a href="https://deepmind.google/careers/" target="_blank" rel="noopener noreferrer">Пример описания исследовательских и инженерных ролей</a>.</p><p><a href="materials.html">Материалы учебного примера</a> · <a href="agent.html">Материалы для агента</a></p></dialog>
 <dialog id="term-info" class="info-dialog" aria-labelledby="term-title"><header class="dialog-heading"><h2 id="term-title"></h2><button data-close aria-label="Закрыть подсказку">×</button></header><p id="term-definition"></p><p class="small muted" id="term-example"></p><p class="info-links"><a id="term-glossary" target="_blank" rel="noopener noreferrer">В словаре ↗</a><a id="term-source" target="_blank" rel="noopener noreferrer">Источник ↗</a></p></dialog>
 <dialog id="person-info" class="info-dialog" aria-labelledby="person-name"><header class="dialog-heading"><h2 id="person-name"></h2><button data-close aria-label="Закрыть профиль">×</button></header><p id="person-handle" class="small muted"></p><p id="person-role"></p><p id="person-description" class="small muted"></p></dialog>
 <button id="jump" hidden>К новым сообщениям ↓</button><script id="lesson-data" type="application/json">${data}</script><script src="../../static/lesson.js?v=${revision}"></script></body></html>`;
  for (const file of [
    "chat.html",
    "story.html",
    "dialog.html",
    "map.html",
    "map.canvas.html",
    "formats.html",
  ])
    await writeFile(path.join(out, file), html);
  const materials = JSON.parse(
    await readFile(path.join(root, lesson, "materials.json"), "utf8"),
  );
  const esc = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  await writeFile(
    path.join(out, "materials.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Материалы истории</title><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body><main class="conversation"><a href="chat.html">← К переписке</a><h1>Материалы учебного примера</h1><p>${esc(materials.notice)}</p>${materials.materials.map((m) => `<article id="${m.id}"><h2>${esc(m.title)}</h2><p>${esc(m.text)}</p></article>`).join("")}</main></body></html>`,
  );
  await mkdir(path.join(out, "notes"), { recursive: true });
  for (const [name, id] of Object.entries({
    data: "data",
    processing: "data-quality",
    history: "patterns-research",
    training: "training",
    tokens: "tokens",
    llm: "vectors",
    generation: "generation",
    code: "generation-coding",
    agents: "agent",
    applications: "agent",
    outlook: "ending",
    decisions: "agent-decisions",
  }))
    await writeFile(
      path.join(out, "notes", name + ".html"),
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../chat.html#${id}"><title>Объяснение в переписке</title></head><body><a href="../chat.html#${id}">Открыть объяснение</a></body></html>`,
    );
}
