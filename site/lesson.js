(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    data = JSON.parse($("lesson-data").textContent);
  const chapters = data.chapters,
    byChapter = new Map(chapters.map((c) => [c.id, c])),
    people = new Map(data.characters.map((p) => [p.id, p]));
  const messages = new Map(),
    threads = new Map(),
    questions = new Map();
  for (const c of chapters) {
    for (const e of [...c.intro, ...c.outro])
      messages.set(e.id, { event: e, chapter: c });
    for (const t of c.threads) {
      threads.set(t.id, { thread: t, chapter: c });
      for (const e of t.messages)
        messages.set(e.id, { event: e, chapter: c, thread: t });
    }
    for (const q of c.checks) questions.set(q.id, { question: q, chapter: c });
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    key = "unknowntalks:init-ru:messenger:v4";
  const state = {
    version: 4,
    started: false,
    tracks: [],
    expanded: [],
    collapsed: [],
    choices: {},
    seen: [],
    answers: {},
    pace: "normal",
    timingVersion: 1,
  };
  const known = new Set([
    ...messages.keys(),
    ...chapters.flatMap((c) => [
      c.id + "--heading",
      c.id + "--sent",
      c.id + "--reply",
      c.id + "--supplement",
      c.id + "--choice",
    ]),
  ]);
  let storage = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.version === 4) {
      state.started = saved.started === true;
      for (const field of ["tracks", "expanded", "collapsed", "seen"])
        if (Array.isArray(saved[field]))
          state[field] = [
            ...new Set(
              saved[field].filter(
                (id) =>
                  typeof id === "string" &&
                  (field === "tracks"
                    ? data.tracks.some((t) => t.id === id)
                    : field === "seen"
                      ? known.has(id)
                      : threads.has(id)),
              ),
            ),
          ];
      for (const c of chapters)
        if (
          Number.isInteger(saved.choices?.[c.id]) &&
          c.decision.options[saved.choices[c.id]]
        )
          state.choices[c.id] = saved.choices[c.id];
      for (const [id, { question: q }] of questions)
        if (Array.isArray(saved.answers?.[id]))
          state.answers[id] = saved.answers[id]
            .filter((i) => Number.isInteger(i) && q.options[i] !== undefined)
            .slice(-30);
      // This iteration restores conversational timing once; explicit choices made
      // with the current controls remain persistent afterwards.
      if (
        saved.timingVersion === state.timingVersion &&
        ["normal", "fast", "instant"].includes(saved.pace)
      )
        state.pace = saved.pace;
    }
  } catch {
    /* A damaged saved value starts a fresh conversation. */
  }
  const seen = new Set(state.seen),
    mounted = new Map(),
    parentNodes = new Map(),
    quizSessions = new Map(),
    introduced = new Set();
  // A saved choice places its preceding chapter in history, including text
  // added by a later editorial revision. It must not replay as a new arrival.
  for (const c of chapters)
    if (state.choices[c.id] !== undefined)
      for (const id of [
        c.id + "--heading",
        ...c.intro.map((e) => e.id),
        c.id + "--sent",
        c.id + "--reply",
        ...c.outro.map((e) => e.id),
        c.id + "--supplement",
      ])
        seen.add(id);
  let timer = null,
    busy = null,
    paused = false,
    readAll = false,
    explicitQuiz = false,
    restoring = false,
    readingDepth = 0;
  const unread = new Map();
  const unreadObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pending = unread.get(entry.target);
        if (!pending) continue;
        if (entry.isIntersecting && !document.hidden && !pending.timer)
          pending.timer = setTimeout(() => {
            acknowledge(entry.target);
            updateJump();
          }, 2000);
      }
    },
    { rootMargin: "-90px 0px -60px 0px", threshold: 0.01 },
  );
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function button(label, action, cls = "") {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  }
  let replyGroup = 0;
  function replyComposer(
    labels,
    onSend,
    { quiz = false, prompt = "Ваш ответ" } = {},
  ) {
    const form = el("form", "reply-options" + (quiz ? " quiz-options" : ""));
    const fieldset = el("fieldset", "reply-fieldset");
    fieldset.append(el("legend", "reply-legend", prompt));
    const name = "reply-" + ++replyGroup;
    const send = el("button", "reply-send", "Отправить");
    send.type = "submit";
    send.disabled = true;
    let submitted = false;
    for (const [index, text] of labels.entries()) {
      if (index) {
        const separator = el("div", "reply-separator", "ИЛИ");
        separator.setAttribute("role", "separator");
        separator.setAttribute("aria-label", "или");
        fieldset.append(separator);
      }
      const label = el("label", "reply-choice"),
        input = el("input");
      input.type = "radio";
      input.name = name;
      input.value = String(index);
      input.setAttribute("aria-label", text);
      input.addEventListener("change", () => {
        send.disabled = false;
      });
      label.append(input, el("span", "reply-text", text));
      fieldset.append(label);
    }
    const actions = el("div", "reply-actions");
    actions.append(send);
    form.append(fieldset, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = fieldset.querySelector("input:checked");
      if (!selected || submitted) return;
      if (keepReading(() => onSend(Number(selected.value))) !== false)
        submitted = true;
    });
    form.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        event.target.matches('input[type="radio"]')
      ) {
        event.preventDefault();
        if (!send.disabled) form.requestSubmit();
      }
    });
    return form;
  }
  function paragraph(text) {
    const p = el("p");
    for (const [i, part] of text.split("**").entries()) {
      if (i % 2) p.append(el("strong", "", part));
      else p.append(document.createTextNode(part));
    }
    return p;
  }
  function save() {
    state.seen = [...seen];
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      storage = false;
    }
    $("storage-message").textContent = storage
      ? ""
      : "Браузер не разрешил сохранить прохождение. Здесь оно работает до закрытия страницы.";
  }
  function threadOpen(t) {
    return (
      state.expanded.includes(t.id) ||
      (state.tracks.includes(t.track) && !state.collapsed.includes(t.id))
    );
  }
  function activeQuestion(q) {
    return (
      !q.track ||
      state.tracks.includes(q.track) ||
      q.references.some((id) => {
        const t = messages.get(id)?.thread;
        return t && threadOpen(t);
      })
    );
  }
  function currentTimeline(all = readAll) {
    if (!state.started && !all) return [];
    const events = [];
    for (const c of chapters) {
      events.push(
        { id: c.id + "--heading", type: "heading", chapter: c },
        ...c.intro.map((event, index) =>
          c === chapters[0] && index === 0
            ? { ...event, outgoing: true }
            : event,
        ),
      );
      const selected = c.decision.options[state.choices[c.id]];
      if (!selected && !all) {
        events.push({ id: c.id + "--choice", type: "choice", chapter: c });
        break;
      }
      if (selected)
        events.push(
          {
            id: c.id + "--sent",
            type: "message",
            speaker: "sasha",
            paragraphs: [selected.label],
            time: c.sentTime,
            outgoing: true,
          },
          {
            id: c.id + "--reply",
            type: "message",
            speaker: c.decision.responder,
            paragraphs: [selected.reply],
            time: c.replyTime,
          },
        );
      events.push(...c.outro, {
        id: c.id + "--supplement",
        type: "supplement",
        chapter: c,
      });
      for (const t of c.threads)
        if (threadOpen(t))
          for (const e of t.messages)
            events.push({ ...e, parent: t.id, optional: true });
    }
    return events;
  }
  const coreIds = new Set(
    chapters
      .flatMap((c) => [
        ...c.intro,
        ...c.outro,
        { id: c.id + "--sent" },
        { id: c.id + "--reply" },
      ])
      .map((e) => e.id),
  );
  function updateProgress() {
    const n = [...coreIds].filter((id) => seen.has(id)).length,
      percent = Math.round((n / coreIds.size) * 100);
    $("story-progress").value = percent;
    $("progress-label").textContent = readAll
      ? "Открыта вся переписка"
      : state.started
        ? `Путь по истории · ${percent}%`
        : "История ещё не началась";
    $("progress-open").title = "Открыть дерево навыков";
    $("opening-composer").hidden = state.started || readAll;
    $("return-inline").hidden = !readAll;
    const finished =
      state.started &&
      chapters.every((c) => state.choices[c.id] !== undefined) &&
      seen.has(chapters.at(-1).id + "--supplement");
    $("final-check").hidden = !(finished || readAll || explicitQuiz);
  }
  function nameOf(id) {
    return people.get(id)?.name || id;
  }
  function bubble(event, forwarded = false) {
    const person = people.get(event.speaker),
      node = el(
        "article",
        "message " +
          (event.speaker === "sasha" ? "outgoing" : "incoming") +
          " tone-" +
          (person?.tone || "neutral"),
      );
    node.dataset.speaker = event.speaker;
    node.setAttribute("aria-label", nameOf(event.speaker));
    const meta = el("header", "message-meta");
    const author = el("span", "message-author");
    const avatar = el("span", "avatar", person?.initial || "?");
    avatar.setAttribute("aria-hidden", "true");
    author.append(avatar, el("span", "sender", nameOf(event.speaker)));
    meta.append(author);
    const time = el("time", "", event.time || "");
    meta.append(time);
    node.append(meta);
    if (person && !forwarded && !introduced.has(person.id)) {
      node.append(el("span", "role", person.role));
      introduced.add(person.id);
    }
    meta.querySelector(".sender").title = person?.role || "";
    for (const p of event.paragraphs || []) node.append(paragraph(p));
    return node;
  }
  function diagram(event) {
    const fig = el("figure", "visual visual-" + event.kind);
    fig.setAttribute("aria-label", event.title);
    fig.append(el("figcaption", "", event.title));
    if (event.kind === "table") {
      const table = el("table", "comparison-table");
      table.setAttribute("aria-label", event.title);
      const head = el("thead"),
        header = el("tr"),
        body = el("tbody");
      for (const title of event.columns) {
        const cell = el("th", "", title);
        cell.scope = "col";
        header.append(cell);
      }
      head.append(header);
      for (const item of event.items) {
        const row = el("tr"),
          label = el("th", "", item.label);
        label.scope = "row";
        row.append(label, el("td", "", item.text), el("td", "", item.result));
        body.append(row);
      }
      table.append(head, body);
      fig.append(table, el("p", "small muted", event.caption));
      return fig;
    }
    const items = el("div", "visual-items");
    for (const [i, item] of event.items.entries()) {
      if (typeof item === "string") {
        if (i && ["flow", "cycle", "merge"].includes(event.kind))
          items.append(el("span", "visual-arrow", "→"));
        const part = el("span", "visual-item", item);
        if (event.kind === "tokens")
          part.title = item.startsWith(" ") ? "В начале сохранён пробел" : item;
        items.append(part);
      } else {
        const part = el("div", "visual-pair");
        part.append(el("strong", "", item.label), el("span", "", item.text));
        items.append(part);
      }
    }
    fig.append(items, el("p", "small muted", event.caption));
    return fig;
  }
  function sourceLinks(c) {
    if (!c.sources.length && !c.terms.length) return null;
    const details = el("details", "sources");
    details.append(el("summary", "", "Источники и понятия"));
    const termLinks = el("p", "small");
    for (const [i, id] of c.terms.entries()) {
      if (i) termLinks.append(" · ");
      const t = data.glossary.find((t) => t.id === id);
      if (t) {
        const a = el("a", "", t.title);
        a.href = "../../glossary.html#" + id;
        a.target = "_blank";
        termLinks.append(a);
      }
    }
    if (c.terms.length) details.append(termLinks);
    const ul = el("ul");
    for (const s of c.sources) {
      const li = el("li"),
        a = el("a", "", s.label);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.append(a);
      ul.append(li);
    }
    if (c.sources.length) details.append(ul);
    return details;
  }
  function supplement(c) {
    const node = el("section", "chapter-supplement");
    node.dataset.chapter = c.id;
    for (const t of c.threads) {
      const d = el("details", "internal-thread");
      d.dataset.thread = t.id;
      d.open = threadOpen(t);
      d.classList.add("conversation-thread");
      const summary = threadPreview({
        event: t.messages[0],
        title: `${t.number}. ${t.title}`,
        participants: t.messages
          .filter((message) => message.speaker)
          .map((message) => message.speaker),
      });
      summary.setAttribute("aria-controls", t.id);
      const updateSummary = () => {
        summary.setAttribute("aria-expanded", String(d.open));
        summary.querySelector(".thread-action").textContent = d.open
          ? "Свернуть переписку"
          : countLabel(t.messages.length, [
              "сообщение",
              "сообщения",
              "сообщений",
            ]);
      };
      updateSummary();
      d.append(
        summary,
        el(
          "p",
          "small muted thread-context",
          t.context || `День ${c.day} · Обсуждение внутри команды.`,
        ),
      );
      const body = el("div", "thread-messages");
      body.id = t.id;
      parentNodes.set(t.id, body);
      d.append(body);
      const references = sourceLinks({ terms: [], sources: t.sources || [] });
      if (references) d.append(references);
      if (t.id === "tokens-bpe") {
        const a = el("a", "small", "Проверить текст настоящим токенизатором ↗");
        a.href = "demos/tokens.html";
        a.target = "_blank";
        d.append(a);
      }
      d.addEventListener("toggle", () => {
        updateSummary();
        const desired = threadOpen(t);
        if (d.open === desired) return;
        if (d.open) {
          state.expanded = [...new Set([...state.expanded, t.id])];
          state.collapsed = state.collapsed.filter((id) => id !== t.id);
        } else {
          state.expanded = state.expanded.filter((id) => id !== t.id);
          state.collapsed = [...new Set([...state.collapsed, t.id])];
        }
        save();
        sync();
      });
      node.append(d);
    }
    const check = el("details", "knowledge-check conversation-thread");
    check.dataset.quiz = c.id;
    const qs = c.checks.filter(activeQuestion);
    const summary = threadPreview({
      event: {
        speaker: "nina",
        paragraphs: [
          qs[0]?.question ||
            "Включите дополнительные темы, чтобы открыть вопросы.",
        ],
      },
      title: `Вопросы к разделу ${c.number}`,
      participants: ["nina", "sasha"],
    });
    summary.setAttribute("aria-controls", c.id + "--quiz-body");
    const body = el("div", "quiz-body");
    body.id = c.id + "--quiz-body";
    body.hidden = true;
    check.append(summary, body);
    check.addEventListener("toggle", () =>
      keepReading(() => setQuizOpen(check, check.open)),
    );
    updateQuizToggle(check);
    node.append(check);
    const references = sourceLinks(c);
    if (references) node.append(references);
    return node;
  }
  function countLabel(count, forms) {
    const last = count % 10,
      tail = count % 100;
    return `${count} ${forms[last === 1 && tail !== 11 ? 0 : last >= 2 && last <= 4 && (tail < 12 || tail > 14) ? 1 : 2]}`;
  }
  function threadPreview({ event, title, participants }) {
    const summary = el("summary", "thread-summary");
    summary.setAttribute("aria-expanded", "false");
    const preview = bubble(event, true);
    preview.classList.add("thread-preview");
    const topic = el("p", "thread-topic", title);
    preview.querySelector("header").after(topic);
    const question = [...preview.children].find(
      (node) => node.tagName === "P" && node !== topic,
    );
    question?.classList.add("preview-question");
    const replies = el("span", "thread-replies");
    const avatars = el("span", "thread-avatars");
    avatars.setAttribute("aria-hidden", "true");
    for (const id of [...new Set(participants)]) {
      const person = people.get(id);
      avatars.append(el("span", "avatar tone-" + person.tone, person.initial));
    }
    const label = el("span", "thread-action");
    const arrow = el("span", "thread-chevron", "›");
    arrow.setAttribute("aria-hidden", "true");
    replies.append(avatars, label, arrow);
    preview.append(replies);
    summary.append(preview);
    return summary;
  }
  function updateQuizToggle(check) {
    const qs = byChapter.get(check.dataset.quiz).checks.filter(activeQuestion);
    check.querySelector(".thread-action").textContent = check.open
      ? "Свернуть ответы"
      : countLabel(qs.length, ["вопрос", "вопроса", "вопросов"]) +
        " · Ответить";
    check
      .querySelector("summary")
      .setAttribute("aria-expanded", String(check.open));
    const preview = check.querySelector(".preview-question");
    const question =
      qs[0]?.question || "Включите дополнительные темы, чтобы открыть вопросы.";
    if (preview.textContent !== question) preview.textContent = question;
  }
  function setQuizOpen(check, open) {
    const body = check.querySelector(".quiz-body");
    check.open = open;
    body.hidden = !open;
    updateQuizToggle(check);
    if (open && !quizSessions.has(check.dataset.quiz)) {
      const c = byChapter.get(check.dataset.quiz);
      startQuiz(c.id, c.checks.filter(activeQuestion), body);
    }
  }
  function showChoice(c) {
    return replyComposer(
      c.decision.options.map((option) => option.label),
      (index) => choose(c, index),
      { prompt: "Саша может написать…" },
    );
  }
  function mount(event, mark = true) {
    return keepReading(() => mountNode(event, mark));
  }
  function mountNode(event, mark) {
    if (mounted.has(event.id)) return;
    let node;
    const thread = event.parent && threads.get(event.parent)?.thread;
    if (thread?.messages[0].id === event.id)
      node = parentNodes
        .get(event.parent)
        .closest("details")
        .querySelector(".thread-preview");
    else if (event.type === "heading") {
      node = el("section", "chapter-heading");
      node.dataset.chapter = event.chapter.id;
      const previous = chapters[chapters.indexOf(event.chapter) - 1];
      const newDay = !previous || previous.day !== event.chapter.day;
      if (newDay) node.classList.add("new-day");
      const date = el("div", "day-divider");
      date.append(el("span", "elapsed", event.chapter.elapsed));
      node.append(
        date,
        el("h2", "", `${event.chapter.number}. ${event.chapter.title}`),
      );
    } else if (event.type === "message") node = bubble(event);
    else if (event.type === "narration")
      node = el("p", "narration", event.text);
    else if (event.type === "visual") node = diagram(event);
    else if (event.type === "choice") node = showChoice(event.chapter);
    else if (event.type === "supplement") node = supplement(event.chapter);
    else return;
    node.id = event.id;
    if (!node.isConnected)
      (event.parent ? parentNodes.get(event.parent) : $("messages"))?.append(
        node,
      );
    mounted.set(event.id, node);
    if (
      mark &&
      !readAll &&
      !seen.has(event.id) &&
      event.type === "message" &&
      event.speaker !== "sasha" &&
      !event.optional &&
      !event.outgoing
    )
      markNew(node);
    if (mark && event.type !== "choice") {
      seen.add(event.id);
      save();
    }
    updateProgress();
  }
  function stopTimer() {
    clearTimeout(timer);
    timer = null;
    if (busy) {
      keepReading(() => busy.typing?.remove());
      busy = null;
    }
  }
  function controls() {
    return keepReading(() => {
      const pending = currentTimeline().some((e) => !mounted.has(e.id));
      $("playback-controls").hidden = readAll || (!busy && !paused && !pending);
      $("pause").textContent = paused ? "Продолжить" : "Пауза";
    });
  }
  // Incoming messages never scroll on the reader's behalf. Keep the visible
  // paragraph anchored even when a reply form disappears or a thread above it grows.
  function keepReading(change) {
    if (restoring || readingDepth) return change();
    const candidates = document.querySelectorAll(
      "#messages .message, #messages .chapter-heading, #messages .visual, .quiz-body > .message",
    );
    const anchor = [...candidates].find((node) => {
      const r = node.getBoundingClientRect();
      return r.height && r.bottom > 100 && r.top < innerHeight - 60;
    });
    const y = scrollY,
      top = anchor?.getBoundingClientRect().top;
    // Retain reading space while a large composer is replaced by a short reply.
    // Otherwise the browser clamps scrollY to a temporarily smaller document.
    document.body.style.minHeight = Math.ceil(y + innerHeight) + "px";
    readingDepth++;
    try {
      return change();
    } finally {
      readingDepth--;
      // Measure in document coordinates: a browser may have already adjusted
      // scrollY during layout (including focus-related scrolling).
      const destination =
        anchor?.isConnected && anchor.getClientRects().length
          ? scrollY + anchor.getBoundingClientRect().top - top
          : y;
      if (Math.abs(scrollY - destination) > 0.5)
        window.scrollTo({ top: destination, behavior: "instant" });
      updateJump();
    }
  }
  function markNew(node) {
    if (restoring) return;
    node.classList.add("unread-message");
    const badge = el("span", "unread-label", "Новое");
    node.querySelector("time").before(badge);
    unread.set(node, { timer: null });
    unreadObserver.observe(node);
    updateJump();
  }
  function acknowledge(node) {
    const pending = unread.get(node);
    if (!pending) return;
    clearTimeout(pending.timer);
    unread.delete(node);
    unreadObserver.unobserve(node);
    node.classList.remove("unread-message");
    node.querySelector(".unread-label")?.remove();
  }
  function jumpTarget() {
    const pending = [...unread.keys()].filter((node) => node.isConnected);
    pending.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return (
      pending[0] ||
      [
        ...document.querySelectorAll(
          "#messages .message, #messages > .reply-options, .quiz-body > .message, .quiz-body > .reply-options, .quiz-actions",
        ),
      ]
        .filter((node) => node.getClientRects().length)
        .at(-1)
    );
  }
  function updateJump() {
    for (const [node, pending] of unread)
      if (!node.isConnected) {
        clearTimeout(pending.timer);
        unreadObserver.unobserve(node);
        unread.delete(node);
      }
    const target = jumpTarget(),
      rect = target?.getBoundingClientRect();
    const visible = rect && rect.bottom > 100 && rect.top < innerHeight - 60;
    $("jump").hidden =
      !target || visible || (!unread.size && rect.bottom < innerHeight);
    $("jump").textContent = unread.size
      ? `Новые сообщения · ${unread.size} ${rect?.bottom < 100 ? "↑" : "↓"}`
      : "К последним сообщениям ↓";
    const notice = unread.size ? `Новых сообщений: ${unread.size}` : "";
    if ($("new-message-status").textContent !== notice)
      $("new-message-status").textContent = notice;
  }
  function messageDelay(text) {
    return state.pace === "fast"
      ? Math.min(500, 200 + text.length * 0.4)
      : Math.min(1600, 650 + text.length * 1.4);
  }
  function typingFor(event) {
    const who = event.type === "message" ? nameOf(event.speaker) : null;
    const n = el("div", who ? "typing" : "time-passing");
    if (who) {
      n.append(el("span", "small", who + " печатает"));
      const dots = el("span", "typing-dots");
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i++) dots.append(el("i"));
      n.append(dots);
    } else
      n.textContent = event.type === "heading" ? event.chapter.elapsed : "…";
    $("typing-status").textContent = who
      ? who + " печатает сообщение"
      : n.textContent;
    return n;
  }
  function advance() {
    if (busy || paused || readAll) {
      controls();
      return;
    }
    const event = currentTimeline().find((e) => !mounted.has(e.id));
    if (!event) {
      controls();
      updateProgress();
      updateJump();
      return;
    }
    if (
      seen.has(event.id) ||
      event.type === "choice" ||
      event.type === "supplement" ||
      (event.parent &&
        threads.get(event.parent)?.thread.messages[0].id === event.id) ||
      event.outgoing ||
      state.pace === "instant"
    ) {
      mount(event);
      advance();
      return;
    }
    const target = event.parent ? parentNodes.get(event.parent) : $("messages");
    const typing = typingFor(event);
    keepReading(() => target?.append(typing));
    busy = { event, typing };
    controls();
    const delay =
      event.type === "message"
        ? messageDelay(event.paragraphs.join(" "))
        : state.pace === "fast"
          ? 220
          : event.type === "heading"
            ? 850
            : 400;
    timer = setTimeout(() => {
      keepReading(() => {
        typing.remove();
        busy = null;
        mount(event);
        advance();
      });
    }, delay);
  }
  function refreshCheckFilters() {
    for (const c of chapters) {
      const d = document.querySelector(`[data-quiz="${c.id}"]`);
      if (!d) continue;
      const qs = c.checks.filter(activeQuestion);
      updateQuizToggle(d);
      const session = quizSessions.get(c.id);
      if (
        session &&
        session.qs.map((q) => q.id).join() !== qs.map((q) => q.id).join()
      ) {
        session.active = false;
        clearTimeout(session.timer);
        quizSessions.delete(c.id);
        const body = d.querySelector(".quiz-body");
        body.replaceChildren();
        if (!body.hidden) startQuiz(c.id, qs, body);
      }
    }
  }
  function sync() {
    stopTimer();
    refreshCheckFilters();
    for (const [id, { thread: t }] of threads) {
      const body = parentNodes.get(id);
      if (body) body.closest("details").open = threadOpen(t);
    }
    if (readAll) {
      for (const e of currentTimeline(true)) mount(e, false);
      updateProgress();
      controls();
      return;
    }
    advance();
    updateProgress();
    controls();
  }
  function revealAvailable() {
    stopTimer();
    for (const e of currentTimeline()) if (!mounted.has(e.id)) mount(e);
    controls();
    updateProgress();
  }
  function choose(c, index) {
    if (state.choices[c.id] !== undefined || busy || readAll) return false;
    for (const node of [...unread.keys()]) acknowledge(node);
    state.choices[c.id] = index;
    save();
    mounted.get(c.id + "--choice")?.remove();
    mounted.delete(c.id + "--choice");
    advance();
    return true;
  }
  function clearTranscript() {
    stopTimer();
    for (const q of quizSessions.values()) {
      q.active = false;
      clearTimeout(q.timer);
    }
    mounted.clear();
    parentNodes.clear();
    quizSessions.clear();
    introduced.clear();
    for (const pending of unread.values()) clearTimeout(pending.timer);
    unread.clear();
    unreadObserver.disconnect();
    document.body.style.minHeight = "";
    $("messages").replaceChildren();
    $("final-check-body").replaceChildren();
  }
  function renderRestored() {
    restoring = true;
    clearTranscript();
    for (const e of currentTimeline()) {
      if (readAll || seen.has(e.id)) mount(e, false);
      else break;
    }
    restoring = false;
    sync();
  }
  function forwarded(reference) {
    const entry = messages.get(reference);
    if (!entry) return el("p", "", "Сообщение не найдено.");
    const block = el("blockquote", "forwarded");
    block.append(
      el(
        "p",
        "forward-label",
        "Переслано · " +
          `${entry.chapter.number}. ${entry.chapter.title}` +
          (entry.thread
            ? ` / ${entry.thread.number}. ${entry.thread.title}`
            : ""),
      ),
    );
    const e = entry.event;
    block.append(
      e.type === "message"
        ? bubble(e, true)
        : e.type === "visual"
          ? diagram(e)
          : el("p", "", e.text),
    );
    block.append(
      button(
        "Показать в переписке",
        () => navigate(reference, block),
        "text-button",
      ),
    );
    return block;
  }
  function quizMessage(who, text) {
    return bubble({ speaker: who, paragraphs: [text] }, true);
  }
  function quizIncoming(session, text, done = () => {}) {
    if (session.active === false) return;
    const deliver = () => {
      const node = quizMessage("nina", text);
      session.body.append(node);
      markNew(node);
      done();
    };
    if (state.pace === "instant") {
      keepReading(deliver);
      return;
    }
    const typing = typingFor({ type: "message", speaker: "nina" });
    keepReading(() => session.body.append(typing));
    session.timer = setTimeout(() => {
      if (session.active === false) return;
      keepReading(() => {
        typing.remove();
        deliver();
      });
    }, messageDelay(text));
  }
  function startQuiz(id, qs, body) {
    return keepReading(() => createQuiz(id, qs, body));
  }
  function createQuiz(id, qs, body) {
    const previous = quizSessions.get(id);
    if (previous) {
      previous.active = false;
      clearTimeout(previous.timer);
    }
    if (!qs.length) {
      body.replaceChildren(
        el("p", "", "Включите дополнительные темы, чтобы открыть эти вопросы."),
      );
      return;
    }
    const session = {
      id,
      qs,
      body,
      index: 0,
      active: true,
      inlineFirst: !!body.closest("[data-quiz]"),
    };
    quizSessions.set(id, session);
    body.replaceChildren();
    if (session.inlineFirst) {
      ask(session);
      return;
    }
    quizIncoming(
      session,
      "Буду задавать вопросы по одному. Если ошибётесь, покажу сообщения, к которым стоит вернуться.",
      () => ask(session),
    );
  }
  function ask(session) {
    if (session.index >= session.qs.length) {
      const passed = session.qs.filter(
        (q) => state.answers[q.id]?.at(-1) === q.correct,
      ).length;
      quizIncoming(
        session,
        `На ${passed} из ${session.qs.length} вопросов последний ответ верный. Это результат этой проверки; к объяснениям можно вернуться в любой момент.`,
        () => {
          const actions = el("div", "quiz-actions");
          actions.append(
            button(
              "Пройти ещё раз",
              () => startQuiz(session.id, session.qs, session.body),
              "quiz-next",
            ),
          );
          session.body.append(actions);
        },
      );
      return;
    }
    const q = session.qs[session.index];
    const showOptions = () => {
      const options = replyComposer(
        q.options,
        (i) => {
          const label = q.options[i];

          options.remove();
          session.body.append(quizMessage("sasha", label));
          state.answers[q.id] = [...(state.answers[q.id] || []), i].slice(-30);
          save();
          const correct = i === q.correct;
          quizIncoming(
            session,
            (correct ? "Да. " : "Пока не так. ") + q.explanation,
            () => {
              if (!correct) {
                const f = el("div", "forwards");
                f.append(
                  el(
                    "p",
                    "small muted",
                    "Вот переписка: проблема, попытка и решение.",
                  ),
                );
                for (const ref of q.references) f.append(forwarded(ref));
                session.body.append(f);
              }
              const actions = el("div", "quiz-actions");
              if (!correct)
                actions.append(
                  button(
                    "Попробовать ещё раз",
                    () => {
                      keepReading(() => {
                        actions.remove();
                        ask(session);
                      });
                    },
                    "quiz-retry",
                  ),
                );
              actions.append(
                button(
                  session.index + 1 === session.qs.length
                    ? "Завершить проверку"
                    : "Следующий вопрос",
                  () => {
                    keepReading(() => {
                      actions.remove();
                      session.index++;
                      ask(session);
                    });
                  },
                  "quiz-next",
                ),
              );
              session.body.append(actions);
              renderSkills();
            },
          );
        },
        { quiz: true, prompt: "Выберите ответ" },
      );
      session.body.append(options);
    };
    if (session.inlineFirst && session.index === 0) {
      session.inlineFirst = false;
      showOptions();
    } else quizIncoming(session, q.question, showOptions);
  }
  function hasSeenChapter(id) {
    const c = byChapter.get(id);
    return c && c.outro.some((e) => seen.has(e.id));
  }
  function renderSkills() {
    const active = [...questions.values()]
      .map((x) => x.question)
      .filter(activeQuestion);
    const correct = active.filter(
      (q) => state.answers[q.id]?.at(-1) === q.correct,
    ).length;
    $("skill-summary").textContent =
      `Верные последние ответы: ${correct} из ${active.length} вопросов по выбранным темам.`;
    const draw = (node) => {
      const li = el("li", "skill-node");
      if (node.children) {
        li.append(el("h3", "", node.title));
        const ul = el("ul", "skill-children");
        for (const c of node.children) ul.append(draw(c));
        li.append(ul);
      } else {
        const relevant = active.filter((q) =>
            q.terms.some((t) => node.terms.includes(t)),
          ),
          passed = relevant.filter(
            (q) => state.answers[q.id]?.at(-1) === q.correct,
          ).length;
        const wrong = relevant.some(
          (q) =>
            state.answers[q.id]?.length &&
            state.answers[q.id].at(-1) !== q.correct,
        );
        const encountered = node.chapters.some(hasSeenChapter);
        li.classList.add(
          passed === relevant.length && relevant.length
            ? "checked"
            : wrong
              ? "review"
              : encountered
                ? "encountered"
                : "ahead",
        );
        li.append(
          el("strong", "", node.title),
          el(
            "span",
            "skill-state",
            passed === relevant.length && relevant.length
              ? `Проверено · ${passed}/${relevant.length}`
              : wrong
                ? `Стоит повторить · верно ${passed}/${relevant.length}`
                : encountered
                  ? `Встречалось · проверено ${passed}/${relevant.length}`
                  : "Впереди",
          ),
        );
        const actions = el("div", "skill-actions");
        actions.append(
          button(
            "К объяснению",
            () => {
              $("skills").close();
              navigate(node.chapters[0]);
            },
            "text-button",
          ),
        );
        if (encountered || readAll)
          actions.append(
            button(
              "Проверить",
              () => {
                $("skills").close();
                openSkillQuiz(node, relevant);
              },
              "text-button",
            ),
          );
        li.append(actions);
      }
      return li;
    };
    const root = el("ul", "skill-root");
    for (const child of data.skillTree.children) root.append(draw(child));
    $("skill-tree").replaceChildren(root);
  }
  function chapterOf(target) {
    return (
      byChapter.get(target) ||
      messages.get(target)?.chapter ||
      threads.get(target)?.chapter
    );
  }
  function navigate(raw, returnTo = null) {
    const id = data.aliases[raw] || raw,
      c = chapterOf(id);
    if (!c) return;
    const thread = threads.get(id)?.thread || messages.get(id)?.thread;
    // Existing explanations remain in place, including an open assessment.
    // Future explanations are a preview and do not advance the saved story.
    if (!mounted.has(c.id + "--heading")) {
      stopTimer();
      readAll = true;
      renderRestored();
    }
    if (thread) {
      state.expanded = [...new Set([...state.expanded, thread.id])];
      state.collapsed = state.collapsed.filter((x) => x !== thread.id);
      save();
      const body = parentNodes.get(thread.id);
      if (body) {
        body.closest("details").open = true;
        for (const e of thread.messages)
          mount({ ...e, parent: thread.id, optional: true }, false);
      }
    }
    const target =
      document.getElementById(id) ||
      document.getElementById(c.id + "--heading");
    document.querySelector(".return-question")?.remove();
    if (returnTo?.isConnected && target) {
      const back = button(
        "Вернуться к вопросу",
        () => {
          returnTo.scrollIntoView({ block: "center" });
          back.remove();
        },
        "return-question text-button",
      );
      target.before(back);
    }
    target?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    if (target) acknowledge(target);
    updateJump();
    history.replaceState(null, "", "#" + id);
  }
  function openSkillQuiz(node, qs) {
    explicitQuiz = true;
    $("final-check").hidden = false;
    $("final-check").querySelector("h2").textContent =
      "Проверка ветви: " + node.title;
    startQuiz("skill-" + node.id, qs, $("final-check-body"));
    $("final-check").scrollIntoView({ block: "start" });
  }
  function showDialog(id) {
    if (!$(id).open) $(id).showModal();
  }
  for (const t of data.tracks) {
    const label = el("label", "track"),
      input = el("input");
    input.type = "checkbox";
    input.value = t.id;
    input.checked = state.tracks.includes(t.id);
    input.dataset.track = t.id;
    const span = el("span");
    span.append(el("strong", "", t.title), el("small", "", t.description));
    label.append(input, span);
    $("track-options").append(label);
    input.addEventListener("change", () => {
      state.tracks = input.checked
        ? [...new Set([...state.tracks, t.id])]
        : state.tracks.filter((x) => x !== t.id);
      if (input.checked)
        state.collapsed = state.collapsed.filter(
          (id) => threads.get(id)?.thread.track !== t.id,
        );
      save();
      sync();
    });
  }
  for (const p of data.characters.filter(
    (p) => !["tool", "agent"].includes(p.id),
  )) {
    const item = el("p");
    item.append(
      el("strong", "", p.name + ". "),
      document.createTextNode(p.role),
    );
    $("cast").append(item);
  }
  const draft = bubble(chapters[0].intro[0], true);
  draft.classList.add("opening-draft");
  const send = button(
    "Отправить",
    () => {
      if (state.started) return;
      state.started = true;
      $("preferences").open = false;
      save();
      keepReading(() => {
        const events = currentTimeline();
        mount(events[0]);
        mount(events[1]);
        sync();
      });
      mounted
        .get(chapters[0].intro[0].id)
        .scrollIntoView({ block: "start", behavior: "instant" });
    },
    "reply-send",
  );
  send.id = "start";
  draft.append(
    el("p", "small muted draft-label", "Первое сообщение · от имени Саши"),
    send,
  );
  $("opening-composer").append(draft);
  $("preferences").open = !state.started;
  $("restart-chat").addEventListener("click", () => {
    $("settings").close();
    state.started = false;
    state.choices = {};
    seen.clear();
    state.seen = [];
    readAll = false;
    explicitQuiz = false;
    paused = false;
    save();
    renderRestored();
    renderSkills();
    $("opening-composer").scrollIntoView({
      block: "center",
      behavior: "instant",
    });
  });
  $("preferences-open").addEventListener("click", () => {
    $("preferences").open = !$("preferences").open;
    $("preferences").scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  });
  $("progress-open").addEventListener("click", () => {
    renderSkills();
    showDialog("skills");
  });
  $("settings-open").addEventListener("click", () => showDialog("settings"));
  $("about-open").addEventListener("click", () => showDialog("about"));
  $("reveal-now").addEventListener("click", revealAvailable);
  $("pause").addEventListener("click", () => {
    paused = !paused;
    if (paused) stopTimer();
    else advance();
    controls();
  });
  $("pace").value = state.pace;
  $("pace").addEventListener("change", () => {
    state.pace = $("pace").value;
    save();
    sync();
  });
  $("read-all").addEventListener("click", () => {
    $("settings").close();
    readAll = true;
    renderRestored();
  });
  function returnToChat() {
    $("settings").close();
    readAll = false;
    renderRestored();
    const last = [...mounted.values()].at(-1);
    last?.scrollIntoView({ block: "end" });
  }
  $("back-to-chat").addEventListener("click", returnToChat);
  $("return-inline").addEventListener("click", returnToChat);
  $("all-checks").addEventListener("click", () =>
    startQuiz(
      "all",
      [...questions.values()].map((x) => x.question).filter(activeQuestion),
      $("final-check-body"),
    ),
  );
  for (const b of document.querySelectorAll("[data-close]"))
    b.addEventListener("click", () => b.closest("dialog").close());
  for (const d of document.querySelectorAll("dialog"))
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    });
  $("jump").addEventListener("click", () => {
    const target = jumpTarget();
    if (!target) return;
    for (
      let parent = target.parentElement;
      parent;
      parent = parent.parentElement
    )
      if (parent.matches("[data-quiz]")) setQuizOpen(parent, true);
      else if (parent.matches("details")) parent.open = true;
    // One deliberate move to the FIRST unread message, never a moving bottom.
    // An immediate jump cannot be interrupted by the next incoming message.
    target.scrollIntoView({ block: "start", behavior: "instant" });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    updateJump();
  });
  addEventListener("scroll", updateJump, { passive: true });
  addEventListener("resize", updateJump, { passive: true });
  document.addEventListener("visibilitychange", () => {
    for (const [node, pending] of unread) {
      clearTimeout(pending.timer);
      pending.timer = null;
      unreadObserver.unobserve(node);
      if (!document.hidden) unreadObserver.observe(node);
    }
  });
  document.documentElement.classList.add("reading-chat");
  addEventListener("hashchange", () =>
    navigate(decodeURIComponent(location.hash.slice(1))),
  );
  save();
  renderRestored();
  renderSkills();
  if (location.hash) navigate(decodeURIComponent(location.hash.slice(1)));
})();
