import { writeFile } from "node:fs/promises";
import path from "node:path";
export async function renderGlossary(root) {
  const target = "01-foundations/01-from-data-to-agents/chat.html";
  await writeFile(path.join(root, "public/glossary.html"), `<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Урок · UnknownTalks</title><a href="${target}">Открыть урок</a></html>`);
  await writeFile(path.join(root, "public/glossary.md"), "# Урок\n\nОбъяснения доступны в переписке, сохранённые навыки — в журнале урока.\n");
}
