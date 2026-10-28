(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    data = JSON.parse($("lesson-data").textContent);
  const chapters = data.chapters,
    byChapter = new Map(chapters.map((c) => [c.id, c])),
    people = new Map(data.characters.map((p) => [p.id, p]));
  const chapterGroups = data.chapterGroups.map((g, i) => ({
    ...g,
    number: i + 1,
    scenes: g.chapters.map((id) => byChapter.get(id)),
    checks: g.chapters.flatMap((id) => byChapter.get(id).checks),
  }));
  const groupByScene = new Map(
      chapterGroups.flatMap((g) => g.scenes.map((c) => [c.id, g])),
    ),
    byQuizGroup = new Map(chapterGroups.map((g) => [g.id, g]));
  const messages = new Map(),
    threads = new Map(),
    questions = new Map();
  for (const c of chapters) {
    for (const e of [...c.intro, ...c.outro]) indexEvent(e, { chapter: c });
    for (const t of c.threads) {
      threads.set(t.id, { thread: t, chapter: c });
      for (const e of t.messages) indexEvent(e, { chapter: c, thread: t });
    }
    for (const q of c.checks) questions.set(q.id, { question: q, chapter: c });
  }
  function indexEvent(event, context) {
    messages.set(event.id, { event, ...context });
    for (const attachment of event.attachments || [])
      indexEvent(attachment, context);
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
    key = "unknowntalks:init-ru:messenger:v4";
  const state = {
    version: 4,
    started: false,
    storyComplete: false,
    tracks: [],
    expanded: [],
    collapsed: [],
    choices: {},
    seen: [],
    answers: {},
    chapterAnswers: {},
    encountered: [],
    encounteredVersion: 1,
    finalExam: {
      revision: data.assessmentRevision,
      status: "idle",
      answers: {},
    },
    pace: "normal",
    timingVersion: 1,
  };
  const known = new Set([
    ...messages.keys(),
    ...[...threads.keys()].map((id) => id + "--thread"),
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
      state.storyComplete =
        saved.storyComplete === true ||
        (Array.isArray(saved.seen) &&
          saved.seen.includes(chapters.at(-1).id + "--supplement"));
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
      for (const [id, { question: q }] of questions) {
        const answer = saved.chapterAnswers?.[id] ?? state.answers[id]?.at(-1);
        if (Number.isInteger(answer) && q.options[answer] !== undefined)
          state.chapterAnswers[id] = answer;
      }
      const previousEncounters =
        saved.encounteredVersion === 1 ? saved.encountered : saved.seen;
      if (Array.isArray(previousEncounters))
        state.encountered = [
          ...new Set(
            previousEncounters.filter((id) => {
              const entry = messages.get(id);
              return (
                entry?.event.type === "message" &&
                (saved.encounteredVersion === 1 ||
                  !entry.thread ||
                  state.expanded.includes(entry.thread.id) ||
                  state.collapsed.includes(entry.thread.id))
              );
            }),
          ),
        ];
      if (saved.finalExam?.revision === data.assessmentRevision) {
        const answers = {};
        for (const [id, { question: q }] of questions) {
          const answer = saved.finalExam.answers?.[id];
          if (!Number.isInteger(answer) || q.options[answer] === undefined)
            break;
          answers[id] = answer;
        }
        const complete = Object.keys(answers).length === questions.size;
        state.finalExam = {
          revision: data.assessmentRevision,
          status: complete
            ? "complete"
            : saved.finalExam.status === "active" || Object.keys(answers).length
              ? "active"
              : "idle",
          answers,
        };
      }
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
  state.tracks = data.tracks.map((track) => track.id);
  const encountered = new Set(state.encountered);
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
        ...(c === chapters.at(-1) && !state.storyComplete
          ? []
          : [...c.outro.map((e) => e.id), c.id + "--supplement"]),
        ...c.threads.flatMap((t) => [
          t.id + "--thread",
          ...t.messages.map((e) => e.id),
        ]),
      ])
        seen.add(id);
  let timer = null,
    busy = null,
    paused = false,
    readAll = false,
    restoring = false,
    readingDepth = 0;
  const encounterObserver = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const entry of entries)
        if (
          entry.isIntersecting &&
          entry.target.isConnected &&
          !document.hidden &&
          !encountered.has(entry.target.id)
        ) {
          encountered.add(entry.target.id);
          changed = true;
        }
      if (changed) {
        save();
        if ($("skills").open) renderSkills();
      }
    },
    { rootMargin: "-80px 0px -40px 0px", threshold: 0.1 },
  );
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
    const fieldset = el("fieldset", "reply-fieldset action-cue");
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
        fieldset.classList.remove("action-cue");
        send.classList.add("action-cue");
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
      if (keepReading(() => onSend(Number(selected.value))) !== false) {
        submitted = true;
        fieldset.classList.remove("action-cue");
        send.classList.remove("action-cue");
      }
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
  function infoTrigger(label, cls, action) {
    const trigger = el("span", cls, label);
    trigger.tabIndex = 0;
    trigger.setAttribute("role", "button");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", () => {
      if (!getSelection()?.isCollapsed) return;
      trigger.focus({ preventScroll: true });
      action();
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        action();
      }
    });
    return trigger;
  }
  function showTerm(term) {
    $("term-title").textContent = term.title;
    $("term-definition").textContent = term.definition;
    $("term-example").textContent = term.example;
    $("term-source").href = term.source;
    $("term-glossary").href = "../../glossary.html#" + term.id;
    showDialog("term-info");
  }
  function termTrigger(term, label = term.title) {
    const trigger = infoTrigger(label, "term-ref", () => showTerm(term));
    trigger.dataset.term = term.id;
    trigger.title = term.definition;
    trigger.setAttribute("aria-label", "Термин: " + term.title);
    return trigger;
  }
  function showPerson(person) {
    $("person-name").textContent = person.name;
    $("person-handle").textContent = "@" + person.handle;
    $("person-role").textContent = person.role;
    $("person-description").textContent = person.description || "";
    showDialog("person-info");
  }
  function richText(node, text) {
    let cursor = 0;
    for (const match of text.matchAll(/@[a-z0-9_]+(?:\.[a-z0-9_]+)*/gi)) {
      node.append(text.slice(cursor, match.index));
      const person = data.characters.find(
        (person) => "@" + person.handle === match[0],
      );
      if (person) {
        const mention = infoTrigger(match[0], "mention", () =>
          showPerson(person),
        );
        mention.dataset.person = person.id;
        mention.title = person.role;
        node.append(mention);
      } else node.append(match[0]);
      cursor = match.index + match[0].length;
    }
    node.append(text.slice(cursor));
  }
  function paragraph(text) {
    const p = el("p");
    for (const [i, part] of text.split("**").entries()) {
      if (i % 2) {
        const strong = el("strong");
        const term = data.glossary.find((term) =>
          [term.title, ...term.aliases].some(
            (name) =>
              name.toLocaleLowerCase("ru") === part.toLocaleLowerCase("ru"),
          ),
        );
        if (term) strong.append(termTrigger(term, part));
        else richText(strong, part);
        p.append(strong);
      } else richText(p, part);
    }
    return p;
  }
  function save() {
    state.seen = [...seen];
    state.encountered = [...encountered];
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
    return state.expanded.includes(t.id) && !state.collapsed.includes(t.id);
  }
  function currentTimeline(all = readAll) {
    if (!state.started && !all) return [];
    const events = [];
    const addMessages = (t) => {
      if (threadOpen(t))
        for (const e of t.messages)
          events.push({ ...e, parent: t.id, optional: true });
    };
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
        events.push({
          id: c.id + "--sent",
          type: "message",
          speaker: "sasha",
          paragraphs: [selected.label],
          time: c.sentTime,
          outgoing: true,
        });
      for (const t of c.threads.filter((t) => t.placement === "before-reply")) {
        events.push({
          id: t.id + "--thread",
          type: "thread",
          chapter: c,
          thread: t,
        });
        addMessages(t);
      }
      if (selected)
        events.push({
          id: c.id + "--reply",
          type: "message",
          speaker: c.decision.responder,
          paragraphs: [selected.reply],
          time: c.replyTime,
        });
      events.push(...c.outro, {
        id: c.id + "--supplement",
        type: "supplement",
        chapter: c,
      });
      for (const t of c.threads.filter((t) => t.placement !== "before-reply"))
        addMessages(t);
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
  function storyFinished() {
    return (
      state.started &&
      chapters.every((c) => state.choices[c.id] !== undefined) &&
      state.storyComplete
    );
  }
  function chapterReached(c) {
    return seen.has(c.id + "--heading") || state.choices[c.id] !== undefined;
  }
  function updateProgress() {
    const n = [...coreIds].filter((id) => seen.has(id)).length,
      percent = Math.round((n / coreIds.size) * 100);
    $("story-progress").value = percent;
    $("progress-label").textContent = state.started
      ? `История · ${percent}%`
      : "История ещё не началась";
    $("opening-composer").hidden = state.started || readAll;
    $("return-inline").hidden = !readAll;
    $("final-check").hidden = !(storyFinished() || readAll);
    updateFinalControls();
    updateTimeline();
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
    const sender = person
      ? infoTrigger(person.name, "sender", () => showPerson(person))
      : el("span", "sender", nameOf(event.speaker));
    author.append(avatar, sender);
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
    for (const attachment of event.attachments || []) {
      const figure = diagram(attachment);
      if (!forwarded) figure.id = attachment.id;
      figure.classList.add("message-attachment");
      node.append(figure);
    }
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
    const references = el("div", "source-block");
    if (c.terms.length) {
      const terms = el("section", "term-set");
      terms.setAttribute("aria-label", "Термины этого разговора");
      terms.append(el("p", "small muted", "Термины этого разговора"));
      const list = el("div", "term-chips");
      for (const id of c.terms) {
        const term = data.glossary.find((term) => term.id === id);
        if (term) list.append(termTrigger(term));
      }
      terms.append(list);
      references.append(terms);
    }
    if (c.sources.length) {
      const details = el("details", "sources");
      details.append(el("summary", "", "Источники"));
      const list = el("ul");
      for (const source of c.sources) {
        const li = el("li"),
          link = el("a", "", source.label);
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        li.append(link);
        list.append(li);
      }
      details.append(list);
      references.append(details);
    }
    return references;
  }
  function threadPanel(c, t) {
    const panel = el("section", "internal-thread conversation-thread");
    panel.dataset.thread = t.id;
    panel.dataset.chapter = c.id;
    const preview = threadPreview({
      event: t.messages[0],
      title: t.title,
      participants: t.messages
        .filter((message) => message.speaker)
        .map((message) => message.speaker),
    });
    const toggle = preview.querySelector(".thread-toggle");
    toggle.setAttribute("aria-controls", t.id + "--content");
    const content = el("div", "thread-content");
    content.id = t.id + "--content";
    content.append(
      el(
        "p",
        "small muted thread-context",
        t.context || `День ${c.day} · Обсуждение внутри команды.`,
      ),
    );
    const body = el("div", "thread-messages");
    body.id = t.id;
    parentNodes.set(t.id, body);
    content.append(body);
    const references = sourceLinks({
      terms: t.terms || [],
      sources: t.sources || [],
    });
    if (references) content.append(references);
    if (t.id === "tokens-bpe") {
      const a = el("a", "small", "Проверить текст настоящим токенизатором ↗");
      a.href = "demos/tokens.html";
      a.target = "_blank";
      content.append(a);
    }
    panel.append(preview, content);
    setThreadView(panel, threadOpen(t));
    toggle.addEventListener("click", () =>
      keepReading(() => {
        const open = panel.dataset.open !== "true";
        state.expanded = open
          ? [...new Set([...state.expanded, t.id])]
          : state.expanded.filter((id) => id !== t.id);
        state.collapsed = open
          ? state.collapsed.filter((id) => id !== t.id)
          : [...new Set([...state.collapsed, t.id])];
        setThreadView(panel, open);
        save();
        sync();
      }),
    );
    return panel;
  }
  function setThreadView(panel, open) {
    const t = threads.get(panel.dataset.thread).thread;
    panel.dataset.open = String(open);
    panel.querySelector(".thread-content").hidden = !open;
    panel
      .querySelector(".thread-toggle")
      .setAttribute("aria-expanded", String(open));
    panel.querySelector(".thread-action").textContent = open
      ? "Свернуть переписку"
      : countLabel(t.messages.length, ["сообщение", "сообщения", "сообщений"]);
  }
  function supplement(c) {
    const node = el("section", "chapter-supplement");
    node.dataset.chapter = c.id;
    for (const t of c.threads.filter((t) => t.placement !== "before-reply"))
      node.append(threadPanel(c, t));
    const group = groupByScene.get(c.id);
    if (group.scenes.at(-1) === c && group.checks.length) {
      const check = el("section", "knowledge-check conversation-thread");
      check.dataset.quiz = group.id;
      check.dataset.open = "false";
      const preview = threadPreview({
        event: {
          speaker: "nina",
          paragraphs: [group.checks[0].question],
        },
        title: `Вопросы к главе ${group.number} · ${group.title}`,
        participants: ["nina", "sasha"],
      });
      const toggle = preview.querySelector(".thread-toggle");
      toggle.setAttribute("aria-controls", group.id + "--quiz-body");
      const body = el("div", "quiz-body");
      body.id = group.id + "--quiz-body";
      body.hidden = true;
      check.append(preview, body);
      toggle.addEventListener("click", () =>
        keepReading(() => setQuizOpen(check, body.hidden)),
      );
      updateQuizToggle(check);
      node.append(check);
    }
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
    const preview = bubble(event, true);
    preview.classList.add("thread-preview");
    if (event.id) {
      preview.id = event.id;
      encounterObserver.observe(preview);
    }
    const topic = el("p", "thread-topic", title);
    preview.querySelector("header").after(topic);
    const question = [...preview.children].find(
      (node) => node.tagName === "P" && node !== topic,
    );
    question?.classList.add("preview-question");
    const replies = el("button", "thread-replies thread-toggle");
    replies.type = "button";
    replies.setAttribute("aria-expanded", "false");
    const avatars = el("span", "thread-avatars");
    avatars.setAttribute("aria-hidden", "true");
    for (const id of [...new Set(participants)]) {
      const person = people.get(id);
      avatars.append(el("span", "avatar tone-" + person.tone, person.initial));
    }
    const label = el("span", "thread-action"),
      arrow = el("span", "thread-chevron", "›");
    arrow.setAttribute("aria-hidden", "true");
    replies.append(avatars, label, arrow);
    preview.append(replies);
    return preview;
  }
  function updateQuizToggle(check) {
    const qs = byQuizGroup.get(check.dataset.quiz).checks,
      open = check.dataset.open === "true";
    check.querySelector(".thread-action").textContent = open
      ? "Свернуть ответы"
      : countLabel(qs.length, ["вопрос", "вопроса", "вопросов"]) +
        " · Ответить";
    check
      .querySelector(".thread-toggle")
      .setAttribute("aria-expanded", String(open));
    const preview = check.querySelector(".preview-question"),
      question = qs[0]?.question || "В этой главе пока нет вопросов.";
    if (preview.textContent !== question) preview.textContent = question;
  }
  function setQuizOpen(check, open) {
    const body = check.querySelector(".quiz-body");
    check.dataset.open = String(open);
    body.hidden = !open;
    updateQuizToggle(check);
    if (open && !quizSessions.has(check.dataset.quiz)) {
      const c = byQuizGroup.get(check.dataset.quiz);
      startQuiz(c.id, c.checks, body);
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
        .closest("[data-thread]")
        .querySelector(".thread-preview");
    else if (event.type === "heading") {
      node = el("section", "chapter-heading");
      node.dataset.chapter = event.chapter.id;
      const previous = chapters[chapters.indexOf(event.chapter) - 1];
      const newDay = !previous || previous.day !== event.chapter.day;
      if (newDay) node.classList.add("new-day");
      node.append(
        el(
          "h2",
          "",
          groupByScene.get(event.chapter.id).scenes[0] === event.chapter
            ? `Глава ${groupByScene.get(event.chapter.id).number} · День ${event.chapter.day} — ${groupByScene.get(event.chapter.id).title}`
            : `${event.chapter.title} · День ${event.chapter.day}`,
        ),
      );
    } else if (event.type === "message") node = bubble(event);
    else if (event.type === "narration")
      node = el("p", "narration", event.text);
    else if (event.type === "visual") node = diagram(event);
    else if (event.type === "choice") node = showChoice(event.chapter);
    else if (event.type === "supplement") node = supplement(event.chapter);
    else if (event.type === "thread")
      node = threadPanel(event.chapter, event.thread);
    else return;
    node.id = event.id;
    if (!node.isConnected)
      (event.parent ? parentNodes.get(event.parent) : $("messages"))?.append(
        node,
      );
    mounted.set(event.id, node);
    if (event.type === "message") encounterObserver.observe(node);
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
      if (event.id === chapters.at(-1).id + "--supplement")
        state.storyComplete = true;
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
      event.type === "thread" ||
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
  function sync() {
    stopTimer();
    for (const [id, { thread: t }] of threads) {
      const body = parentNodes.get(id);
      if (body) setThreadView(body.closest("[data-thread]"), threadOpen(t));
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
    encounterObserver.disconnect();
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
    restoreFinalExam();
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
          `Глава ${groupByScene.get(entry.chapter.id).number} · ${entry.chapter.title}` +
          (entry.thread ? ` / ${entry.thread.title}` : ""),
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
      body.replaceChildren(el("p", "", "В этой главе пока нет вопросов."));
      return;
    }
    const session = {
      id,
      qs,
      body,
      index: 0,
      active: true,
      inlineFirst: !!body.closest("[data-quiz]"),
      isChapter: !!body.closest("[data-quiz]"),
    };
    quizSessions.set(id, session);
    body.replaceChildren();
    if (session.isChapter) {
      restoreChapterAnswers(session);
      if (session.index === qs.length)
        body.append(quizMessage("nina", quizResult(session)));
      else ask(session);
      return;
    }
    while (session.index < qs.length) {
      const q = qs[session.index],
        answer = state.finalExam.answers[q.id];
      if (!Number.isInteger(answer)) break;
      body.append(
        quizMessage("nina", q.question),
        quizMessage("sasha", q.options[answer]),
        quizMessage("nina", answerFeedback(q, answer)),
      );
      if (answer !== q.correct) appendReferences(body, q);
      session.index++;
    }
    if (session.index === qs.length) {
      body.append(
        quizMessage("nina", quizResult(session)),
        examRestartAction(),
      );
      return;
    }
    if (session.index) {
      ask(session);
      return;
    }
    quizIncoming(
      session,
      "Буду задавать вопросы по одному. Если ошибётесь, покажу сообщения, к которым стоит вернуться.",
      () => ask(session),
    );
  }
  function restoreChapterAnswers(session) {
    // Grouped chapters can contain gaps between answers from earlier visits.
    while (session.index < session.qs.length) {
      const q = session.qs[session.index],
        answer = state.chapterAnswers[q.id];
      if (!Number.isInteger(answer)) break;
      if (!session.inlineFirst || session.index)
        session.body.append(quizMessage("nina", q.question));
      session.body.append(
        quizMessage("sasha", q.options[answer]),
        quizMessage("nina", answerFeedback(q, answer)),
      );
      if (answer !== q.correct) appendReferences(session.body, q);
      session.inlineFirst = false;
      session.index++;
    }
  }
  function answerFeedback(q, answer) {
    return (
      (answer === q.correct
        ? "Да. "
        : `Здесь подходит ответ «${q.options[q.correct]}». `) + q.explanation
    );
  }
  function appendReferences(body, q) {
    const forwards = el("div", "forwards");
    forwards.append(
      el("p", "small muted", "Вот переписка: проблема, попытка и решение."),
    );
    for (const ref of q.references) forwards.append(forwarded(ref));
    body.append(forwards);
  }
  function quizResult(session) {
    const passed = session.qs.filter(
      (q) =>
        (session.isChapter
          ? state.chapterAnswers[q.id]
          : state.finalExam.answers[q.id]) === q.correct,
    ).length;
    return session.isChapter
      ? "Все вопросы этой главы разобраны. Здесь остаются ваши ответы и объяснения. Проверить себя ещё раз можно в общей проверке в конце истории."
      : `Итоговая проверка завершена: верно ${passed} из ${session.qs.length}. Это отдельный результат проверки по всей истории. Разборы по главам сохранены отдельно; теперь итоговую проверку можно пройти заново целиком.`;
  }
  function ask(session) {
    if (session.isChapter) restoreChapterAnswers(session);
    if (session.index >= session.qs.length) {
      if (!session.isChapter) {
        state.finalExam.status = "complete";
        save();
        updateFinalControls();
        updateTimeline();
        renderSkills();
      }
      quizIncoming(session, quizResult(session), () => {
        if (!session.isChapter) session.body.append(examRestartAction());
      });
      return;
    }
    const q = session.qs[session.index];
    const showOptions = () => {
      const options = replyComposer(
        q.options,
        (i) => {
          if (
            session.isChapter
              ? Number.isInteger(state.chapterAnswers[q.id])
              : state.finalExam.status !== "active" ||
                Number.isInteger(state.finalExam.answers[q.id])
          )
            return false;
          const label = q.options[i];
          options.remove();
          session.body.append(quizMessage("sasha", label));
          if (session.isChapter) {
            state.chapterAnswers[q.id] = i;
            state.answers[q.id] = [...(state.answers[q.id] || []), i].slice(
              -30,
            );
          } else state.finalExam.answers[q.id] = i;
          save();
          updateFinalControls();
          const correct = i === q.correct;
          quizIncoming(session, answerFeedback(q, i), () => {
            if (!correct) appendReferences(session.body, q);
            const actions = el("div", "quiz-actions");
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
                "quiz-next action-cue",
              ),
            );
            session.body.append(actions);
            renderSkills();
          });
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
  const conceptMessages = new Map(
    data.glossary.map((term) => [term.id, new Set()]),
  );
  for (const [id, { event }] of messages)
    if (event.type === "message") {
      for (const match of (event.paragraphs || [])
        .join(" ")
        .matchAll(/\*\*(.*?)\*\*/g)) {
        const term = data.glossary.find((term) =>
          [term.title, ...term.aliases].some(
            (name) =>
              name.toLocaleLowerCase("ru") === match[1].toLocaleLowerCase("ru"),
          ),
        );
        if (term) conceptMessages.get(term.id).add(id);
      }
    }
  for (const term of data.glossary)
    if (!conceptMessages.get(term.id).size) {
      const candidates = [...messages.values()].filter(
        ({ event, chapter, thread }) =>
          event.type === "message" &&
          (thread?.id === term.topic || (!thread && chapter.id === term.topic)),
      );
      const matches = candidates.filter(({ event }) =>
        [term.title, ...term.aliases].some((name) =>
          event.paragraphs
            .join(" ")
            .toLocaleLowerCase("ru")
            .includes(name.toLocaleLowerCase("ru")),
        ),
      );
      for (const { event } of matches.length ? matches : candidates.slice(0, 1))
        conceptMessages.get(term.id).add(event.id);
    }
  function renderSkills() {
    const all = [...questions.values()].map((x) => x.question),
      local = all.filter((q) =>
        Number.isInteger(state.chapterAnswers[q.id]),
      ).length;
    const finalCorrect = all.filter(
      (q) => state.finalExam.answers[q.id] === q.correct,
    ).length;
    $("skill-summary").textContent =
      `Разборы по главам: ${local}/${all.length} ответов. Итоговая проверка: ${Object.keys(state.finalExam.answers).length}/${all.length}${state.finalExam.status === "complete" ? `, завершена: верно ${finalCorrect}/${all.length}` : ", не завершена"}.`;
    const draw = (node) => {
      const li = el("li", "skill-node");
      li.dataset.skill = node.id;
      if (node.children) {
        li.append(el("h3", "", node.title));
        const list = el("ul", "skill-children");
        for (const child of node.children) list.append(draw(child));
        li.append(list);
      } else {
        const relevant = all.filter((q) =>
          q.terms.some((term) => node.terms.includes(term)),
        );
        const planned = new Set(
          node.terms.flatMap((term) => [...(conceptMessages.get(term) || [])]),
        );
        const met = [...planned].filter((id) => encountered.has(id)).length;
        const localDone = relevant.filter((q) =>
          Number.isInteger(state.chapterAnswers[q.id]),
        ).length;
        const finalDone = relevant.filter((q) =>
          Number.isInteger(state.finalExam.answers[q.id]),
        ).length;
        const correct = relevant.filter(
          (q) => state.finalExam.answers[q.id] === q.correct,
        ).length;
        const complete = state.finalExam.status === "complete";
        const verified =
          complete && relevant.length && correct === relevant.length;
        li.classList.add(
          verified
            ? "checked"
            : complete && correct < relevant.length
              ? "review"
              : met
                ? "encountered"
                : "ahead",
        );
        li.append(el("strong", "", node.title));
        if (complete && relevant.length)
          li.append(
            el(
              "span",
              "skill-state",
              verified
                ? "Подтверждено в итоговой проверке"
                : "Есть вопросы для повторного разбора",
            ),
          );
        const counts = el("div", "skill-counts");
        counts.append(
          el(
            "span",
            "skill-encounters",
            `Встречи в диалогах: ${met}/${planned.size}`,
          ),
          el(
            "span",
            "skill-local",
            `Разборы глав: ${localDone}/${relevant.length}`,
          ),
          el(
            "span",
            "skill-final",
            `Итоговая проверка: ${finalDone}/${relevant.length}${complete ? `, верно ${correct}` : ""}`,
          ),
        );
        li.append(
          counts,
          button(
            "К объяснению",
            () => {
              $("skills").close();
              navigate(node.chapters[0]);
            },
            "text-button",
          ),
        );
      }
      return li;
    };
    const root = el("ul", "skill-root");
    for (const child of data.skillTree.children) root.append(draw(child));
    $("skill-tree").replaceChildren(root);
  }
  function updateFinalControls() {
    const all = questions.size,
      done = Object.keys(state.finalExam.answers).length,
      finished = storyFinished();
    $("all-checks").disabled = !finished;
    $("all-checks").classList.toggle(
      "action-cue",
      finished && state.finalExam.status === "idle",
    );
    $("all-checks").textContent =
      state.finalExam.status === "complete"
        ? "Пройти итоговую проверку заново"
        : state.finalExam.status === "active"
          ? `Продолжить проверку · ${done}/${all}`
          : "Начать итоговую проверку";
    $("final-status").textContent = !finished
      ? "Доступна после прохождения всех глав. Просмотр всей переписки не завершает историю."
      : state.finalExam.status === "complete"
        ? `Завершена: ${done}/${all} ответов. Новый проход начнётся с первого вопроса.`
        : state.finalExam.status === "active"
          ? `Сохранено ${done}/${all} ответов. Продолжить можно с текущего вопроса; перезапуск доступен после завершения.`
          : `${all} вопросов по всей истории. Ответы в главах сюда не переносятся.`;
  }
  function examRestartAction() {
    const actions = el("div", "quiz-actions");
    actions.append(
      button(
        "Пройти итоговую проверку заново",
        () => startFinalExam(true),
        "quiz-next",
      ),
    );
    return actions;
  }
  function startFinalExam(restart = false) {
    if (!storyFinished() || (restart && state.finalExam.status !== "complete"))
      return false;
    if (state.finalExam.status === "idle" || restart) {
      state.finalExam = {
        revision: data.assessmentRevision,
        status: "active",
        answers: {},
      };
      save();
      startQuiz(
        "all",
        [...questions.values()].map((x) => x.question),
        $("final-check-body"),
      );
    } else if (!quizSessions.has("all")) restoreFinalExam();
    updateFinalControls();
    renderSkills();
    const target =
      $("final-check-body").querySelector(".reply-options") || $("final-check");
    target.scrollIntoView({ block: "start", behavior: "instant" });
    return true;
  }
  function restoreFinalExam() {
    if (
      storyFinished() &&
      state.finalExam.status !== "idle" &&
      !quizSessions.has("all")
    )
      startQuiz(
        "all",
        [...questions.values()].map((x) => x.question),
        $("final-check-body"),
      );
  }
  const timelineRows = new Map();
  let pendingRollback = null,
    timelineFrame = null,
    lastTimelineChapter = null,
    timelineNeedsAlign = false;
  function initializeTimeline() {
    for (const group of chapterGroups) {
      const c = group.scenes[0];
      const row = el("li", "timeline-step");
      row.dataset.chapter = group.id;
      const jump = button(
        `${group.number}. ${group.title}`,
        () => {
          if ($("timeline-dialog").open) $("timeline-dialog").close();
          navigate(c.id);
        },
        "timeline-jump",
      );
      const back = button("", () => requestRollback(c), "timeline-back");
      back.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7a8 8 0 0 0-14-1L3 9m0-6v6h6M4 17a8 8 0 0 0 14 1l3-3m0 6v-6h-6"/></svg>';
      back.setAttribute(
        "aria-label",
        `Начать главу ${group.number} заново со сбросом дальнейшего прохождения`,
      );
      back.title =
        "Вернуться к началу этой главы со сбросом дальнейшего прохождения";
      row.append(jump, back);
      $("timeline-chapters").append(row);
      timelineRows.set(group.id, { row, jump, back });
    }
    const layout = matchMedia("(min-width: 1280px)");
    const place = () => {
      if (layout.matches && $("timeline-dialog").open)
        $("timeline-dialog").close();
      (layout.matches ? $("timeline-dock") : $("timeline-mobile")).append(
        $("timeline-body"),
      );
    };
    place();
    layout.addEventListener("change", place);
    $("timeline-open").addEventListener("click", () => {
      showDialog("timeline-dialog");
      scheduleTimelinePosition(true);
    });
    $("timeline-final").addEventListener("click", () => {
      if ($("timeline-dialog").open) $("timeline-dialog").close();
      $("final-check").scrollIntoView({ block: "start", behavior: "instant" });
    });
    $("rollback-cancel").addEventListener("click", () => {
      pendingRollback = null;
      $("rollback-dialog").close();
    });
    $("rollback-confirm").addEventListener("click", () => {
      if (!pendingRollback) return;
      const c = pendingRollback;
      pendingRollback = null;
      $("rollback-dialog").close();
      performRollback(c);
    });
    updateTimeline();
  }
  function updateTimeline() {
    for (const group of chapterGroups) {
      const item = timelineRows.get(group.id);
      if (!item) continue;
      const reached = group.scenes.some(chapterReached),
        done = group.scenes.every(
          (c) =>
            state.choices[c.id] !== undefined &&
            seen.has(c.id + "--supplement"),
        );
      item.row.classList.toggle("done", done);
      item.row.classList.toggle("reached", reached);
      item.jump.disabled = !reached && !readAll;
      const restartable = state.started && reached;
      item.back.hidden = !restartable;
      item.back.disabled = !restartable;
      item.jump.title = done
        ? "История главы пройдена; вопросы учитываются отдельно"
        : reached
          ? "Текущая глава"
          : "Впереди";
    }
    $("timeline-final").disabled = !storyFinished();
    $("timeline-final").textContent =
      state.finalExam.status === "complete"
        ? "Итоговая проверка · завершена"
        : state.finalExam.status === "active"
          ? "Итоговая проверка · в процессе"
          : "Итоговая проверка";
    $("timeline-open").textContent = state.started
      ? `Путь · ${$("story-progress").value}%`
      : "Путь";
    scheduleTimelinePosition();
  }
  function scheduleTimelinePosition(force = false) {
    timelineNeedsAlign ||= force;
    if (timelineFrame) return;
    timelineFrame = requestAnimationFrame(() => {
      timelineFrame = null;
      let current = null;
      for (const c of chapters) {
        const heading = $(c.id + "--heading");
        if (
          heading &&
          heading.getBoundingClientRect().top < Math.max(160, innerHeight * 0.4)
        )
          current = groupByScene.get(c.id).id;
      }
      for (const [id, item] of timelineRows) {
        item.row.classList.toggle("current", id === current);
        if (id === current) item.jump.setAttribute("aria-current", "step");
        else item.jump.removeAttribute("aria-current");
      }
      if (current && (current !== lastTimelineChapter || timelineNeedsAlign)) {
        const viewport = $("timeline-chapters");
        if (viewport.getClientRects().length) {
          const bounds = viewport.getBoundingClientRect(),
            row = timelineRows.get(current).row.getBoundingClientRect();
          if (row.top < bounds.top + 16)
            viewport.scrollTop += row.top - bounds.top - 16;
          else if (row.bottom > bounds.bottom - 16)
            viewport.scrollTop += row.bottom - bounds.bottom + 16;
        }
      }
      lastTimelineChapter = current;
      timelineNeedsAlign = false;
    });
  }
  function requestRollback(c) {
    pendingRollback = c;
    if ($("timeline-dialog").open) $("timeline-dialog").close();
    const group = groupByScene.get(c.id);
    $("rollback-target").textContent = `Глава ${group.number}: ${group.title}`;
    $("rollback-description").textContent =
      "Выбранные продолжения истории, встречи с понятиями и ответы этой главы и всех последующих будут сброшены. Итоговая проверка тоже будет сброшена. Всё до этой главы сохранится.";
    showDialog("rollback-dialog");
  }
  function performRollback(c) {
    const index = chapters.indexOf(c),
      affected = new Set(chapters.slice(index).map((chapter) => chapter.id));
    const ids = new Set();
    for (const [id, entry] of messages)
      if (affected.has(entry.chapter.id)) ids.add(id);
    for (const chapter of chapters.slice(index)) {
      delete state.choices[chapter.id];
      for (const suffix of ["heading", "sent", "reply", "supplement", "choice"])
        ids.add(chapter.id + "--" + suffix);
      for (const t of chapter.threads) ids.add(t.id + "--thread");
      for (const q of chapter.checks) {
        delete state.chapterAnswers[q.id];
        delete state.answers[q.id];
      }
    }
    for (const id of ids) {
      seen.delete(id);
      encountered.delete(id);
    }
    state.expanded = state.expanded.filter(
      (id) => !affected.has(threads.get(id)?.chapter.id),
    );
    state.collapsed = state.collapsed.filter(
      (id) => !affected.has(threads.get(id)?.chapter.id),
    );
    state.finalExam = {
      revision: data.assessmentRevision,
      status: "idle",
      answers: {},
    };
    state.started = index !== 0;
    state.storyComplete = false;
    readAll = false;
    paused = false;
    save();
    renderRestored();
    if (index) {
      stopTimer();
      mount({ id: c.id + "--heading", type: "heading", chapter: c });
      sync();
      $(c.id + "--heading").scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    } else
      $("opening-composer").scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    renderSkills();
    updateProgress();
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
        setThreadView(body.closest("[data-thread]"), true);
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
  function showDialog(id) {
    if (!$(id).open) $(id).showModal();
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
  send.classList.add("action-cue");
  draft.append(
    el("p", "small muted draft-label", "Первое сообщение · от имени Саши"),
    send,
  );
  $("opening-composer").append(draft);
  $("restart-chat").addEventListener("click", () => {
    $("settings").close();
    requestRollback(chapters[0]);
  });
  $("progress-open").addEventListener("click", () => {
    if ($("timeline-dialog").open) $("timeline-dialog").close();
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
    startFinalExam(state.finalExam.status === "complete"),
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
      else if (parent.matches("[data-thread]")) {
        state.expanded = [
          ...new Set([...state.expanded, parent.dataset.thread]),
        ];
        state.collapsed = state.collapsed.filter(
          (id) => id !== parent.dataset.thread,
        );
        setThreadView(parent, true);
        save();
      } else if (parent.matches("details")) parent.open = true;
    // One deliberate move to the FIRST unread message, never a moving bottom.
    // An immediate jump cannot be interrupted by the next incoming message.
    target.scrollIntoView({ block: "start", behavior: "instant" });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    updateJump();
  });
  addEventListener(
    "scroll",
    () => {
      updateJump();
      scheduleTimelinePosition();
    },
    { passive: true },
  );
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
  initializeTimeline();
  renderRestored();
  renderSkills();
  if (location.hash) navigate(decodeURIComponent(location.hash.slice(1)));
})();
