(() => {
  const data = JSON.parse(document.getElementById("lesson-data").textContent);
  const $ = (id) => document.getElementById(id);
  const byId = new Map(data.scenes.map((scene) => [scene.id, scene]));
  const terms = new Map(data.glossary.map((term) => [term.id, term]));
  const main = data.basics.map((id) => byId.get(id));
  const aliases = {
    "data-example": "data",
    "prepare-example": "data",
    "learn-example": "training",
    "model-example": "generation",
    "verify-example": "hallucinations",
    "agent-example": "agent",
    "ordinary-question": "human-search",
    "inside-llm": "vectors",
    "instruction-following": "assistant",
    "agent-loop": "agent",
    "why-code-works": "generation",
    execution: "hallucinations",
    "historical-proof": "evidence",
    "signal-not-noise": "data-quality",
    "internet-textbook": "data",
    "learn-representations": "vectors",
    transformer: "attention",
    "bounded-decision": "decisions",
    calibration: "evidence",
    "why-now-decisions": "decisions",
    "beyond-code": "ending",
    "loss-detail": "training",
  };
  const key = "unknowntalks:init-ru:headphones-story:v2";
  let completed = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved))
      completed = new Set(saved.filter((id) => byId.has(id)));
  } catch {}
  const initialHash = location.hash.slice(1),
    requested = byId.has(initialHash) ? initialHash : aliases[initialHash];
  function rootOf(id) {
    let node = byId.get(id);
    while (node?.parent) node = byId.get(node.parent);
    return node || main[0];
  }
  const requestedView = new URLSearchParams(location.search).get("view");
  const initialView = ["story", "dialog", "map"].includes(requestedView)
    ? requestedView
    : /\/dialog(?:\.html)?$/.test(location.pathname)
      ? "dialog"
      : /\/map(?:\.canvas)?(?:\.html)?$/.test(location.pathname)
        ? "map"
        : "story";
  const state = {
    id: rootOf(requested).id,
    view: initialView,
    revealed: false,
    answer: null,
    selfCheck: false,
  };
  const visualState = new Map();
  const sceneTools = document.createElement("div");
  sceneTools.className = "scene-tools";
  $("extras").after(sceneTools);
  sceneTools.append(document.querySelector(".source-details"));
  let detailId = null;
  const esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const children = (id) => data.scenes.filter((scene) => scene.parent === id);
  const subtree = (id) => [
    id,
    ...children(id).flatMap((scene) => subtree(scene.id)),
  ];
  const status = (id) => {
    const ids = subtree(id),
      count = ids.filter((item) => completed.has(item)).length;
    return count === 0
      ? "unstarted"
      : count === ids.length
        ? "done"
        : "partial";
  };
  function saveProgress(id, checked) {
    checked ? completed.add(id) : completed.delete(id);
    try {
      localStorage.setItem(key, JSON.stringify([...completed]));
    } catch {
      $("storage-message").textContent =
        "В этом браузере сохранение недоступно. Отметки останутся до закрытия страницы.";
    }
    updateProgress();
  }
  function updateProgress() {
    const count = main.filter((scene) => completed.has(scene.id)).length;
    $("progress").max = main.length;
    $("progress").value = count;
    $("progress-label").textContent =
      count === 0
        ? "История ещё не отмечена"
        : count === main.length
          ? "Основная история изучена"
          : "Есть изученные сцены";
    $("study").checked = completed.has(state.id);
    for (const node of document.querySelectorAll("[data-study]"))
      node.checked = completed.has(node.dataset.study);
    for (const node of document.querySelectorAll("[data-progress-id]")) {
      const id = node.dataset.progressId;
      const displayStatus = byId.get(id).optional
        ? status(id)
        : completed.has(id)
          ? "done"
          : "unstarted";
      node.dataset.progress = displayStatus;
      node.classList.toggle("node-complete", completed.has(id));
      node.classList.toggle("node-partial", displayStatus === "partial");
    }
  }
  function historyURL(replace = false) {
    const url = new URL(location.href);
    url.searchParams.set("view", state.view);
    url.hash = state.id;
    history[replace ? "replaceState" : "pushState"](
      { id: state.id, view: state.view },
      "",
      url,
    );
  }
  function go(id, { view = state.view, push = true } = {}) {
    const node = byId.get(id);
    if (!node) return;
    if (node.optional) {
      openDetail(id);
      return;
    }
    state.id = id;
    $("route").hidden = true;
    $("route-toggle").setAttribute("aria-expanded", "false");
    document.querySelector(".source-details").open = false;
    state.view = view;
    state.revealed = false;
    state.answer = null;
    state.selfCheck = false;
    if (push) historyURL();
    render();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      $("reader").classList.remove("scene-enter");
      requestAnimationFrame(() => $("reader").classList.add("scene-enter"));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function setView(view) {
    state.view = view;
    historyURL();
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const colors = [
    "#bda8e8",
    "#7dcbb6",
    "#e0b676",
    "#8fb8e3",
    "#d99caf",
    "#a7c581",
  ];
  const icon = (kind) => {
    const lines = {
      text: '<path d="M13 9h24l8 8v36H13zM37 9v10h8M20 28h17M20 36h17M20 44h10"/>',
      table:
        '<rect x="8" y="12" width="46" height="40" rx="3"/><path d="M8 25h46M8 38h46M25 12v40"/>',
      image:
        '<rect x="8" y="10" width="46" height="42" rx="4"/><circle cx="23" cy="23" r="5"/><path d="m12 46 13-12 8 6 10-13 9 19"/>',
      audio:
        '<path d="M7 28v8M15 18v28M23 10v44M31 21v22M39 15v34M47 24v16M55 28v8"/>',
      headphones:
        '<path d="M11 37v-8a21 21 0 0 1 42 0v8M11 29h8v23h-8zM45 29h8v23h-8z"/>',
      mic: '<rect x="24" y="7" width="16" height="31" rx="8"/><path d="M17 29v3a15 15 0 0 0 30 0v-3M32 47v10M23 57h18"/>',
    };
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${lines[kind] || lines.text}</svg>`;
  };
  const card = (title, text, kind = "") =>
    `<div class="graphic-card ${kind}"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const flow = (labels) =>
    `<div class="graphic-flow">${labels.map((label, index) => `${index ? '<span class="flow-arrow">→</span>' : ""}<div class="flow-item">${esc(label)}</div>`).join("")}</div>`;
  const caption = (text) => `<p class="visual-caption">${esc(text)}</p>`;
  const docLink = (id) =>
    `<a class="case-source" href="materials.html#${id}" target="_blank">Посмотреть учебный материал ↗</a>`;
  function visual(scene, revealed) {
    const v = scene.visual,
      s = visualState.get(scene.id) || {
        step: 0,
        attention: "caller",
        review: undefined,
      };
    const controls = (buttons) =>
      `<div class="graphic-controls">${buttons.map(([action, label, disabled = false]) => `<button data-visual="${action}" data-scene="${scene.id}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`).join("")}</div>`;
    const title = (text) => `<div class="visual-title">${esc(text)}</div>`;
    switch (v.kind) {
      case "journey":
        return (
          title("Путь, который мы сейчас раскроем") +
          flow(v.steps) +
          caption(
            "Сначала общая картина. Следующие сцены объясняют, как появилась каждая возможность.",
          )
        );
      case "sound-paths":
        return (
          title("Две разные дороги звука") +
          `<div class="sound-path">${icon("headphones")}<span>Шум вокруг<br>↓<br>Уши Саши</span><span class="sound-arrow">→</span><span>Комфорт слушателя</span></div><div class="sound-path">${icon("mic")}<span>Голос и фон<br>↓<br>Микрофон</span><span class="sound-arrow">→</span><span>Что слышит<br>собеседник</span></div>` +
          caption(
            revealed
              ? "Для звонков ищем подтверждение на второй дороге."
              : "Слово «шум» само по себе ещё не указывает нужную дорогу.",
          )
        );
      case "contrast":
        return (
          title("Сравниваем способы") +
          `<div class="graphic-two">${[v.left, v.right].map((column, i) => `<div class="graphic-stack">${card(column.title, "", i === 0 ? "bad" : "good")}${column.items.map((item) => card(item, "")).join("")}</div>`).join("")}</div>`
        );
      case "data-types":
        return (
          title("Разные формы сохраняют разную информацию") +
          `<div class="data-grid">${v.items.map((item) => `<div class="data-tile">${icon(item.icon)}<strong>${esc(item.title)}</strong><small>${esc(item.sample)}</small></div>`).join("")}</div>` +
          caption(
            "Один тип входа не делает систему способной обрабатывать любые другие сигналы.",
          )
        );
      case "tokens":
        return (
          title("Текст и настоящее разбиение") +
          `<div class="token-input">${esc(v.text)}</div><div class="token-strip">${v.parts.map((part, index) => `<span class="token-chip" style="--chip:${colors[index % colors.length]}">${esc(part).replaceAll(" ", "␠")}</span>`).join("")}</div>` +
          caption(
            "␠ показывает пробел. Фрагменты идут по порядку; при склеивании получается исходный текст. Разбиение получено настоящим токенизатором, а не нарезано на глаз.",
          )
        );
      case "vectors":
        return (
          title("Условная схема числовых представлений") +
          `<div class="vector-row"><span>« для»</span><div class="vector-strip">${colors.map((color, i) => `<i style="background:${color};opacity:${i % 2 ? 0.45 : 0.9}"></i>`).join("")}</div></div><div class="vector-row"><span>« голос»</span><div class="vector-strip">${[
            ...colors,
          ]
            .reverse()
            .map(
              (color, i) =>
                `<i style="background:${color};opacity:${i % 2 ? 0.9 : 0.45}"></i>`,
            )
            .join(
              "",
            )}</div></div><div class="computation-box">Обучаемые преобразования<br>и сведения из контекста</div>` +
          flow(["Обработанные представления", "Оценки следующего токена"]) +
          caption(
            "Полоски обозначают списки чисел. Это не реальные векторы, не карта готовых смыслов и не измерение важности признаков.",
          )
        );
      case "training":
        return (
          title("Учебная задача из самого текста") +
          `<div class="token-input">${esc(v.prompt)} <strong style="color:#b9e6aa">${revealed ? esc(v.target) : "…"}</strong></div>` +
          '<div class="visual-caption">Правильное продолжение берём из исходного текста.</div>' +
          flow(["Предсказание", "Ошибка", "Изменение параметров"]) +
          '<div class="loop-return">↖ Повторить на следующем учебном примере</div>' +
          caption(
            "Фраза показана словами. В модели учебную ошибку считают по токенам.",
          )
        );
      case "attention": {
        const caller = s.attention === "caller";
        return (
          title("Одинаковое слово, разное окружение") +
          `<div class="attention-sentence"><span class="focus">шум</span><span>мешает</span>${caller ? '<span class="linked">собеседнику</span><span class="linked">слышать меня</span>' : '<span class="linked">мне</span><span class="linked">слушать</span>'}</div>` +
          `<div class="computation-box">${caller ? "Нужно учитывать передачу голоса через микрофон" : "Нужно учитывать звук для слушателя"}</div>` +
          controls([
            ["attention-caller", "Про звонок"],
            ["attention-listener", "Про слушателя"],
          ]) +
          caption(
            "Схема показывает роль контекста. Линии смысла не являются измеренными весами attention настоящей модели.",
          )
        );
      }
      case "generation": {
        const step = Math.min(s.step, v.parts.length);
        return (
          title("Проигрыватель цикла LLM") +
          `<div class="weight-lock">Параметры: фиксированы во время этого ответа</div>` +
          `<div class="context-board"><div class="context-note">Контекст: просьба Саши и уже выбранное продолжение.<div class="token-strip">${v.parts.map((part, index) => `<span class="token-chip ${index >= step ? "waiting" : ""}" style="--chip:${colors[index % colors.length]}">${esc(part).replaceAll(" ", "␠")}</span>`).join("")}</div></div></div>` +
          flow(["Контекст", "Модель", "Выбор токена", "Новый контекст"]) +
          '<div class="loop-return">↖ Снова обработать обновлённый контекст</div>' +
          controls([
            [
              "next-token",
              step === v.parts.length
                ? "Фраза завершена"
                : "Добавить следующий токен",
              step === v.parts.length,
            ],
            ["reset-tokens", "Начать заново"],
          ]) +
          caption(
            "Последовательность заранее выбрана для объяснения цикла. Это настоящие границы токенов, но не живой вызов модели и не измеренные вероятности.",
          )
        );
      }
      case "assistant":
        return (
          title("Меняется то, какое поведение поощряют") +
          card("Запрос Саши", "«Помоги выбрать наушники для звонков».") +
          `<div class="flow-arrow" style="text-align:center">↓</div>` +
          (revealed
            ? card(
                "Пример полезного ответа",
                "«Важно, чтобы было тихо вам или чтобы собеседник слышал чистый голос?»",
                "good",
              )
            : card(
                "Похожее продолжение текста",
                "«Наушники для звонков и музыки…»",
                "bad",
              )) +
          caption(
            "Дополнительное обучение меняет поведение, а не выдаёт гарантию истинности каждого ответа.",
          )
        );
      case "evidence-gap":
        return (
          title("Сверяем утверждение и его основание") +
          `<div class="evidence-source">Источник: «приглушает шум для слушателя».</div><div class="evidence-mismatch">Не подтверждает само по себе ↓</div><div class="evidence-claim">${revealed ? "«По этому описанию качество микрофона неизвестно»." : "«Собеседник не будет слышать окружающий шум». "}</div>` +
          docLink("description-a") +
          caption(
            revealed
              ? "Корректный вывод ограничен тем, что действительно известно."
              : "Красивое утверждение может выходить за пределы доступного свидетельства.",
          )
        );
      case "context-desk": {
        const review = s.review === undefined ? revealed : s.review;
        return (
          title("Рабочий стол текущего обращения") +
          `<div class="weight-lock">Обученные параметры: те же</div><div class="context-board"><div class="context-note">Цель: чистый голос для собеседника.</div><div class="context-note">Описание: тихо для слушателя.</div>${review ? '<div class="context-note">Новый отзыв: собеседник слышит клавиатуру.</div>' : ""}</div><div class="computation-box">${review ? "Теперь есть основание отклонить вариант для этих звонков." : "Для вывода о микрофоне пока не хватает сведений."}</div>` +
          controls([
            ["add-review", "Добавить отзыв"],
            ["remove-review", "Убрать отзыв"],
          ]) +
          docLink("review-a") +
          caption(
            "Меняется доступный материал. Это не запускает обучение весов.",
          )
        );
      }
      case "retrieval":
        return (
          title("Сначала найти подходящий материал") +
          flow([
            "Вопрос Саши",
            "Поиск",
            "Подходящий фрагмент",
            "Контекст модели",
          ]) +
          `<div class="graphic-two" style="margin-top:18px">${card("Про внешний вид", "Цвет и оформление устройства.", "muted")}${card("Про звонок", "В записи собеседник слышит клавиатуру.", revealed ? "good" : "")}</div>` +
          `<div class="weight-lock" style="margin-top:18px">Параметры генератора остаются прежними</div>` +
          docLink("review-a")
        );
      case "context-training":
        return (
          title("Сопоставляем два разных изменения") +
          `<div class="graphic-two"><div class="graphic-stack">${card("Контекст", "Новый материал в текущем входе.", "good")}${card("Что меняется", "Доступные сведения, инструкции и примеры запроса.")}${card("У Саши", "Добавили свежий отзыв о микрофоне.")}</div><div class="graphic-stack">${card("Дообучение", "Отдельное изменение параметров.", "good")}${card("Что меняется", "Привычное поведение по выбранной учебной цели.")}${card("У команды", "Есть задача, учебные примеры и оценка результата.")}</div></div>`
        );
      case "tool-call":
        return (
          title("Предложение и исполнение разделены") +
          flow([
            "Модель: запросить страницу",
            "Приложение: вызвать операцию",
            "Инструмент: вернуть результат",
          ]) +
          `<div class="context-board" style="margin-top:20px"><div class="context-note">${s.step || revealed ? "Наблюдение: собеседник слышит клавиатуру." : "Пока есть только предложение открыть обзор."}</div></div>` +
          controls([["run-tool", "Передать запрос приложению"]]) +
          docLink("review-a") +
          caption(
            "Учебная имитация: сайт не открывает магазины и не вызывает внешнюю модель. Показан порядок событий.",
          )
        );
      case "agent-loop": {
        const step = Math.min(s.step, v.steps.length - 1),
          item = v.steps[step];
        return (
          title("Приложение и модель работают по очереди") +
          '<div class="cycle-roles"><span>Модель: следующий шаг</span><b>→</b><span>Приложение: действие</span><b>→</b><span>Наблюдение</span><b>↺</b></div>' +
          `<div class="agent-goal">Цель: обоснованный выбор для чистого голоса собеседнику.</div><div class="agent-step"><div class="role">Действие приложения</div><p>${esc(item.action)}</p><div class="role">Полученное наблюдение</div><p>${esc(item.observation)}</p><div class="role">Следующий шаг с учётом цели</div><p>${esc(item.decision)}</p></div>` +
          controls([
            [
              "agent-next",
              step === v.steps.length - 1
                ? "Предложение готово"
                : v.steps[step + 1].action,
              step === v.steps.length - 1,
            ],
            ["agent-reset", "Вернуться к началу цикла"],
          ]) +
          caption(
            "Наблюдение добавляется к следующему контексту. Параметры не переобучаются от каждого результата. Материалы этого примера вымышлены.",
          ) +
          docLink(
            step === 0
              ? "description-a"
              : step === 1
                ? "review-a"
                : step === 2
                  ? "review-b"
                  : "availability-b",
          )
        );
      }
      case "ending":
        return (
          title("Что получил Саша") +
          `<div class="graphic-two">${card("Раньше", "Сам искать, переносить сведения и замечать подмену требования.", "bad")}${card("Теперь", "Получить объяснимое предложение и нужные подтверждения.", "good")}</div><div class="computation-box">«А что внутри агента можно заменить?»</div>` +
          flow(["Модель", "Контекст и память", "Инструменты", "Управление"]) +
          caption(
            "Это вход в следующую встречу об анатомии агента. Покупку по сценарию подтверждает Саша.",
          )
        );
      case "data-selection":
        return (
          title("Данные оценивают относительно задачи") +
          `<div class="graphic-stack">${card("Помогает изучить различие", "Объяснение, чем звук для слушателя отличается от передачи голоса.", "good")}${card("Может быть лишним для этой цели", "Много копий одного рекламного обещания.", "bad")}${card("Зависит от цели", "Цвет устройства нужен для дизайна, но не подтверждает чистоту микрофона.")}</div>`
        );
      case "history":
        return (
          title("Реальные направления развивались не одной прямой") +
          `<div class="history-line">${v.items.map((item) => `<p>${esc(item)}</p>`).join("")}</div>` +
          caption(
            "Порядок показывает развитие и соединение идей, а не утверждает единственного автора всех компонентов. Первичные публикации — ниже.",
          )
        );
      case "recipe":
        return (
          title("Потребовалось сочетание условий") +
          flow(v.items) +
          caption("Размер одной части не гарантирует полезность всей системы.")
        );
      case "choices":
        return (
          title("Пример ограниченных исходов") +
          `<div class="graphic-stack">${v.items.map((item) => card(item, "")).join("")}</div>` +
          caption("Форма выбора не является гарантией его правильности.")
        );
      case "stop":
        return (
          title("Граница порученной задачи") +
          flow([
            "Подтверждения собраны",
            "Предложение подготовлено",
            "Решение Саши",
          ]) +
          card(
            "Здесь система останавливается",
            "Подготовить покупку не означает автоматически её совершить.",
            "good",
          )
        );
      default:
        throw new Error("Unknown visual " + v.kind);
    }
  }
  function decorate(node, allowed, seen) {
    if (!allowed.length) return;
    const definitions = new Map();
    for (const term of data.glossary.filter((term) =>
      allowed.includes(term.id),
    ))
      for (const alias of term.aliases)
        if (!definitions.has(alias.toLowerCase()))
          definitions.set(alias.toLowerCase(), term);
    const escaped = [...definitions.keys()]
      .sort((a, b) => b.length - a.length)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(
      "(?<![\\p{L}\\p{N}_])(?:" + escaped.join("|") + ")(?![\\p{L}\\p{N}_])",
      "giu",
    );
    const text = node.textContent,
      fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const term = definitions.get(match[0].toLowerCase());
      if (seen.has(term.id)) {
        fragment.append(document.createTextNode(match[0]));
        end = match.index + match[0].length;
        continue;
      }
      seen.add(term.id);
      const button = document.createElement("button");
      button.className = "term-link";
      button.dataset.term = term.id;
      button.textContent = match[0];
      button.title = term.definition;
      fragment.append(button);
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end)));
    node.replaceChildren(fragment);
  }
  function renderSources(scene, node) {
    node.replaceChildren();
    for (const source of scene.sources) {
      const a = document.createElement("a");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.label + " ↗";
      node.append(a);
    }
  }
  function render() {
    const scene = byId.get(state.id),
      position = data.basics.indexOf(scene.id),
      isDialog = state.view === "dialog";
    document.body.className = "mode-" + state.view;
    for (const button of document.querySelectorAll("[data-view]"))
      button.setAttribute(
        "aria-current",
        String(button.dataset.view === state.view),
      );
    $("reader").hidden = state.view === "map";
    $("map-view").hidden = state.view !== "map";
    $("chapter-label").textContent = data.chapters.find(
      (chapter) => chapter.id === scene.chapter,
    ).title;
    $("scene-kicker").textContent =
      position === 0
        ? "Сначала весь путь"
        : "История Саши и исследовательской команды";
    $("scene-title").textContent = scene.title;
    $("scene").textContent = scene.scene;
    $("problem").textContent = scene.problem;
    $("attempt-label").textContent = scene.attempt.label;
    $("attempt-text").textContent = scene.attempt.text;
    $("attempt-outcome").textContent = scene.attempt.outcome;
    $("solution-text").textContent = scene.solution;
    $("approaches").innerHTML = scene.approaches
      .map(
        (item) =>
          `<div class="approach ${item.kind === "limited" ? "limited" : ""}"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div>`,
      )
      .join("");
    $("solution").hidden = !state.revealed;
    $("attempt").hidden = state.revealed;
    $("reveal").hidden = state.revealed || isDialog;
    $("dialog-notice").hidden = !isDialog;
    $("visual").innerHTML = visual(scene, state.revealed);
    $("result-label").textContent = state.revealed
      ? "Что получилось на примере"
      : "Что пока есть";
    $("result").textContent = state.revealed
      ? scene.example.after
      : scene.example.before;
    $("result-why").textContent = state.revealed ? scene.example.why : "";
    $("takeaway").textContent = scene.takeaway;
    $("takeaway").hidden = !state.revealed;
    $("checkpoint").hidden = !(isDialog || state.selfCheck);
    $("check-question").textContent = scene.check.question;
    $("choices").replaceChildren();
    for (const [index, choice] of scene.check.choices.entries()) {
      const button = document.createElement("button");
      button.className = "choice" + (state.answer === index ? " selected" : "");
      button.textContent = choice.text;
      button.dataset.choice = String(index);
      button.setAttribute("aria-pressed", String(state.answer === index));
      $("choices").append(button);
    }
    $("feedback").textContent =
      state.answer === null ? "" : scene.check.choices[state.answer].feedback;
    let toggle = $("self-check");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = "self-check";
      toggle.textContent = "Проверить своё понимание";
      toggle.addEventListener("click", () => {
        state.selfCheck = !state.selfCheck;
        render();
      });
      sceneTools.prepend(toggle);
    }
    toggle.hidden = isDialog || !state.revealed;
    toggle.setAttribute("aria-expanded", String(state.selfCheck));
    $("extras").replaceChildren();
    const optional = children(scene.id);
    if (optional.length) {
      const note = document.createElement("p");
      note.textContent = "＋ По желанию:";
      $("extras").append(note);
      for (const child of optional) {
        const button = document.createElement("button");
        button.className = "extra-link";
        button.textContent = child.title;
        button.dataset.extra = child.id;
        button.dataset.progressId = child.id;
        $("extras").append(button);
      }
    }
    renderSources(scene, $("sources"));
    $("previous").textContent = position
      ? "← " + main[position - 1].title
      : "Начало истории";
    $("previous").disabled = position === 0;
    $("next").textContent =
      position === main.length - 1
        ? "Что будем менять в агенте? →"
        : scene.nextQuestion + " →";
    const seenTerms = new Set();
    for (const id of [
      "scene",
      "problem",
      "solution-text",
      "takeaway",
      "result-why",
    ])
      decorate($(id), scene.terms, seenTerms);
    renderRoute();
    renderMap();
    updateProgress();
  }
  function renderRoute() {
    $("route").replaceChildren();
    for (const scene of main) {
      const button = document.createElement("button");
      button.textContent = scene.title;
      button.dataset.go = scene.id;
      button.dataset.progressId = scene.id;
      button.setAttribute("aria-current", String(scene.id === state.id));
      $("route").append(button);
    }
  }
  function renderMap() {
    $("map-nodes").replaceChildren();
    for (const scene of main) {
      const node = document.createElement("article");
      node.className = "map-node" + (scene.id === state.id ? " current" : "");
      node.dataset.progressId = scene.id;
      node.dataset.node = scene.id;
      const label = document.createElement("span");
      label.textContent = data.chapters.find(
        (chapter) => chapter.id === scene.chapter,
      ).title;
      const button = document.createElement("button");
      button.textContent = scene.title;
      button.dataset.mapGo = scene.id;
      node.append(label, button);
      if (children(scene.id).length) {
        const extra = document.createElement("button");
        extra.className = "extra-link";
        extra.textContent = "＋ Необязательные разборы";
        extra.dataset.extraMenu = scene.id;
        node.append(extra);
      }
      $("map-nodes").append(node);
    }
    if (state.view === "map") requestAnimationFrame(drawMap);
  }
  function drawMap() {
    const svg = $("map-lines");
    svg.replaceChildren();
    const box = $("story-map").getBoundingClientRect(),
      ns = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      return n;
    };
    const defs = el("defs", {}),
      marker = el("marker", {
        id: "spine-arrow",
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto",
      });
    marker.append(el("path", { d: "M0 0 L10 5 L0 10z", fill: "#6a9b8d" }));
    defs.append(marker);
    svg.append(defs);
    const nodes = [...$("map-nodes").children];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1].getBoundingClientRect(),
        b = nodes[i].getBoundingClientRect(),
        same = Math.abs(a.y - b.y) < 5;
      const x1 = (same ? a.right : a.x + a.width / 2) - box.x,
        y1 = (same ? a.y + a.height / 2 : a.bottom) - box.y,
        x2 = (same ? b.left : b.x + b.width / 2) - box.x,
        y2 = (same ? b.y + b.height / 2 : b.top) - box.y;
      svg.append(
        el("path", {
          d: same
            ? `M${x1} ${y1} L${x2} ${y2}`
            : `M${x1} ${y1} C${x1} ${y1 + 18} ${x2} ${y2 - 18} ${x2} ${y2}`,
          fill: "none",
          stroke: "#6a9b8d",
          "stroke-width": 2,
          "marker-end": "url(#spine-arrow)",
        }),
      );
    }
  }
  function openDetail(id) {
    const scene = byId.get(id);
    if (!scene) return;
    detailId = id;
    $("detail-content").innerHTML =
      `<div class="detail-header"><span class="eyebrow">Необязательный разбор · можно вернуться к истории</span><h2>${esc(scene.title)}</h2><label class="study"><input type="checkbox" data-study="${scene.id}">Я разобрался с этим дополнением</label></div><div class="detail-block"><p>${esc(scene.scene)}</p><h3>${esc(scene.problem)}</h3><p>${esc(scene.solution)}</p></div><div class="detail-block visual-column">${visual(scene, true)}</div><div class="detail-block"><h3>Что важно унести</h3><p>${esc(scene.takeaway)}</p></div><div id="detail-children"></div><div class="detail-evidence"></div><button class="primary" data-close-detail>Вернуться к истории</button>`;
    for (const child of children(id)) {
      const button = document.createElement("button");
      button.className = "extra-link";
      button.textContent = child.title;
      button.dataset.extra = child.id;
      button.dataset.progressId = child.id;
      $("detail-children").append(button);
    }
    renderSources(scene, $("detail-content").querySelector(".detail-evidence"));
    updateProgress();
    if (!$("detail").open) $("detail").showModal();
  }
  function extraMenu(id) {
    detailId = null;
    const list = children(id);
    $("detail-content").innerHTML =
      '<div class="detail-header"><span class="eyebrow">Можно оставить на потом</span><h2>Необязательные разборы</h2></div>';
    for (const scene of list) {
      const button = document.createElement("button");
      button.className = "extra-link";
      button.textContent = scene.title;
      button.dataset.extra = scene.id;
      button.dataset.progressId = scene.id;
      button.style.cssText = "display:block;width:100%;margin:12px 0";
      $("detail-content").append(button);
    }
    updateProgress();
    if (!$("detail").open) $("detail").showModal();
  }
  function openTerm(id) {
    const term = terms.get(id);
    if (!term) return;
    $("term-title").textContent = term.title;
    $("term-definition").textContent = term.definition;
    $("term-example").textContent = "Пример: " + term.example;
    $("term-source").href = term.source;
    if (!$("term").open) $("term").showModal();
  }
  function advanceVisual(id, action) {
    const current = visualState.get(id) || {
      step: 0,
      attention: "caller",
      review: undefined,
    };
    if (action === "next-token" || action === "agent-next") current.step++;
    if (action === "reset-tokens" || action === "agent-reset") current.step = 0;
    if (action === "attention-caller") current.attention = "caller";
    if (action === "attention-listener") current.attention = "listener";
    if (action === "add-review") current.review = true;
    if (action === "remove-review") current.review = false;
    if (action === "run-tool") current.step = 1;
    visualState.set(id, current);
    if (detailId === id && $("detail").open) openDetail(id);
    else $("visual").innerHTML = visual(byId.get(state.id), state.revealed);
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view) {
      setView(button.dataset.view);
      return;
    }
    if (button.dataset.go) {
      go(button.dataset.go);
      return;
    }
    if (button.dataset.mapGo) {
      go(button.dataset.mapGo, { view: "story" });
      return;
    }
    if (button.dataset.extra) {
      openDetail(button.dataset.extra);
      return;
    }
    if (button.dataset.extraMenu) {
      extraMenu(button.dataset.extraMenu);
      return;
    }
    if (button.dataset.term) {
      openTerm(button.dataset.term);
      return;
    }
    if (button.dataset.visual) {
      advanceVisual(button.dataset.scene, button.dataset.visual);
      return;
    }
    if (button.dataset.choice !== undefined) {
      state.answer = Number(button.dataset.choice);
      state.revealed = true;
      render();
      return;
    }
    if (button.hasAttribute("data-close-detail")) $("detail").close();
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset.study)
      saveProgress(event.target.dataset.study, event.target.checked);
  });
  $("study").addEventListener("change", (event) =>
    saveProgress(state.id, event.target.checked),
  );
  $("reveal").addEventListener("click", () => {
    state.revealed = true;
    render();
  });
  $("previous").addEventListener("click", () => {
    const position = data.basics.indexOf(state.id);
    if (position > 0) go(main[position - 1].id);
  });
  $("next").addEventListener("click", () => {
    const position = data.basics.indexOf(state.id);
    if (position < main.length - 1) go(main[position + 1].id);
    else {
      detailId = null;
      $("detail-content").innerHTML =
        '<div class="detail-header"><span class="eyebrow">Следующая встреча</span><h2>Анатомия агента</h2></div><p>Саша хочет изменить систему под себя. Разберём, где находятся модель, инструкции, контекст и память, инструменты и управление циклом.</p><div class="graphic-stack">' +
        card(
          "Что хотим улучшить?",
          "Лучше находить подтверждения, помнить нужное или выбирать полезный следующий шаг?",
        ) +
        card(
          "Какая часть за это отвечает?",
          "Сначала различим роли, затем выберем изменение и способ его оценки.",
        ) +
        '</div><p style="margin-top:20px">Это новая задача, с которой начнётся продолжение.</p>';
      $("detail").showModal();
    }
  });
  $("route-toggle").addEventListener("click", () => {
    $("route").hidden = !$("route").hidden;
    $("route-toggle").setAttribute("aria-expanded", String(!$("route").hidden));
  });
  $("detail-close").addEventListener("click", () => $("detail").close());
  $("term-close").addEventListener("click", () => $("term").close());
  $("detail").addEventListener("close", () => {
    detailId = null;
  });
  for (const dialog of [$("detail"), $("term")])
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          dialog.close();
      }
    });
  $("fullscreen").addEventListener("click", () =>
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.(),
  );
  addEventListener("popstate", () => {
    const id = location.hash.slice(1),
      view = new URLSearchParams(location.search).get("view");
    state.id = rootOf(id).id;
    if (["story", "dialog", "map"].includes(view)) state.view = view;
    state.revealed = false;
    state.answer = null;
    state.selfCheck = false;
    render();
    if (byId.get(id)?.optional) openDetail(id);
  });
  addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (!byId.has(id)) return;
    if (byId.get(id).optional) openDetail(id);
    else if (state.id !== id) go(id, { push: false });
  });
  addEventListener("resize", () => {
    if (state.view === "map") requestAnimationFrame(drawMap);
  });
  addEventListener("storage", (event) => {
    if (event.key !== key) return;
    try {
      const value = JSON.parse(event.newValue || "[]");
      completed = new Set(
        Array.isArray(value) ? value.filter((id) => byId.has(id)) : [],
      );
      updateProgress();
    } catch {}
  });
  document.addEventListener("keydown", (event) => {
    if (
      $("detail").open ||
      $("term").open ||
      event.target.closest("input,textarea,button,a")
    )
      return;
    if (event.key === "ArrowRight") $("next").click();
    if (event.key === "ArrowLeft") $("previous").click();
  });
  historyURL(true);
  render();
  if (requested && byId.get(requested)?.optional) openDetail(requested);
})();
