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
  const text = [
    `# ${story.title}`,
    story.subtitle,
    "## Сюжет и границы",
    story.premise.goal,
    story.premise.note,
    "Команда — собирательный персонаж. Реальные открытия происходили в разных исследовательских группах, в том числе параллельно. Порядок истории показывает зависимости, а не буквальную хронологию всех открытий.",
    "## Как читать",
    "Главы идут линейно. Вопросы читателя делят смысловую нагрузку: после проблемы можно выбрать предложение или вопрос, увидеть ответ команды и продолжить. Оба выбора ведут к продолжению; это не экзамен. Разборы «+» необязательны. Отметки изучения читатель ставит сам.",
    `История: ${base}/${lesson}/chat.html`,
    `Структурированный текст: ${base}/${lesson}/story.json`,
    "## Карта знаний",
    ...story.groups.flatMap((group) => [
      `### ${group.title}`,
      group.skill,
      ...group.chapters.map(
        (id) => `- ${story.chapters.find((c) => c.id === id).title}`,
      ),
    ]),
    "## Полный текст",
  ];
  for (const chapter of story.chapters) {
    text.push(`<a id="${chapter.id}"></a>`, `### ${chapter.title}`);
    for (const m of chapter.messages) {
      text.push(m.speaker === "sasha" ? "**Саша**" : "**Команда разработки**");
      for (let i = 0; i < m.paragraphs.length; i++) {
        text.push(m.paragraphs[i]);
        if (
          m.speaker === "team" &&
          i + 1 === chapter.decision.afterTeamParagraph
        )
          text.push(
            "**Вопрос читателю:** " + chapter.decision.prompt,
            ...chapter.decision.options.flatMap((option) => [
              `**Можно спросить:** ${option.label}`,
              `**Команда отвечает:** ${option.reply}`,
            ]),
            "**Команда продолжает**",
          );
      }
    }
    const children = story.extras.filter(
      (extra) => extra.parent === chapter.id,
    );
    if (children.length)
      text.push(
        "Необязательные разборы: " +
          children.map((extra) => `[${extra.title}](#${extra.id})`).join(" · "),
      );
    text.push(
      "**Источники**",
      ...chapter.sources.map((s) => `- [${s.label}](${s.url})`),
    );
  }
  text.push("## Необязательные разборы");
  for (const extra of story.extras)
    text.push(
      `<a id="${extra.id}"></a>`,
      `### ${extra.title}`,
      `К главе: ${story.chapters.find((c) => c.id === extra.parent).title}`,
      ...extra.paragraphs,
      "**Источники**",
      ...extra.sources.map((s) => `- [${s.label}](${s.url})`),
    );
  text.push(
    "## Словарь",
    ...glossary.terms.flatMap((term) => [
      `### ${term.title}`,
      term.definition,
      `Пример: ${term.example}`,
      `Источник: ${term.source}`,
    ]),
    "## Материалы вымышленного примера",
    materials.notice,
    ...materials.materials.flatMap((m) => [`### ${m.title}`, m.text]),
  );
  const markdown = text.join("\n\n") + "\n",
    out = path.join(root, "public", lesson);
  await mkdir(out, { recursive: true });
  await writeFile(
    path.join(out, "story.json"),
    JSON.stringify(story, null, 2) + "\n",
  );
  await writeFile(
    path.join(out, "materials.json"),
    JSON.stringify(materials, null, 2) + "\n",
  );
  await writeFile(
    path.join(root, "public", "glossary.json"),
    JSON.stringify(glossary, null, 2) + "\n",
  );
  await writeFile(path.join(out, "agent.md"), markdown);
  await writeFile(path.join(root, "public", "llms-full.txt"), markdown);
  await writeFile(
    path.join(root, "public", "llms.txt"),
    `# UnknownTalks / init-ru\n\n> Russian narrative: a shopper and a composite research team evolve from manual research to a language-model agent. Fictional products and observations; real primary sources.\n\nSchema v3: chapters contains ordered messages (speaker and paragraphs). basics gives their order; decision.afterTeamParagraph locates an interactive pause; each option contains label and reply. Both options rejoin the narrative. groups describes the skill map. extras contains optional prose branches with parent chapter IDs. Manual browser progress is not evidence of competence.\n\n- [Complete narrative, every branch, glossary and sources](${base}/${lesson}/agent.md)\n- [Structured story](${base}/${lesson}/story.json)\n- [Fictional source fragments](${base}/${lesson}/materials.json)\n- [Glossary](${base}/glossary.md)\n- [Structured glossary](${base}/glossary.json)\n- [Self-study prompt](${base}/${lesson}/agent-prompt)\n- [Interactive story](${base}/${lesson}/chat.html)\n- [Complete plain text](${base}/llms-full.txt)\n`,
  );
  await writeFile(
    path.join(out, "agent.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Для агента · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css"></head><body><main class="document"><a href="chat.html">← К истории</a><h1>Материалы для агента</h1><p>Полный текст разговора Саши с командой, все вопросы и ответы, необязательные разборы, определения и первоисточники.</p><ul><li><a href="agent.md">Весь текст в Markdown</a></li><li><a href="story.json">История и интерактивные паузы в JSON</a></li><li><a href="materials.json">Материалы вымышленного примера</a></li><li><a href="../../glossary.md">Словарь</a></li><li><a href="agent-prompt">Промпт для собственного агента</a></li><li><a href="../../llms.txt">Точка входа llms.txt</a></li></ul><p>Это подготовленный учебный текст, а не расшифровка звонка. Все варианты сценария доступны без авторизации.</p></main></body></html>`,
  );
}
