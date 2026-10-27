import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lesson = "01-foundations/01-from-data-to-agents";
const data = JSON.parse(
  await readFile(path.join(root, lesson, "story.json"), "utf8"),
);
const directory = path.join(root, lesson, "assets/story");
await mkdir(directory, { recursive: true });
const colors = {
  data: "#6de4d2",
  processing: "#f6ce77",
  training: "#bbabff",
  llm: "#a0e39b",
  verification: "#ffb27c",
  agents: "#ffa5c8",
  decisions: "#ffa5c8",
};
const ink = "#f4f4f8",
  muted = "#a6adbd",
  dim = "#687184",
  panel = "#1c202a";
const esc = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const estimate = (s, size, mono) =>
  [...s].reduce(
    (n, c) =>
      n +
      size *
        (mono
          ? 0.61
          : c === " "
            ? 0.27
            : /[il.,:;!|']/u.test(c)
              ? 0.25
              : /[MWШЩЖЮФ]/u.test(c)
                ? 0.83
                : /[A-ZА-Я]/u.test(c)
                  ? 0.65
                  : 0.56),
    0,
  );
function lines(value, width, size, mono = false) {
  if (mono) return String(value).split("\n");
  return String(value)
    .split("\n")
    .flatMap((paragraph) => {
      const result = [];
      let current = "";
      for (const word of paragraph.split(" ")) {
        const next = current ? current + " " + word : word;
        if (current && estimate(next, size, mono) > width * 0.92) {
          result.push(current);
          current = word;
        } else current = next;
      }
      return [...result, current];
    });
}
function text(
  x,
  y,
  value,
  size = 24,
  fill = ink,
  width = 1230,
  weight = 400,
  mono = false,
  leading = 1.35,
) {
  const wrapped = lines(value, width, size, mono);
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" font-family="${mono ? "'SFMono-Regular',Consolas,monospace" : "Inter,'Segoe UI',Arial,sans-serif"}" xml:space="preserve" data-max-width="${width}">${wrapped.map((s, i) => `<tspan x="${x}" dy="${i ? size * leading : 0}">${esc(s)}</tspan>`).join("")}</text>`;
}
const rect = (x, y, w, h, fill = panel, stroke = "#343a48", r = 18) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x, y, x2, y2, color = dim, arrow = true) =>
  `<path d="M${x},${y} L${x2},${y2}" fill="none" stroke="${color}" stroke-width="3" ${arrow ? 'marker-end="url(#arrow)"' : ""}/>`;
function box(x, y, w, h, title, subtitle = "", color = ink) {
  return (
    rect(x, y, w, h) +
    text(x + 24, y + 45, title, 26, color, w - 48, 650) +
    (subtitle ? text(x + 24, y + 91, subtitle, 20, muted, w - 48) : "")
  );
}
function code(x, y, w, rows, title = "PYTHON", size = 25) {
  return (
    rect(
      x,
      y,
      w,
      Math.max(155, rows.length * (size * 1.4) + 67),
      "#0b0e14",
      "#343a48",
    ) +
    text(x + 25, y + 31, title, 13, muted, w - 50, 600) +
    rows
      .map((s, i) =>
        text(
          x + 25,
          y + 72 + i * size * 1.4,
          s,
          size,
          /^\s*(return|def|if|for)/.test(s) ? "#c3b5ff" : ink,
          w - 50,
          400,
          true,
        ),
      )
      .join("")
  );
}
function flow(labels, subtitles = [], color = ink) {
  const gap = 38,
    w = (1232 - gap * (labels.length - 1)) / labels.length,
    y = 350,
    h = 150;
  return labels
    .map((label, i) => {
      const x = 64 + i * (w + gap);
      return (
        box(x, y, w, h, label, subtitles[i] || "", color) +
        (i < labels.length - 1
          ? line(x + w + 5, y + h / 2, x + w + gap - 7, y + h / 2, color)
          : "")
      );
    })
    .join("");
}
function renderFigure(figure, accent) {
  if (figure.kind === "flow")
    return flow(figure.labels, figure.subtitles, accent);
  if (figure.kind === "stats") {
    const width = 386;
    return figure.items
      .map(([value, label], i) => {
        const x = 64 + i * 424;
        const size = value.length > 14 ? 28 : value.length > 9 ? 43 : 62;
        return (
          rect(x, 310, width, 250) +
          text(x + 25, 390, value, size, accent, width - 50, 700) +
          text(x + 25, 488, label, 22, ink, width - 50)
        );
      })
      .join("");
  }
  if (figure.kind === "table") {
    const widths = figure.headers.length === 2 ? [616, 616] : [330, 520, 382];
    let x = 64;
    let output = rect(64, 302, 1232, 260);
    figure.headers.forEach((header, i) => {
      output += text(x + 18, 335, header, 19, accent, widths[i] - 36, 650);
      x += widths[i];
    });
    figure.rows.forEach((row, r) => {
      const y = 378 + r * 67;
      let columnX = 64;
      output += line(80, y - 19, 1280, y - 19, "#343a48", false);
      row.forEach((value, c) => {
        output += text(columnX + 18, y + 13, value, 20, ink, widths[c] - 36);
        columnX += widths[c];
      });
    });
    return output;
  }
  throw new Error("Unknown figure kind: " + figure.kind);
}
function visual(scene, accent) {
  if (scene.figure) return renderFigure(scene.figure, accent);
  if (scene.level === 1 && scene.visual === "pipeline")
    return flow(
      ["Страница", "Содержимое", "Учебные примеры"],
      [
        "меню + текст + код",
        "выбрать и сохранить структуру",
        "отложить отдельную проверку",
      ],
      accent,
    );
  if (scene.level === 1 && scene.visual === "training")
    return flow(
      ["Показать начало", "Предложить продолжение", "Сравнить"],
      ["пример из данных", "ответ модели", "изменить параметры"],
      accent,
    );
  if (scene.level === 1 && scene.visual === "generation")
    return (
      code(
        64,
        307,
        760,
        ["def unique(xs):", "    return list(dict.fromkeys(xs))"],
        "ВОЗМОЖНЫЙ ОТВЕТ НА ЗАПРОС",
        25,
      ) +
      text(900, 350, "Запрос", 30, accent, 350, 650) +
      line(950, 371, 950, 393, accent) +
      text(900, 434, "Модель", 30, ink, 350, 650) +
      line(950, 454, 950, 474, accent) +
      text(900, 515, "Ответ", 30, accent, 350, 650)
    );

  switch (scene.visual) {
    case "question":
      return (
        text(80, 335, "2009", 22, accent, 220, 700) +
        text(80, 390, "Один вопрос.", 47, ink, 700, 700) +
        text(80, 453, "А в нём — спецификация.", 37, muted, 720, 500) +
        box(820, 317, 450, 115, '["b", "a", "b"]', "вход", accent) +
        line(1040, 446, 1040, 467, accent) +
        box(820, 478, 450, 95, '["b", "a"]', "", accent)
      );
    case "corpus":
      return (
        flow(
          ["Вопрос", "Реализация", "Объяснение"],
          ["«убрать повторы»", "dict.fromkeys(xs)", "порядок первых вхождений"],
          accent,
        ) +
        text(
          65,
          558,
          "Связь «что хотели → что сделали → почему это работает».",
          24,
          muted,
          1230,
        )
      );
    case "pipeline":
      return (
        flow(
          ["Извлечь", "Отобрать", "Разделить", "Обучить"],
          [
            "текст и структуру",
            "повторы и шум",
            "train / evaluation",
            "проверить перенос",
          ],
          accent,
        ) +
        text(
          65,
          556,
          "Вопрос из проверки не должен незаметно стать учебным ответом.",
          24,
          muted,
          1230,
        )
      );
    case "rules":
      return (
        code(
          64,
          312,
          610,
          ['if text == "удали повторы":', "    return known_answer"],
          "ПРАВИЛО, НАПИСАННОЕ ЧЕЛОВЕКОМ",
          24,
        ) +
        text(760, 349, "А теперь скажи иначе:", 24, muted, 530) +
        text(
          760,
          405,
          "«Оставь только первые вхождения»",
          29,
          accent,
          500,
          600,
        ) +
        text(760, 514, "Ещё одно правило?", 31, ink, 500, 650)
      );
    case "ngrams":
      return (
        text(64, 331, "Окно короткой истории", 21, muted, 900) +
        ["… сохранить порядок …", "return", "list", "("]
          .map((v, i) =>
            box(
              64 + i * 313,
              365,
              280,
              143,
              v,
              i === 0 ? "за пределами окна" : "продолжение",
              i === 0 ? dim : accent,
            ),
          )
          .join("") +
        text(
          64,
          555,
          "Знакомые соседства помогают. Далёкое условие может потеряться.",
          24,
          muted,
          1230,
        )
      );
    case "representations":
      return (
        box(
          64,
          327,
          430,
          210,
          "Слова → векторы",
          "Похожие контексты дают общие признаки.",
          accent,
        ) +
        line(510, 430, 616, 430, accent) +
        rect(640, 304, 620, 260) +
        text(670, 340, "Условная проекция представлений", 17, muted, 560) +
        [
          ["список", 760, 420],
          ["массив", 920, 390],
          ["последовательность", 810, 490],
        ]
          .map(
            ([s, x, y]) =>
              `<circle cx="${x}" cy="${y}" r="7" fill="${accent}"/>` +
              text(x + 17, y + 7, s, 22, ink, 330),
          )
          .join("")
      );
    case "attention":
      return (
        text(
          65,
          333,
          "Перевести фразу — выбрать полезные связи",
          25,
          muted,
          1200,
        ) +
        ["The", "black", "cat", "slept"]
          .map((s, i) =>
            box(65 + i * 310, 360, 260, 85, s, "", i === 2 ? accent : ink),
          )
          .join("") +
        text(650, 546, "кот", 45, accent, 270, 700) +
        [0, 1, 2, 3]
          .map((i) =>
            line(195 + i * 310, 456, 690, 493, i === 2 ? accent : dim),
          )
          .join("")
      );
    case "parallel":
      return (
        text(65, 332, "Рекуррентная обработка", 22, muted, 530) +
        [0, 1, 2, 3]
          .map(
            (i) =>
              rect(65 + i * 125, 378, 86, 84) +
              text(89 + i * 125, 430, "x" + (i + 1), 26, muted, 66) +
              (i < 3 ? line(157 + i * 125, 420, 183 + i * 125, 420) : ""),
          )
          .join("") +
        text(770, 332, "Параллельно при обучении", 22, accent, 520) +
        [0, 1, 2, 3]
          .map(
            (i) =>
              rect(770 + i * 125, 378, 86, 84) +
              text(794 + i * 125, 430, "x" + (i + 1), 26, accent, 66) +
              line(813 + i * 125, 477, 813 + i * 125, 532, accent),
          )
          .join("") +
        text(
          65,
          556,
          "Генерация следующего токена всё ещё зависит от предыдущих.",
          23,
          muted,
          1230,
        )
      );
    case "scale":
      return (
        ["ДАННЫЕ", "ПАРАМЕТРЫ", "ВЫЧИСЛЕНИЯ"]
          .map(
            (s, i) =>
              rect(65 + i * 430, 340, 370, 200, "#1a1d27", accent) +
              text(90 + i * 430, 391, s, 22, accent, 325, 650) +
              text(
                90 + i * 430,
                445,
                [
                  "что можно выучить",
                  "чем представить связи",
                  "сколько можно обучить",
                ][i],
                26,
                ink,
                310,
                500,
              ),
          )
          .join("") +
        text(
          65,
          575,
          "Нужна совместная работа компонентов, а не один рекордный размер.",
          23,
          muted,
          1230,
        )
      );
    case "training":
      return (
        flow(
          ["Контекст", "Предсказание", "Ошибка"],
          ["предыдущие токены", "сравнить с известным", "обновить параметры"],
          accent,
        ) +
        `<path d="M1130,515 V555 H220 V515" fill="none" stroke="${accent}" stroke-width="3" marker-end="url(#arrow)"/>` +
        text(570, 554, "следующий пример", 20, accent, 420)
      );
    case "tokens": {
      const parts = ["Пр", "ив", "ет", ",", "␠мир", "!"],
        ids = [53645, 26991, 8178, 11, 137144, 0];
      return (
        text(65, 333, "Привет, мир!", 37, ink, 1100, 600) +
        parts
          .map(
            (s, i) =>
              rect(
                65 + i * 207,
                370,
                182,
                135,
                "#1a1d27",
                i % 2 ? "#6de4d2" : accent,
              ) +
              text(
                89 + i * 207,
                421,
                s,
                33,
                i % 2 ? "#6de4d2" : accent,
                135,
                600,
              ) +
              text(
                89 + i * 207,
                476,
                "ID " + ids[i],
                19,
                muted,
                145,
                400,
                true,
              ),
          )
          .join("") +
        text(
          65,
          558,
          "ID → обученный вектор → дальнейшие преобразования модели",
          23,
          muted,
          1230,
        )
      );
    }
    case "architecture":
      return (
        flow(
          ["Embeddings", "Attention", "MLP", "Logits"],
          [
            "ID → векторы",
            "связи в контексте",
            "преобразования",
            "оценки токенов",
          ],
          accent,
        ) +
        text(
          65,
          555,
          "Позиции + причинная маска · повторяющиеся блоки · residual + normalization",
          21,
          muted,
          1230,
        )
      );
    case "generation":
      return (
        code(
          64,
          307,
          760,
          ["def unique(xs):", "    return list(dict.fromkeys(xs))"],
          "ПРИМЕР ПОСЛЕДОВАТЕЛЬНОСТИ",
          26,
        ) +
        text(900, 341, "Контекст", 29, accent, 350, 650) +
        line(955, 362, 955, 383, accent) +
        text(900, 425, "Выбрать токен", 29, ink, 350, 650) +
        line(955, 448, 955, 468, accent) +
        text(900, 510, "Добавить и повторить", 26, accent, 370, 650) +
        text(
          65,
          552,
          "Точная программа здесь иллюстрирует механизм; это не запись ответа модели.",
          21,
          muted,
          1230,
        )
      );
    case "posttraining":
      return (
        box(
          65,
          331,
          550,
          220,
          "Базовая модель",
          "учится продолжать последовательности",
          muted,
        ) +
        line(632, 440, 705, 440, accent) +
        box(
          730,
          331,
          550,
          220,
          "Поведение помощника",
          "учится выполнять запросы по дополнительным сигналам",
          accent,
        )
      );
    case "code":
      return (
        code(
          64,
          307,
          710,
          ["def unique(xs):", "    return list(dict.fromkeys(xs))"],
          "ПРИМЕР ДЛЯ СПИСКА СТРОК",
          25,
        ) +
        text(850, 343, "Синтаксис", 29, accent, 400, 650) +
        text(850, 405, "Повторяемые операции", 26, ink, 430, 600) +
        text(850, 467, "Условия из контекста", 26, ink, 430, 600) +
        text(
          65,
          554,
          "Новое сочетание знакомых механизмов может быть корректной программой.",
          23,
          muted,
          1230,
        )
      );
    case "execution":
      return [
        ['["b", "a", "b"]', '["b", "a"]'],
        ["[]", "[]"],
        ['["x", "x"]', '["x"]'],
      ]
        .map(
          ([a, b], i) =>
            rect(65, 302 + i * 87, 1230, 72) +
            text(90, 349 + i * 87, a, 27, ink, 500, 400, true) +
            line(650, 337 + i * 87, 750, 337 + i * 87, accent) +
            text(810, 349 + i * 87, b, 27, accent, 440, 400, true),
        )
        .join("");
    case "evidence":
      return (
        text(
          70,
          331,
          "HUMANEVAL · ИСТОРИЧЕСКИЙ ЭКСПЕРИМЕНТ 2021",
          17,
          muted,
          1200,
          600,
        ) +
        text(65, 455, "28,8%", 94, accent, 560, 750) +
        text(745, 455, "70,2%", 94, ink, 560, 750) +
        text(70, 514, "pass@1 · одна попытка", 27, muted, 560) +
        text(750, 514, "pass@100 · среди 100 попыток", 25, muted, 540) +
        text(
          65,
          568,
          "Это разные бюджеты поиска. Не «70% надёжности одного ответа».",
          23,
          muted,
          1230,
        )
      );
    case "agent":
      return (
        flow(
          ["Предложить", "Выполнить", "Наблюдать"],
          [
            "модель выбирает шаг",
            "приложение и инструмент",
            "получить результат",
          ],
          accent,
        ) +
        `<path d="M1130,516 V560 H220 V516" fill="none" stroke="${accent}" stroke-width="3" marker-end="url(#arrow)"/>` +
        text(525, 556, "повторить или остановиться", 20, accent, 600)
      );
    case "beyond":
      return (
        flow(
          ["Найти", "Сопоставить", "Проверить"],
          ["источники и документы", "факты и расчёты", "внешний результат"],
          accent,
        ) +
        text(
          65,
          558,
          "Вместо терминала — поиск или таблица. Принцип обратной связи сохраняется.",
          23,
          muted,
          1230,
        )
      );
    case "classification":
      return (
        box(
          65,
          330,
          420,
          210,
          "Вход",
          "текст, изображение или признаки",
          accent,
        ) +
        line(505, 435, 620, 435, accent) +
        box(
          640,
          330,
          640,
          210,
          "Допустимые классы",
          "спам / не спам · выбрать категорию · оценить признак",
          ink,
        )
      );
    case "decision":
      return (
        flow(
          ["Состояние", "Представление", "Оценки", "Выбор"],
          [
            "вход и вопрос",
            "полезные признаки",
            "заданные варианты",
            "результат для кода",
          ],
          accent,
        ) +
        text(
          65,
          556,
          "Общая схема класса подходов, а не реконструкция закрытой архитектуры.",
          23,
          muted,
          1230,
        )
      );
    case "calibration":
      return (
        text(65, 350, "80%", 95, accent, 400, 750) +
        text(65, 416, "не означает «точно верно»", 26, muted, 465) +
        Array.from(
          { length: 20 },
          (_, i) =>
            `<circle cx="${670 + (i % 10) * 61}" cy="${365 + Math.floor(i / 10) * 86}" r="20" fill="${i < 16 ? accent : "#343a48"}"/>`,
        ).join("") +
        text(660, 529, "Иллюстрация: 16 из 20 в большой серии", 24, ink, 620) +
        text(
          65,
          565,
          "Оценка распределения ответов и confidence могут обозначать разные вещи.",
          23,
          muted,
          1230,
        )
      );
    case "two-paths":
      return (
        box(65, 368, 405, 150, "Состояние", "вопрос и контекст", accent) +
        line(490, 442, 690, 354, accent) +
        line(490, 442, 690, 522, accent) +
        box(
          710,
          300,
          570,
          120,
          "Генерировать",
          "последовательность текста или кода",
          ink,
        ) +
        box(
          710,
          466,
          570,
          120,
          "Выбирать",
          "допустимый ответ с оценкой",
          accent,
        )
      );
    default:
      throw new Error("Unknown visual: " + scene.visual);
  }
}
const expected = new Set();
const depthNames = {
  1: "Пример / основы",
  2: "Принцип",
  3: "Детали реализации",
  4: "Разбор вычисления",
};
function caption(scene, index) {
  return `### ${depthNames[scene.level]} · ${scene.title}\n\n${scene.explanation}\n\n**Следующий вопрос:** ${scene.bridge}\n\n${scene.sources.map((source) => `[${source.label}](${source.url})`).join(" · ")}`;
}
for (const [index, scene] of data.scenes.entries()) {
  const chapter = data.chapters.find((c) => c.id === scene.chapter),
    accent = colors[scene.chapter];
  const filename = `${String(index + 1).padStart(2, "0")}-${scene.id}.svg`;
  expected.add(filename);
  const factText = `${scene.fact.kind} · ${scene.fact.text}`;
  const factSize = lines(factText, 1225, 17).length > 1 ? 15 : 17;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="900" viewBox="0 0 1360 900" role="img" aria-labelledby="title desc"><title id="title">${esc(scene.title)}</title><desc id="desc">${esc([scene.question, scene.idea, scene.result, scene.bridge].join(" "))}</desc><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="${accent}"/></marker></defs>${rect(1, 1, 1358, 898, "#11141c", "#343a48", 28)}${text(64, 42, "UNKNOWN TALKS / INIT-RU", 14, muted, 750, 650)}${text(64, 77, chapter.title + "  /  " + depthNames[scene.level], 17, accent, 1160, 650)}${text(1230, 77, "L" + scene.level, 22, accent, 70, 650)}${text(64, 137, scene.title, 40, ink, 1225, 700, false, 1.2)}${text(64, 200, factText, factSize, accent, 1225, 500, false, 1.1)}${text(64, 245, scene.question, 24, ink, 1225, 400, false, 1.25)}${visual(scene, accent)}${line(64, 588, 1296, 588, "#343a48", false)}${text(64, 618, "КАК ЭТО РАБОТАЕТ", 13, accent, 570, 650)}${text(64, 652, scene.idea, 23, ink, 575, 400, false, 1.3)}${text(710, 618, "РАЗБОР ПРИМЕРА / РЕЗУЛЬТАТ", 13, accent, 580, 650)}${text(710, 652, scene.result, 23, ink, 580, 400, false, 1.3)}${text(64, 795, "СЛЕДУЮЩИЙ ВОПРОС", 13, muted, 1225, 650)}${text(64, 829, scene.bridge, 21, muted, 1225, 400, false, 1.3)}</svg>`;
  await writeFile(path.join(directory, filename), svg + "\n");
  const explanationName = filename.replace(/\.svg$/, "-explanation.svg");
  expected.add(explanationName);
  const explanationSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="900" viewBox="0 0 1360 900" role="img" aria-labelledby="title"><title id="title">${esc(scene.title)} — объяснение</title>${rect(1, 1, 1358, 898, "#11141c", "#343a48", 28)}${text(64, 42, "UNKNOWN TALKS / INIT-RU", 14, muted, 750, 650)}${text(64, 77, chapter.title + " / " + depthNames[scene.level] + " / пояснение", 17, accent, 1160, 650)}${text(64, 137, scene.title, 40, ink, 1225, 700)}${text(64, 200, factText, factSize, accent, 1225, 500, false, 1.1)}${text(64, 272, "ЧТО ЭТО ЗНАЧИТ И КАК СВЯЗАНО С ПРИМЕРОМ", 14, accent, 1225, 650)}${text(64, 326, scene.explanation, 26, ink, 1225, 400, false, 1.5)}${line(64, 756, 1296, 756, "#343a48", false)}${text(64, 795, "СЛЕДУЮЩИЙ ВОПРОС", 13, muted, 1225, 650)}${text(64, 829, scene.bridge, 21, muted, 1225, 400, false, 1.3)}</svg>`;
  await writeFile(path.join(directory, explanationName), explanationSvg + "\n");
}
// Remove only obsolete files produced by this generator.
for (const entry of await readdir(directory))
  if (/^\d{2}-[a-z0-9-]+\.svg$/.test(entry) && !expected.has(entry))
    await rm(path.join(directory, entry));

// The upper row is the complete basic route. Lower bands increase depth.
// Rebuilding assets later preserves the presenter's manually edited positions.
const canvasPath = path.join(root, lesson, "map.canvas");
if (process.argv.includes("--layout")) {
  const nodes = [],
    edges = [],
    levels = [...new Set(data.scenes.map((s) => s.level))].sort();
  const bandY = new Map();
  let offset = 0;
  for (const level of levels) {
    bandY.set(level, offset);
    const rows = Math.max(
      ...data.chapters.map((c) =>
        Math.ceil(
          data.scenes.filter((s) => s.chapter === c.id && s.level === level)
            .length / 2,
        ),
      ),
    );
    offset += Math.max(1, rows) * 1500;
  }
  for (const [column, chapter] of data.chapters.entries()) {
    const stageScenes = data.scenes.filter((s) => s.chapter === chapter.id),
      baseX = column * 3200;
    nodes.push({
      id: "group-" + chapter.id,
      type: "group",
      x: baseX - 50,
      y: -120,
      width: 3000,
      height: offset + 120,
      label: chapter.title + " · → этап / ↓ глубина",
      color: chapter.color,
    });
    for (const level of levels) {
      const row = stageScenes.filter((s) => s.level === level);
      for (const [i, scene] of row.entries()) {
        const index = data.scenes.indexOf(scene),
          x = baseX + (level === 1 ? 750 : (i % 2) * 1500),
          y = bandY.get(level) + Math.floor(i / 2) * 1500;
        nodes.push({
          id: scene.id,
          type: "file",
          x,
          y,
          width: 1360,
          height: 900,
          file: `${lesson}/assets/story/${String(index + 1).padStart(2, "0")}-${scene.id}.svg`,
          color: chapter.color,
        });
        nodes.push({
          id: scene.id + "-sources",
          type: "text",
          x,
          y: y + 930,
          width: 1360,
          height: 450,
          text: caption(scene, index),
        });
        if (scene.parent)
          edges.push({
            id: "depth-" + scene.id,
            fromNode: scene.parent,
            fromSide: "bottom",
            toNode: scene.id,
            toSide: "top",
            label: "глубже: " + scene.title,
            color: chapter.color,
          });
      }
    }
  }
  for (let i = 1; i < data.basics.length; i++)
    edges.push({
      id: "basic-" + i,
      fromNode: data.basics[i - 1],
      fromSide: "right",
      toNode: data.basics[i],
      toSide: "left",
      label: "дальше по основам",
      color: "5",
    });
  await writeFile(canvasPath, JSON.stringify({ nodes, edges }, null, 2) + "\n");
} else {
  const canvas = JSON.parse(await readFile(canvasPath, "utf8"));
  let changed = false;
  for (const [index, scene] of data.scenes.entries()) {
    const note = canvas.nodes.find((n) => n.id === scene.id + "-sources");
    const value = caption(scene, index);
    if (note && note.text !== value) {
      note.text = value;
      changed = true;
    }
  }
  if (changed)
    await writeFile(canvasPath, JSON.stringify(canvas, null, 2) + "\n");
}
console.log(
  `Rendered ${data.basics.length} basics and ${data.scenes.length - data.basics.length} optional details.`,
);
