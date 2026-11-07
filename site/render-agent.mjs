import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { solutionText } from "./exercise.mjs";
export async function renderAgentView(root) {
  const lesson = "01-foundations/01-from-data-to-agents",
    base = "https://unknowntalks.github.io/init-ru";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
  const materials = JSON.parse(
    await readFile(path.join(root, lesson, "materials.json"), "utf8"),
  );
  const names = new Map(story.characters.map((p) => [p.id, p.name]));
  const text = [
    `# ${story.title}`,
    story.subtitle,
    "© 2026 UnknownHero. Только для закрытого демонстрационного просмотра. Копирование и иное использование не разрешены без письменного согласия. Условия: " + base + "/license.txt",
    "## Сюжет и границы",
    "Главный персонаж — вы. В интерактивной переписке можно ввести своё имя; в этом полном тексте ваши реплики подписаны «Вы». События и подготовленные реплики относятся к учебному сюжету.",
    ...story.premise.setup,
    story.premise.team,
    story.premise.goal,
    story.premise.note,
    "Персонажи, время сообщений и сроки экспериментов вымышлены. Команда воспроизводит подходы разных исследователей; порядок объяснения не является буквальной хронологией изобретений.",
    "## Участники",
    ...story.characters.map((p) => `- **${p.name} (@${p.handle}):** ${p.role}`),
    "## Как читать",
    "Основной диалог линеен. Между главами — кнопка «Продолжить»; реплики персонажей не являются ответами участника. Практические работы требуют собственных решений читателя. Продвижение по тексту не считается проверкой понимания. Практика даёт обратную связь, а отдельная итоговая проверка использует новые ситуации.",
    `Переписка: ${base}/${lesson}/chat.html`,

  ];
  function emit(e) {
    text.push(`<a id="${e.id}"></a>`);
    if (e.type === "message")
      text.push(
        `**${names.get(e.speaker)} · ${e.time || ""}**`,
        ...e.paragraphs,
      );
    else if (e.type === "narration") text.push(`*${e.text}*`);
    else if (e.type === "visual") {
      if (["table", "token-table"].includes(e.kind)) {
        const row = (cells) =>
          "| " +
          cells.map((cell) => cell.replaceAll("|", "\\|")).join(" | ") +
          " |";
        text.push(
          `**Таблица: ${e.title}**`,
          [
            row(e.columns),
            row(e.columns.map(() => "---")),
            ...e.items.map((item, index) => row(e.kind === "token-table"
              ? [String(index + 1), item.label, item.text.replace(/^ID /, "")]
              : [item.label, item.text, item.result])),
          ].join("\n"),
          e.caption,
        );
      } else
        text.push(
          `**Схема: ${e.title}**`,
          e.items
            .map((x) => (typeof x === "string" ? x : `${x.label}: ${x.text}`))
            .join(" → "),
          e.caption,
        );
    }
    if (e.reactions?.length) text.push(e.reactions.map((r) => `Реакция: ${r.emoji} ${r.by.map((id) => names.get(id)).join(", ")}`).join(" · "));
    for (const attachment of e.attachments || []) emit(attachment);
  }
  function emitThread(t) {
    text.push(
      `<a id="${t.id}"></a>`,
      `### Внутренний чат: ${t.title}`,
      `Направление: ${story.tracks.find((x) => x.id === t.track).title}. Необязательно для основной линии.`,
    );
    for (const e of t.messages) emit(e);
    if (t.sources?.length)
      text.push(
        "#### Источники обсуждения",
        ...t.sources.map((source) => `- [${source.label}](${source.url})`),
      );
  }
  function emitCheck(q) {
    text.push(
      `#### ${q.question}`,
      `Понятия: ${q.terms.join(", ") || "постановка задачи"}`,
      q.track ? "Дополнительное направление: " + q.track : "Основная линия.",
      ...(q.options || []).map(
        (o, i) => `- ${o}${i === q.correct ? " — верный ответ" : ""}`,
      ),
      ...(q.exercise ? [q.exercise.prompt, solutionText(q.exercise), ...q.exercise.fields.flatMap(f => (f.options || []).map(o => "- " + o.label))] : []),
      q.explanation,
      "При ошибке вернуться к сообщениям: " +
        q.references.map((id) => `[${id}](#${id})`).join(" · "),
    );
  }
  text.push("## Навыки");
  for (const s of story.skills || []) text.push(`### ${s.name}`, s.short, ...s.steps.map(step => '- ' + step), s.detail, ...s.examples);
  if (story.workbook) text.push(`## ${story.workbook.title}`, story.workbook.intro, ...story.workbook.fields.flatMap(f => [f.label, f.hint]));
  text.push("## Полная переписка");
  for (const [index, group] of story.chapterGroups.entries()) {
    text.push(`## Глава ${index + 1} — ${group.title}`);
    const scenes = group.chapters.map((id) =>
      story.chapters.find((c) => c.id === id),
    );
    for (const c of scenes) {
      text.push(`<a id="${c.id}"></a>`, `### ${c.title} · День ${c.day}`);
      for (const e of c.intro) emit(e);
      if (c.decision) {
        const continuation = c.decision.options[0];
        text.push(`**${names.get(c.decision.responder)} · ${c.replyTime}:** ${continuation.reply}`);
      }
      for (const e of c.outro) emit(e);
      for (const t of c.threads) emitThread(t);
      if (c === scenes.at(-1) && scenes.some((scene) => scene.checks.length)) {
        text.push("### Практика с обратной связью");
        for (const q of scenes.flatMap((scene) => scene.checks)) emitCheck(q);
      }
      text.push(
        "### Проблема, попытки и результат",
        ...Object.entries(c.arc).map(
          ([kind, ids]) =>
            `${kind}: ${ids.map((id) => `[сообщение](#${id})`).join(" · ")}`,
        ),
        ...(c.sources.length
          ? [
              "### Источники",
              ...c.sources.map((s) => `- [${s.label}](${s.url})`),
            ]
          : []),
      );
    }
  }
  text.push("## Ситуации для проверки и разбора",
    "В практике объяснения показываются сразу после ответа. В самостоятельной проверке на новых ситуациях — после всех ответов. Ниже задания с ответами всех наборов: A для практики, C/D для самостоятельной проверки. После чтения ответов соответствующий набор пригоден только для практики. Подтверждение требует верного объяснения и выполнения всех частей практического задания. Оно относится к этим условиям, а не к любым задачам или долговременному освоению.");
  for (const form of story.assessment.forms) {
    text.push(`### Форма ${form.id} · ${form.purpose === "practice" ? "Практика с разбором" : "Самостоятельная проверка"}`);
    for (const q of form.questions) emitCheck(q);
  }
  text.push(
    "## Словарь",
    ...glossary.terms.flatMap((t) => [
      `### ${t.title}`,
      t.definition,
      `Пример: ${t.example}`,
      `Источник: ${t.source}`,
    ]),
    "## Материалы учебного примера",
    materials.notice,
    ...materials.materials.flatMap((m) => [`### ${m.title}`, m.text]),
  );
  const md = text.join("\n\n").replaceAll("{{name}}, ", "").replaceAll("{{name}}", "вы") + "\n",
    out = path.join(root, "public", lesson);
  await mkdir(out, { recursive: true });
  for (const [file, obj] of [
    [path.join(out, "story.json"), story],
    [path.join(out, "materials.json"), materials],
    [path.join(root, "public", "glossary.json"), glossary],
  ])
    await writeFile(file, JSON.stringify(obj, null, 2) + "\n");
  await writeFile(path.join(out, "agent.md"), md);
  await writeFile(path.join(root, "public", "llms-full.txt"), md);
  await writeFile(
    path.join(root, "public", "llms.txt"),
    `# UnknownTalks / init-ru\n\n© 2026 UnknownHero. Все права защищены. Только для закрытого демонстрационного просмотра; копирование и иное использование не разрешены без письменного согласия. [Условия использования](${base}/license.txt).\n\n[Открыть переписку](${base}/${lesson}/chat.html). [Полный текст для просмотра](${base}/${lesson}/agent.html).\n`,
  );
  await writeFile(
    path.join(out, "agent.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Полный текст урока · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css"></head><body><main class="conversation"><a href="chat.html">← К переписке</a><h1>Полный текст урока</h1><p>Здесь вся переписка, схемы, практические работы, самостоятельные проверки и первоисточники. Полный материал содержит правильные ответы: после их чтения эти задания остаются практикой.</p><ul><li><a href="agent.md">Весь материал в Markdown</a></li><li><a href="story.json">Структурированная история</a></li><li><a href="materials.json">Материалы вымышленного примера</a></li></ul><p>Это подготовленный учебный сценарий, а не расшифровка звонка. Персонажи, товары и сроки в истории вымышлены.</p><p>© 2026 UnknownHero. Только для закрытого демонстрационного просмотра. <a href="../../license.txt">Условия использования</a>.</p></main></body></html>`,
  );
}
