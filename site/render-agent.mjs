import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function renderAgentView(root) {
  const lesson = "01-foundations/01-from-data-to-agents";
  const base = "https://unknowntalks.github.io/init-ru";
  const story = JSON.parse(
    await readFile(path.join(root, lesson, "story.json"), "utf8"),
  );
  const byId = new Map(story.scenes.map((scene) => [scene.id, scene]));
  const glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
  const termsById = new Map(glossary.terms.map((term) => [term.id, term]));
  const link = (id) => `[${byId.get(id).title}](#${id})`;
  const text = [
    "# Как наши данные из интернета превратились в работу с агентами",
    "Материалы UnknownTalks / init-ru. Язык: русский. Подготовленный материал, не расшифровка звонка.",
    "## Как читать",
    "Начните с основного маршрута. Подтемы необязательны и могут разветвляться на любое число уровней. Темы образуют отдельные деревья; боковых переходов между ними нет. Учебные примеры и расчёты помечены; не выдавайте их за измерения конкретной модели. Первоисточники позволяют проверить исторические числа и условия результатов.",
    `Карта для человека: ${base}/${lesson}/map.html`,
    `Структурированный JSON: ${base}/${lesson}/story.json`,
    `Промпт для самостоятельного разбора: ${base}/${lesson}/agent-prompt`,
    "## Основной маршрут",
    ...story.basics.map((id, index) => `${index + 1}. ${link(id)}`),
    "## Темы и разборы",
  ];
  for (const scene of story.scenes) {
    const children = story.scenes.filter((item) => item.parent === scene.id);
    text.push(
      `<a id="${scene.id}"></a>`,
      `### ${scene.title}`,
      `ID: ${scene.id}. Этап: ${story.chapters.find((chapter) => chapter.id === scene.chapter).title}. Уровень вложенности: ${scene.level}.`,
      scene.parent
        ? `Родительская тема: ${link(scene.parent)}.`
        : "Тема основного маршрута.",
      "#### Задача и пример",
      ...scene.walkthrough,
      "#### Проблема",
      scene.problem,
      "#### Как работает",
      scene.explanation,
      `#### Пример: ${scene.example.title}`,
    );
    for (const step of scene.example.steps)
      text.push(
        `**${step.label}**`,
        step.mono ? `\`\`\`text\n${step.text}\n\`\`\`` : step.text,
      );
    text.push(
      "#### Термины",
      ...scene.terms.map((id) => {
        const term = termsById.get(id);
        return `**${term.title}:** ${term.definition} Пример: ${term.example}`;
      }),
      "#### Факты и источники",
      `**${scene.fact.kind}:** ${scene.fact.text}`,
      scene.factExplanation,
      ...scene.sources.map((source) => `- [${source.label}](${source.url})`),
      `Связь с последующей темой: ${scene.bridge}`,
      children.length
        ? `Подтемы: ${children.map((item) => link(item.id)).join(" · ")}.`
        : "Дочерних тем пока нет.",
      scene.links?.length
        ? `Связанные темы: ${scene.links.map(link).join(" · ")}.`
        : "",
    );
  }
  const markdown = text.filter(Boolean).join("\n\n") + "\n";
  const output = path.join(root, "public", lesson);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "agent.md"), markdown);
  await writeFile(path.join(root, "public", "llms-full.txt"), markdown);
  await writeFile(
    path.join(root, "public", "llms.txt"),
    `# UnknownTalks / init-ru\n\n> Russian-language educational materials about language models and agents. Prepared lesson content, not a transcript.\n\nRead the basic route first; inspect optional branches when needed. Distinguish sourced facts, illustrative calculations and demonstrations. Source URLs are attached to each topic.\n\n## Glossary\n\n- [Terms with definitions and examples](${base}/glossary.md)\n- [Structured glossary](${base}/glossary.json)\n\n## First lesson: From internet data to agents\n\n- [Complete lesson, all card tabs and topic links](${base}/${lesson}/agent.md)\n- [Structured topic graph, basic route and source metadata](${base}/${lesson}/story.json)\n- [Self-study prompt](${base}/${lesson}/agent-prompt)\n- [Human-facing map](${base}/${lesson}/map.html)\n- [Complete text as a plain-text file](${base}/llms-full.txt)\n`,
  );
  await writeFile(
    path.join(output, "agent.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Материалы для агента · UnknownTalks</title><style>body{max-width:760px;margin:60px auto;padding:0 24px;background:#11141c;color:#f4f4f8;font:18px/1.6 system-ui}h1{line-height:1.2}a{color:#6de4d2}li{margin:16px 0}code{font-size:.9em}</style></head><body><a href="map.html">← К карте встречи</a><h1>Материалы для агента</h1><p>Дайте агенту ссылку на полный текст или JSON. Здесь доступны все вкладки карточек, примеры, источники и связи между темами. Читать интерфейс карты или распознавать изображения не нужно.</p><ul><li><a href="agent.md">Вся встреча в Markdown</a> — задачи, механизмы, примеры, термины и факты.</li><li><a href="story.json">Граф тем в JSON</a> — массив <code>basics</code> задаёт основной маршрут, <code>parent</code> — родительскую тему, <code>links</code> оставлен пустым: боковых переходов нет.</li><li><a href="../../llms.txt">Точка входа llms.txt</a> — ссылки на доступные форматы.</li><li><a href="../../llms-full.txt">Полный текст в одном файле</a>.</li><li><a href="agent-prompt">Промпт для самостоятельного разбора</a>.</li></ul><p>Начинайте с основного маршрута; остальные ветки можно изучать по необходимости. Материалы подготовлены для встречи и не являются её расшифровкой. Источники и учебные расчёты помечены отдельно.</p></body></html>`,
  );
}
