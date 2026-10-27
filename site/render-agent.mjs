import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
    "## Сюжет и границы",
    story.premise.goal,
    story.premise.note,
    "Персонажи, время сообщений и сроки экспериментов вымышлены. Команда воспроизводит подходы разных исследователей; порядок объяснения не является буквальной хронологией изобретений.",
    "## Участники",
    ...story.characters.map((p) => `- **${p.name}:** ${p.role}`),
    "## Как читать",
    "Основной диалог линеен. Варианты — сообщения Саши; выбор меняет вступительный ответ, затем разговор сходится в общий текст. Внутренние чаты раскрывают направления по желанию. Продвижение по тексту не считается проверкой понимания. Вопросы проверки независимы от сюжетного выбора; при ошибке пересылаются исходные сообщения с проблемой, попыткой и решением.",
    `Переписка: ${base}/${lesson}/chat.html`,
    "## Дерево навыков",
  ];
  function skill(node, depth = 0) {
    text.push("  ".repeat(depth) + "- " + node.title);
    for (const child of node.children || []) skill(child, depth + 1);
  }
  skill(story.skillTree);
  function emit(e) {
    text.push(`<a id="${e.id}"></a>`);
    if (e.type === "message")
      text.push(
        `**${names.get(e.speaker)} · ${e.time || ""}**`,
        ...e.paragraphs,
      );
    else if (e.type === "narration") text.push(`*${e.text}*`);
    else if (e.type === "visual")
      text.push(
        `**Схема: ${e.title}**`,
        e.items
          .map((x) => (typeof x === "string" ? x : `${x.label}: ${x.text}`))
          .join(" → "),
        e.caption,
      );
  }
  text.push("## Полная переписка");
  for (const c of story.chapters) {
    text.push(`<a id="${c.id}"></a>`, `## ${c.title}`, `*${c.elapsed}*`);
    for (const e of c.intro) emit(e);
    text.push("### Варианты сообщения Саши");
    for (const o of c.decision.options)
      text.push(
        `**Саша:** ${o.label}`,
        `**${names.get(c.decision.responder)}:** ${o.reply}`,
      );
    for (const e of c.outro) emit(e);
    for (const t of c.threads) {
      text.push(
        `<a id="${t.id}"></a>`,
        `### Внутренний чат: ${t.title}`,
        `Направление: ${story.tracks.find((x) => x.id === t.track).title}. Необязательно для основной линии.`,
      );
      for (const e of t.messages) emit(e);
    }
    text.push("### Проверка понимания");
    for (const q of c.checks)
      text.push(
        `#### ${q.question}`,
        `Понятия: ${q.terms.join(", ") || "постановка задачи"}`,
        q.track ? "Дополнительное направление: " + q.track : "Основная линия.",
        ...q.options.map(
          (o, i) => `- ${o}${i === q.correct ? " — верный ответ" : ""}`,
        ),
        q.explanation,
        "При ошибке вернуться к сообщениям: " +
          q.references.map((id) => `[${id}](#${id})`).join(" · "),
      );
    text.push(
      "### Проблема, попытки и результат",
      ...Object.entries(c.arc).map(
        ([kind, ids]) =>
          `${kind}: ${ids.map((id) => `[сообщение](#${id})`).join(" · ")}`,
      ),
      "### Источники",
      ...c.sources.map((s) => `- [${s.label}](${s.url})`),
    );
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
  const md = text.join("\n\n") + "\n",
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
    `# UnknownTalks / init-ru\n\n> Russian educational messenger story: from internet data to a language-model agent. Fictional cast, products, timestamps and development durations; real primary sources.\n\nSchema v4: chapters contain intro/outro events (message, narration, visual), a story decision, optional internal threads and independent checks. Characters have roles; tracks control optional depth, never core prerequisites. Decision options change only the opening reply and rejoin the common outro. Checks contain options, the correct index, an explanation and references to actual event IDs for forwarded remediation. arc records problem/attempts/resolution references. skillTree branches by concepts, not chapter sequence. Browser story progress is separate from quiz results.\n\n- [Complete dialogue, every internal chat, question, answer and source](${base}/${lesson}/agent.md)\n- [Structured story](${base}/${lesson}/story.json)\n- [Fictional source materials](${base}/${lesson}/materials.json)\n- [Glossary](${base}/glossary.md)\n- [Structured glossary](${base}/glossary.json)\n- [Self-study prompt](${base}/${lesson}/agent-prompt)\n- [Human-facing messenger](${base}/${lesson}/chat.html)\n- [Complete plain text](${base}/llms-full.txt)\n`,
  );
  await writeFile(
    path.join(out, "agent.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Для своего агента · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css"></head><body><main class="conversation"><a href="chat.html">← К переписке</a><h1>Разобрать со своим агентом</h1><p>Здесь вся переписка, включая необязательные внутренние чаты, схемы, оба варианта сюжетных сообщений, проверки понимания и первоисточники.</p><ul><li><a href="agent.md">Весь материал в Markdown</a></li><li><a href="story.json">Структурированная история</a></li><li><a href="materials.json">Материалы вымышленного примера</a></li><li><a href="../../glossary.md">Словарь понятий</a></li><li><a href="agent-prompt">Промпт для собственного агента</a></li><li><a href="../../llms.txt">Точка входа llms.txt</a></li></ul><p>Это подготовленный учебный сценарий, а не расшифровка звонка. Персонажи, товары и сроки в истории вымышлены.</p></main></body></html>`,
  );
}
