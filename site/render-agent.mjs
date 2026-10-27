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
  const byId = new Map(story.scenes.map((scene) => [scene.id, scene])),
    terms = new Map(glossary.terms.map((term) => [term.id, term]));
  const link = (id) => `[${byId.get(id).title}](#${id})`;
  const text = [
    `# ${story.title}`,
    story.subtitle,
    "## Сюжет и границы",
    story.premise.goal,
    story.premise.note,
    "Команда — собирательный персонаж. Реальные подходы развивались разными исследователями и компаниями, в том числе параллельно.",
    "## Как читать",
    "Основная линия линейна. Начните с общего пути, затем проходите проблемы и решения по порядку. Сцены с «+» необязательны и возвращают к основной истории. Различайте учебный сюжет, условные схемы и реальные научные источники.",
    `Форматы: ${base}/${lesson}/formats.html`,
    `Визуальная история: ${base}/${lesson}/story.html`,
    `Структурированный материал: ${base}/${lesson}/story.json`,
    "## Основная линия",
    ...story.basics.map(link),
    "## Полный сценарий",
  ];
  for (const scene of story.scenes) {
    text.push(
      `<a id="${scene.id}"></a>`,
      `### ${scene.title}`,
      scene.optional
        ? `Необязательный разбор. Родитель: ${link(scene.parent)}.`
        : "Основная линия.",
      "#### Саша и ситуация",
      scene.scene,
      "#### Проблема команды",
      scene.problem,
      `#### Попытка: ${scene.attempt.label}`,
      scene.attempt.text,
      scene.attempt.outcome,
      "#### Способы решения",
      ...scene.approaches.map((item) => `**${item.title}.** ${item.text}`),
      "#### Рассмотренное решение",
      scene.solution,
      "#### Пример до решения",
      scene.example.before,
      "#### Пример после решения",
      scene.example.after,
      scene.example.why,
      "#### Наглядная схема",
    );
    if (scene.visual.parts)
      text.push(
        scene.visual.text,
        scene.visual.parts
          .map((part) => `«${part.replaceAll(" ", "␠")}»`)
          .join(" → "),
      );
    if (scene.visual.steps)
      for (const step of scene.visual.steps)
        text.push(
          typeof step === "string"
            ? step
            : `Действие: ${step.action}\n\nНаблюдение: ${step.observation}\n\nСледующий шаг: ${step.decision}`,
        );
    if (scene.visual.items)
      for (const item of scene.visual.items)
        text.push(
          typeof item === "string" ? item : `${item.title}: ${item.sample}`,
        );
    if (scene.visual.note) text.push(scene.visual.note);
    text.push(
      "#### Что важно унести",
      scene.takeaway,
      `Следующий вопрос: ${scene.nextQuestion}`,
    );
    if (scene.check)
      text.push(
        "#### Вопрос для понимания",
        scene.check.question,
        ...scene.check.choices.flatMap((choice) => [
          `Вариант: ${choice.text}`,
          `Разбор: ${choice.feedback}`,
          choice.correct
            ? "Соответствует объяснению."
            : "Не решает указанную проблему.",
        ]),
      );
    if (scene.terms.length)
      text.push(
        "#### Термины",
        ...scene.terms.map((id) => {
          const term = terms.get(id);
          return `**${term.title}:** ${term.definition}\n\nПример: ${term.example}`;
        }),
      );
    text.push(
      "#### Источники",
      ...scene.sources.map((source) => `- [${source.label}](${source.url})`),
    );
    const extras = story.scenes.filter((child) => child.parent === scene.id);
    if (extras.length)
      text.push(
        "Необязательные разборы: " +
          extras.map((child) => link(child.id)).join(" · "),
      );
  }
  text.push(
    "## Материалы вымышленного примера",
    materials.notice,
    ...materials.materials.flatMap((item) => [`### ${item.title}`, item.text]),
  );
  const markdown = text.join("\n\n") + "\n",
    out = path.join(root, "public", lesson);
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "agent.md"), markdown);
  await writeFile(path.join(root, "public", "llms-full.txt"), markdown);
  await writeFile(
    path.join(root, "public", "llms.txt"),
    `# UnknownTalks / init-ru\n\n> Russian educational story: from internet data to language models and agent loops. Fictional shopper and research team; real primary references.\n\nStart with the ordered basics array. Optional scenes have optional=true and a parent. The story contains no live model calls or real shopping recommendations. Do not attribute the composite team's work to one real company.\n\n- [Complete story, examples, questions and references](${base}/${lesson}/agent.md)\n- [Structured scenes, linear order and optional branches](${base}/${lesson}/story.json)\n- [Fictional evidence used by the story](${base}/${lesson}/materials.json)\n- [Glossary](${base}/glossary.md)\n- [Structured glossary](${base}/glossary.json)\n- [Self-study prompt](${base}/${lesson}/agent-prompt)\n- [Human-facing formats](${base}/${lesson}/formats.html)\n- [Complete plain text](${base}/llms-full.txt)\n`,
  );
  await writeFile(
    path.join(out, "agent.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>История для агента · UnknownTalks</title><link rel="stylesheet" href="../../static/lesson.css"></head><body class="formats"><main class="formats-main"><a href="formats.html">← К форматам истории</a><h1>Материалы для агента</h1><p class="lead">Линейная история Саши и исследовательской команды, необязательные «+», примеры, вопросы для понимания и первоисточники. Эти файлы можно дать своему агенту для альтернативного объяснения.</p><ul><li><a href="agent.md">Весь сценарий в Markdown</a></li><li><a href="story.json">Сцены и порядок в JSON</a></li><li><a href="materials.json">Материалы вымышленного примера</a></li><li><a href="../../glossary.md">Термины с примерами</a></li><li><a href="agent-prompt">Промпт для самостоятельного разговора</a></li><li><a href="../../llms.txt">Точка входа llms.txt</a></li></ul><p>Герой, товары и проверки в сюжете вымышлены. Научные источники настоящие. Это подготовленный материал, а не расшифровка звонка. Отметки изучения остаются в браузере и не входят в публичные файлы.</p></main></body></html>`,
  );
}
