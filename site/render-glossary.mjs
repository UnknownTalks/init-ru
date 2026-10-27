import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function renderGlossary(root) {
  const glossary = JSON.parse(
    await readFile(path.join(root, "glossary.json"), "utf8"),
  );
  const lesson = "01-foundations/01-from-data-to-agents";
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const cards = glossary.terms
    .map(
      (term) =>
        `<article id="${term.id}" data-search="${esc([term.id, term.title, ...term.aliases, term.definition].join(" ").toLowerCase())}"><h2>${esc(term.title)}</h2><p>${esc(term.definition)}</p><p class="example"><strong>Пример.</strong> ${esc(term.example)}</p><a href="${esc(term.source)}" target="_blank" rel="noopener noreferrer">Источник ↗</a></article>`,
    )
    .join("\n");
  await writeFile(
    path.join(root, "public", "glossary.html"),
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Словарь · UnknownTalks</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0c111a;color:#eef3f7;font:18px/1.6 system-ui}header,main{max-width:1120px;margin:auto;padding:30px 24px}header{position:sticky;top:0;background:#0c111af5;border-bottom:1px solid #344053;backdrop-filter:blur(10px);z-index:2}h1{font-size:30px;margin:18px 0 8px}header p{margin:6px 0 18px;color:#acbbce}a{color:#89ebd5;text-underline-offset:4px}input{width:100%;padding:14px 18px;background:#172130;border:1px solid #667d8e;color:#fff;border-radius:10px;font:inherit}#count{display:block;font-size:14px;color:#acbbce;margin-top:8px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}article{padding:22px;border:1px solid #344053;border-radius:14px;background:#141d2a;scroll-margin-top:260px}article:target{border-color:#89ebd5;box-shadow:0 0 0 2px #89ebd533}article[hidden]{display:none}h2{margin:0 0 16px;font-size:23px}article p{margin:0 0 18px}.example{font-size:16px;color:#bdcde0;background:#1d2a3c;padding:14px;border-radius:8px}article a{font-size:14px}@media(max-width:700px){main{grid-template-columns:1fr}header{padding:16px}h1{font-size:25px}}</style></head><body><header><a href="${lesson}/story.html">← К истории Саши</a><h1>Термины — с примерами</h1><p>Определения из карточек собраны здесь. В истории нажмите на подчёркнутый термин, чтобы получить короткое объяснение. В словаре оставлены понятия о данных, моделях и агентах.</p><input id="search" type="search" aria-label="Найти термин" placeholder="Например: токен, вектор, контекст, агент…"><span id="count"></span></header><main>${cards}</main><script>const input=document.getElementById("search"),cards=[...document.querySelectorAll("article")],count=document.getElementById("count");function search(){const q=input.value.trim().toLowerCase();let n=0;for(const card of cards){card.hidden=!card.dataset.search.includes(q);if(!card.hidden)n++;}count.textContent="Показано: "+n+" из "+cards.length;}input.addEventListener("input",search);search();</script></body></html>`,
  );
  const markdown =
    [
      "# Термины: от данных до агентов",
      ...glossary.terms.flatMap((term) => [
        `## ${term.title}`,
        term.definition,
        `Пример: ${term.example}`,
        `Тема: https://unknowntalks.github.io/init-ru/${lesson}/story.html#${term.topic}`,
        `Источник: ${term.source}`,
      ]),
    ].join("\n\n") + "\n";
  await writeFile(path.join(root, "public", "glossary.md"), markdown);
}
