import { buttonVariants } from './ui/variants.js';
import { decorateControls } from './ui/markup.mjs';
import { renderMechanismButton, renderMechanismAgent } from './ui/mechanism-markup.mjs';
import { preferencesHead, renderPreferences } from './ui/application-markup.mjs';
import { readdir } from 'node:fs/promises';
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { estimateLesson, formatMinutes } from "./learning.mjs";
import { authoredDiscoveries } from "./discoveries.mjs";
export async function renderLesson(root) {
  const lesson = "01-foundations/01-from-data-to-agents";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const materials = JSON.parse(await readFile(path.join(root, lesson, "materials.json"), "utf8"));
  const glossary = JSON.parse(await readFile(path.join(root, "glossary.json"), "utf8"));
  const data = JSON.stringify({
    ...Object.fromEntries(Object.entries(story).filter(([key]) => key !== "skillTree")),
    ...authoredDiscoveries(story),
    materials: materials.materials,
    termHighlights: [...new Set([...glossary.terms.flatMap(term => [term.title, ...term.aliases]), ...(story.termHighlights || [])])],
    learningTime: estimateLesson(story),
    // Decorative reactions do not invalidate a reader's encounters with the text.
    contentRevision: createHash("sha256").update(JSON.stringify(story.chapters, (key, value) => key === "reactions" ? undefined : value)).digest("hex").slice(0, 12),
    assessmentRevision: createHash("sha256").update(JSON.stringify(story.assessment)).digest("hex").slice(0, 12),
  }).replaceAll("<", "\\u003c");
  const revision = createHash("sha256")
    .update(await readFile(path.join(root, "site/lesson.js")))
    .update(await readFile(path.join(root, "site/lesson-views.js")))
    .update(await readFile(path.join(root, "site/lesson.css")))
    .update(await readFile(path.join(root, "site/learning.mjs")))
    .update(await readFile(path.join(root, "site/discovery.js")))
    .update(await readFile(path.join(root, "site/knowledge-card.js")))
    .update(await readFile(path.join(root, "site/knowledge-card.css")))
    .update(await readFile(path.join(root, "site/exercise.mjs")))
    .update(await readFile(path.join(root, "site/select.js")))
    .update(await uiRevision(path.join(root, "site/ui")))
    .update(await readFile(path.join(root, "package-lock.json")))
    .digest("hex")
    .slice(0, 12);
  const out = path.join(root, "public", lesson);
  await mkdir(out, { recursive: true });
  const timing = estimateLesson(story);
  const readingMode = (name) => `<fieldset class="preparation-choice reading-mode"><legend>Как объяснять материал</legend><div class="reading-options"><label><input type="radio" name="${name}" value="beginner"><span>Простыми словами</span><small>Объяснять незнакомые понятия</small></label><label><input type="radio" name="${name}" value="experienced"><span>С техническими терминами</span><small>Модель, LLM и агент уже знакомы</small></label></div></fieldset>`;
  const html = `<!doctype html><html lang="ru" data-theme="zinc" data-material="embossed" data-accent="ivory" data-tactile><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101112">${preferencesHead()}<title>${story.title} · UnknownTalks</title><link rel="stylesheet" href="../../static/ui.css?v=${revision}"><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"><link rel="stylesheet" href="../../static/embossed.css?v=${revision}"><link rel="stylesheet" href="../../static/mechanism.css?v=${revision}"><link rel="stylesheet" href="../../static/application.css?v=${revision}"></head><body>
 <svg class="material-filters" width="0" height="0" aria-hidden="true" focusable="false"><defs><filter id="material-pencil" x="-3%" y="-3%" width="106%" height="106%"><feTurbulence type="fractalNoise" baseFrequency=".065" numOctaves="2" seed="8" result="pencil"/><feDisplacementMap in="SourceGraphic" in2="pencil" scale="1.05" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>

 <section class="lesson-toolbar" aria-label="Текущий урок"><div class="page-container"><nav class="lesson-breadcrumbs" aria-label="Вы здесь"><span class="lesson-product-path"><a class="product-crumb" href="../../">UnknownTalks</a><span class="crumb-slash" aria-hidden="true">/</span></span><span class="lesson-current-path"><a class="active-lesson-title" href="?view=read" data-read-return title="${story.title}">${story.title}</a></span></nav>${renderMechanismButton()}<nav class="lesson-tools" aria-label="Разделы этого урока"><a href="?view=read" data-read-return data-view-nav="read">Урок</a><button id="timeline-open" data-view-nav="chapters" aria-controls="timeline-dialog">Главы</button><button id="skills-open" data-view-nav="skills" aria-controls="skills-journal">Навыки</button><button id="settings-open" data-view-nav="settings" aria-controls="settings">Настройки</button></nav></div></section>
 <main id="lesson-layout" data-view="read"><section id="lesson-reader" class="conversation" aria-label="Переписка"><nav id="reader-location" aria-label="Переход между главами" hidden><a id="previous-chapter" class="${buttonVariants({ variant: "action" })} chapter-navigation previous-action" data-slot="button" data-variant="action" data-size="default" href="?view=read#intro">← Открыть прошлую главу</a></nav><button id="return-inline" class="text-button" hidden>Вернуться к прохождению</button><div class="conversation-unread" aria-label="Непрочитанное в переписке"><button id="jump" class="unread-jump" hidden>Новые сообщения ↓</button></div><div id="reader-frame">
 <section id="participant-chat" aria-labelledby="participant-chat-title"><h1 id="participant-chat-title">${story.title}</h1><div id="participant-exchange" aria-live="polite"></div><section id="preparation-chat" hidden aria-label="Выбор уровня подготовки"><div id="preparation-exchange" aria-live="polite"></div><form id="preparation-form" class="preparation-choice">${readingMode('preparation-intro')}<div class="reply-actions"><button id="preparation-save" class="reply-send" type="submit">Отправить</button></div></form></section><div id="participant-prelude" aria-live="polite" hidden></div><form id="participant-form" class="participant-composer" novalidate><label for="participant-name" class="sr-only">Ваше имя</label><div class="participant-input-row"><input id="participant-name" name="participant-name" type="text" placeholder="Ваше имя" autocomplete="given-name" maxlength="40" enterkeyhint="send" aria-describedby="participant-error"><button id="participant-save" class="reply-send" type="submit" disabled>Отправить</button></div><p id="participant-error" class="small" role="status"></p><button id="participant-cancel" type="button" class="text-button" hidden>Отмена</button></form></section>
 <section class="opening" id="system-opening" aria-label="Начало переписки">
 <article class="message incoming tone-system"><header class="message-meta"><span class="message-author"><span class="avatar" aria-hidden="true">U</span><span class="sender">UnknownTalks</span></span><span class="small muted">Система</span></header><p class="small muted">Встреча 1 · Основы AI</p><h1>${story.title}</h1>${story.premise.setup.slice(0, -1).map((text) => `<p>${text}</p>`).join("")}</article>
 <article class="message incoming tone-system"><header class="message-meta"><span class="message-author"><span class="avatar" aria-hidden="true">U</span><span class="sender">UnknownTalks</span></span><span class="small muted">Система</span></header><p>${story.premise.setup.at(-1)}</p><p id="learning-time">Читайте в своём темпе. Главу и ответы сохраняет браузер — можно остановиться и продолжить позже.</p></article>
 <div id="opening-composer" class="reply-actions" aria-label="Запуск переписки"></div></section>
 <section id="messages" aria-label="Ваша переписка с командой"></section><div id="typing-status" role="status" class="sr-only"></div><div id="new-message-status" role="status" class="sr-only" aria-atomic="true"></div>
 <div id="playback-controls" role="group" aria-label="Появление сообщений" hidden><span id="playback-status" aria-hidden="true"></span><div class="playback-actions"><button id="pause" class="ui-button-ghost" type="button" aria-label="Приостановить сообщения" title="Приостановить сообщения"><svg class="playback-pause" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg><svg class="playback-play" viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z"/></svg></button><button id="reveal-now" class="ui-button-ghost" type="button" aria-label="Показать оставшиеся сообщения без ожидания" title="Показать оставшиеся сообщения без ожидания"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 5 6 5-6 5m6-10 6 5-6 5"/></svg><span>Без ожидания</span></button></div></div>
 <section id="final-check" hidden aria-label="Итоговая проверка с Николаем"><header class="chapter-heading"><h2>Глава ${story.chapterGroups.length + 1} — Проверим понимание</h2></header><div id="final-check-body"></div></section></div>
 <footer class="story-footer"><p class="small"><a href="agent.html">Полный текст урока</a> · <button id="about-open" class="text-button">О персонажах</button></p><p class="small muted">© 2026 UnknownHero. Только для закрытого демонстрационного просмотра. <a href="../../license.txt" target="_blank" rel="noopener">Условия использования</a></p><p id="storage-message" class="small" role="status"></p></footer></section><section id="secondary-views" aria-label="Материалы этого урока" hidden>
 ${renderMechanismAgent()}
 <section id="skills-journal" class="app-view" hidden aria-labelledby="journal-title"><header class="journal-header"><div><p class="journal-kicker">Урок 1 · ${story.title}</p><h2 id="journal-title">Навыки этого урока</h2></div><a href="?view=read" data-read-return class="journal-back">← Вернуться к уроку</a></header><div class="journal-intro"><p id="journal-progress" role="status"></p><progress id="journal-progress-bar" max="1" value="0" aria-label="Открытия в истории"></progress><p class="journal-caption">Ваши навыки растут по ходу истории. Здесь — сохранённые открытия, действия и подробные примеры.</p><button id="skill-resources-jump" type="button" class="text-button">Источники урока ↓</button></div><ol id="journal-entries" aria-label="Навыки и их развитие"></ol><section id="skill-resources" aria-labelledby="skill-resources-title"><h3 id="skill-resources-title">Источники урока</h3><p class="small muted">Материалы, на которых основаны объяснения и примеры.</p><div id="skill-resources-body"></div></section></section>
 <section id="term-detail" class="app-view" hidden aria-labelledby="term-detail-title"><header class="term-sheet-header"><div><p id="term-detail-progress" class="journal-kicker"></p><h2 id="term-detail-title"></h2></div><a class="view-back" href="?view=skills" data-view-back="skills-journal">← Все навыки</a></header><div id="term-detail-body"></div></section>
 <section id="settings" class="app-view" hidden aria-labelledby="settings-title"><header class="dialog-heading"><div><p class="dialog-context">Урок 1 · ${story.title}</p><h2 id="settings-title">Настройки чтения</h2></div><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header>${renderPreferences()}${readingMode('preparation-settings')}<label for="pace">Темп переписки</label><select id="pace" data-ui-size="compact"><option value="normal">В ритме переписки</option><option value="fast">Быстрее</option><option value="instant">Все сообщения сразу</option></select><p class="small muted">Выбор можно менять — место чтения и ответы сохранятся.</p><div class="motion-setting" hidden><label for="motion-mode">Движение интерфейса</label><select id="motion-mode" data-ui-size="compact"><option value="system">Как в системе</option><option value="clock">Часовой ритм</option><option value="off">Без анимации</option></select></div><button id="read-all" hidden>Просмотр любой главы</button><button id="back-to-chat" class="text-button" hidden>Вернуться к прохождению</button><details class="settings-reset"><summary>Начать заново</summary><p class="small muted">Можно сбросить выбранную главу или весь урок. Сначала выберите, что изменить.</p><button id="restart-chat">Выбрать, что сбросить…</button></details><div hidden><details class="time-details"><summary>Оценка времени и добровольные измерения</summary><p class="small">Основной маршрут с самостоятельной проверкой: ~${timing.requiredMinutes} мин. История: ${formatMinutes(timing.main)}; самостоятельная проверка с разбором: ${formatMinutes(timing.assessment)}. По желанию: практика по главам — ещё ${formatMinutes(timing.practice)}, итоговая практика с немедленным разбором — ${formatMinutes(timing.guidedPractice)}, все внутренние чаты — ещё ${formatMinutes(timing.optional)}. Вся переписка с чатами и проверками: ${formatMinutes(timing.expanded)}. Отдельный эксперимент с токенизатором, внешние источники и дополнительные возвраты в эту оценку не входят.</p><p class="small muted">Расчёт учитывает чтение, схемы, размышление, ответы и ожидание сообщений. Он ещё не проверен на участниках. Ошибка — повод спокойно разобраться, а не уложиться в норматив.</p><label><input id="measure-local" type="checkbox"> Записывать время этого прохождения только в моём браузере</label><p class="small muted">По умолчанию выключено. При включении сохраняются длительности видимого чтения, ответов и разбора, паузы, ожидание интерфейса, идентификаторы заданий и выбранные ответы. Чтение оценивается приблизительно по видимости и активности; это не измерение внимания. Передачи на сервер нет. Включение посреди урока не измерит его начало.</p><button id="export-learning">Скачать мои измерения</button><button id="clear-learning">Удалить мои измерения и выключить запись</button><p id="measurement-status" class="small" role="status"></p></details></div></section>
 <section id="about" class="app-view" hidden><header class="dialog-heading"><h2>О персонажах</h2><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header><div id="cast"></div><p>Это постановочная переписка: персонажи, товары, сроки и проверки в сюжете вымышлены. Идеи и первичные источники настоящие. Команда настраивает готовую модель и объясняет технологии, на которых основана её работа. Время сообщений задаёт ритм истории, а не длительность реального обучения больших моделей.</p><p>Разделение ролей условное: в настоящих командах обязанности пересекаются. <a href="https://deepmind.google/careers/" target="_blank" rel="noopener noreferrer">Пример описания исследовательских и инженерных ролей</a>.</p><p><a href="materials.html">Материалы учебного примера</a> · <a href="agent.html">Полный текст с решениями</a></p></section>
 <section id="person-info" class="app-view" hidden aria-labelledby="person-name"><header class="dialog-heading"><h2 id="person-name"></h2><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header><p id="person-handle" class="small muted"></p><p id="person-role"></p><p id="person-description" class="small muted"></p></section>

 <section id="timeline-dialog" class="app-view" hidden aria-labelledby="timeline-title"><header class="dialog-heading"><div><p class="dialog-context">Урок 1 · ${story.title}</p><h2 id="timeline-title">Главы урока</h2></div><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header><div id="timeline-mobile"><div id="timeline-body"><p id="progress-label"></p><progress id="story-progress" max="100" value="0" class="sr-only"></progress><ol id="timeline-chapters"></ol><button id="timeline-final">Проверим понимание</button></div></div></section>
 <section id="rollback-dialog" class="app-view" hidden aria-labelledby="rollback-title"><header class="dialog-heading"><h2 id="rollback-title">Начать заново</h2><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header><label for="reset-from">Что сбросить?</label><select id="reset-from"></select><p id="rollback-description"></p><p id="rollback-note" class="small muted"></p><div class="quiz-actions"><button id="rollback-cancel">Отмена</button><button id="rollback-confirm">Начать заново</button></div></section>
 <section id="material-info" class="app-view" hidden aria-labelledby="material-title"><header class="dialog-heading"><h2 id="material-title"></h2><a class="view-back" href="?view=read" data-read-return>← К переписке</a></header><div id="material-body"></div></section>

 </section></main>
 <div id="discovery-status" role="status" class="sr-only" aria-live="polite"></div><script id="lesson-data" type="application/json">${data}</script><script type="module" src="../../static/lesson.js?v=${revision}"></script></body></html>`;
  for (const file of [
    "chat.html",
    "story.html",
    "dialog.html",
    "formats.html",
  ])
    await writeFile(path.join(out, file), await decorateControls(html, root));
  const esc = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  await writeFile(
    path.join(out, "materials.html"),
    `<!doctype html><html lang="ru" data-theme="zinc"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Материалы истории</title><link rel="stylesheet" href="../../static/ui.css?v=${revision}"><link rel="stylesheet" href="../../static/lesson.css?v=${revision}"></head><body><main class="conversation"><a href="chat.html">← К переписке</a><h1>Материалы учебного примера</h1><p>${esc(materials.notice)}</p>${materials.materials.map((m) => `<article id="${m.id}"><h2>${esc(m.title)}</h2><p>${esc(m.text)}</p></article>`).join("")}</main></body></html>`,
  );
  await mkdir(path.join(out, "notes"), { recursive: true });
  for (const [name, id] of Object.entries({
    data: "data",
    processing: "data",
    history: "training",
    training: "training",
    tokens: "tokens",
    llm: "vectors",
    generation: "generation",
    code: "generation",
    agents: "agent",
    applications: "agent",
    outlook: "diagnosis",
    decisions: "agent",
  }))
    await writeFile(
      path.join(out, "notes", name + ".html"),
      `<!doctype html><html lang="ru" data-theme="zinc"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=../chat.html#${id}"><title>Объяснение в переписке</title></head><body><a href="../chat.html#${id}">Открыть объяснение</a></body></html>`,
    );
}

async function uiRevision(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  return Buffer.concat(await Promise.all(files.sort((a,b) => a.name.localeCompare(b.name)).map(entry =>
    entry.isDirectory() ? uiRevision(path.join(directory, entry.name)) : readFile(path.join(directory, entry.name)))));
}
