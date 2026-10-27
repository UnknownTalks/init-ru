(() => {
  "use strict";
  const data = JSON.parse(document.getElementById("lesson-data").textContent);
  const chapters = data.chapters;
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const extras = new Map(data.extras.map((extra) => [extra.id, extra]));
  const terms = new Map(data.glossary.map((term) => [term.id, term]));
  const key = "unknowntalks:init-ru:prose-chat:v3";
  const $ = (id) => document.getElementById(id);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults = {
    version: 3,
    opened: 1,
    choices: {},
    completed: [],
    extrasDone: [],
    speed: reducedMotion ? "instant" : "normal",
    book: false,
  };
  let state = { ...defaults },
    storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.version === 3) {
      state.opened = Number.isInteger(saved.opened)
        ? Math.max(1, Math.min(chapters.length, saved.opened))
        : 1;
      state.choices = Object.fromEntries(
        chapters
          .filter(
            (c) =>
              Number.isInteger(saved.choices?.[c.id]) &&
              c.decision.options[saved.choices[c.id]],
          )
          .map((c) => [c.id, saved.choices[c.id]]),
      );
      state.completed = Array.isArray(saved.completed)
        ? [...new Set(saved.completed.filter((id) => byId.has(id)))]
        : [];
      state.extrasDone = Array.isArray(saved.extrasDone)
        ? [...new Set(saved.extrasDone.filter((id) => extras.has(id)))]
        : [];
      state.speed = ["normal", "fast", "instant"].includes(saved.speed)
        ? saved.speed
        : defaults.speed;
      state.book = saved.book === true;
    }
  } catch {
    storageAvailable = false;
  }
  let stream = null,
    frame = null,
    following = false;
  const sections = new Map();
  while (
    state.opened < chapters.length &&
    state.choices[chapters[state.opened - 1].id] !== undefined
  )
    state.opened++;
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      storageAvailable = false;
    }
    $("storage-message").textContent = storageAvailable
      ? ""
      : "Браузер не разрешил сохранить состояние. Отметки работают до закрытия страницы.";
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className = "") {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  function richParagraph(text, pending = false) {
    const p = el("p");
    const segments = [];
    for (const [i, part] of text.split("**").entries()) {
      const node = document.createTextNode(pending ? "" : part);
      if (i % 2) {
        const strong = el("strong");
        strong.append(node);
        p.append(strong);
      } else p.append(node);
      if (part) segments.push({ node, text: part, paragraph: p });
    }
    p.hidden = pending;
    return { p, segments };
  }
  function message(speaker, paragraphs, pending = false) {
    const node = el("article", "message " + speaker);
    node.setAttribute(
      "aria-label",
      speaker === "sasha"
        ? "Саша"
        : speaker === "reader"
          ? "Ваш вопрос"
          : "Команда разработки",
    );
    node.append(el("div", "speaker", node.getAttribute("aria-label")));
    const segments = [];
    for (const text of paragraphs) {
      const { p, segments: parts } = richParagraph(text, pending);
      node.append(p);
      segments.push(...parts);
    }
    return { node, segments };
  }
  function nearBottom() {
    return document.documentElement.scrollHeight - innerHeight - scrollY < 150;
  }
  function scrollEnd(behavior = "auto") {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: reducedMotion ? "auto" : behavior,
    });
  }
  function updateJump() {
    $("jump").hidden = nearBottom();
  }
  function flushStream() {
    if (!stream) return;
    const current = stream;
    cancelAnimationFrame(frame);
    stream = null;
    for (const segment of current.segments) {
      segment.paragraph.hidden = false;
      segment.node.data = segment.text;
    }
    current.node.classList.remove("streaming");
    current.node.removeAttribute("aria-busy");
    current.done();
    if (following) scrollEnd();
    updateJump();
  }
  function animate(result, done) {
    if (state.speed === "instant" || reducedMotion) {
      for (const part of result.segments) {
        part.paragraph.hidden = false;
        part.node.data = part.text;
      }
      done();
      return;
    }
    stream = {
      ...result,
      done,
      index: 0,
      offset: 0,
      credit: 0,
      previous: performance.now(),
    };
    result.node.classList.add("streaming");
    result.node.setAttribute("aria-busy", "true");
    renderComposer();
    function tick(now) {
      if (!stream) return;
      const rate = state.speed === "fast" ? 650 : 210;
      stream.credit += (Math.min(now - stream.previous, 80) * rate) / 1000;
      stream.previous = now;
      let count = Math.floor(stream.credit);
      stream.credit -= count;
      while (count > 0 && stream.index < stream.segments.length) {
        const part = stream.segments[stream.index];
        const take = Math.min(count, part.text.length - stream.offset);
        stream.offset += take;
        count -= take;
        part.paragraph.hidden = false;
        part.node.data = part.text.slice(0, stream.offset);
        if (stream.offset >= part.text.length) {
          stream.index++;
          stream.offset = 0;
        }
      }
      if (following) scrollEnd();
      if (stream.index === stream.segments.length) {
        flushStream();
        return;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  function studiedLabel(id, optional = false) {
    const label = el("label", "study");
    const input = el("input");
    input.type = "checkbox";
    input.checked = (optional ? state.extrasDone : state.completed).includes(
      id,
    );
    input.dataset.study = id;
    input.addEventListener("change", () => {
      const target = optional ? "extrasDone" : "completed";
      state[target] = input.checked
        ? [...new Set([...state[target], id])]
        : state[target].filter((item) => item !== id);
      document.querySelectorAll("input[data-study]").forEach((other) => {
        if (other.dataset.study === id) other.checked = input.checked;
      });
      document.querySelectorAll("button[data-extra]").forEach((other) => {
        other.classList.toggle(
          "done",
          state.extrasDone.includes(other.dataset.extra),
        );
      });
      save();
      renderSkills();
    });
    label.append(
      input,
      document.createTextNode(optional ? "Разбор изучен" : "Глава изучена"),
    );
    return label;
  }
  function sourceList(sources) {
    const list = el("ul", "sources-list");
    for (const source of sources) {
      const li = el("li"),
        a = el("a", "", source.label);
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.append(a);
      list.append(li);
    }
    return list;
  }
  function showDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }
  function detail(title) {
    $("detail-title").textContent = title;
    $("detail-body").replaceChildren();
    return $("detail-body");
  }
  function openExtra(id) {
    const extra = extras.get(id);
    if (!extra) return;
    const body = detail(extra.title);
    body.append(
      el(
        "p",
        "muted small",
        "Необязательный разбор к главе «" +
          byId.get(extra.parent).title +
          "». Закройте его, чтобы вернуться в ту же точку разговора.",
      ),
    );
    for (const paragraph of extra.paragraphs)
      body.append(richParagraph(paragraph).p);
    if (id === "token-boundaries") {
      const a = el("a", "", "Попробовать настоящий токенизатор ↗");
      a.href = "demos/tokens.html";
      a.target = "_blank";
      body.append(a);
    }
    body.append(studiedLabel(id, true), sourceList(extra.sources));
    showDialog("detail");
  }
  function openTerms(chapter) {
    const body = detail("Понятия этой главы");
    for (const id of chapter.terms) {
      const term = terms.get(id);
      const section = el("section", "term-def");
      section.append(
        el("h3", "", term.title),
        el("p", "", term.definition),
        el("p", "small", term.example),
      );
      body.append(section);
    }
    const a = el("a", "", "Открыть весь словарь ↗");
    a.href = "../../glossary.html";
    a.target = "_blank";
    body.append(a);
    showDialog("detail");
  }
  function footer(chapter) {
    const node = el("footer", "chapter-footer");
    node.append(studiedLabel(chapter.id));
    const links = el("div", "chapter-links");
    links.append(
      button("Источники", () => {
        detail("На чём основана глава").append(sourceList(chapter.sources));
        showDialog("detail");
      }),
    );
    if (chapter.terms.length)
      links.append(button("Понятия этой главы", () => openTerms(chapter)));
    node.append(links);
    const optional = data.extras.filter((extra) => extra.parent === chapter.id);
    if (optional.length) {
      const list = el("div", "optional-list");
      for (const extra of optional) {
        const b = button(extra.title, () => openExtra(extra.id), "extra-link");
        b.dataset.extra = extra.id;
        b.classList.toggle("done", state.extrasDone.includes(extra.id));
        list.append(b);
      }
      node.append(list);
    }
    return node;
  }
  function resolution(chapter, section, pending = false) {
    const selected = chapter.decision.options[state.choices[chapter.id]];
    if (selected) section.append(message("reader", [selected.label]).node);
    const rest = chapter.messages
      .find((m) => m.speaker === "team")
      .paragraphs.slice(chapter.decision.afterTeamParagraph);
    const result = message(
      "team",
      selected ? [selected.reply, ...rest] : rest,
      pending,
    );
    section.append(result.node);
    return result;
  }
  function appendIntroduction(chapter, pending = false) {
    const section = el("section", "chapter");
    section.id = chapter.id;
    const heading = el("header", "chapter-heading");
    const group = data.groups.find((g) => g.chapters.includes(chapter.id));
    heading.append(
      el("p", "eyebrow", group.title),
      el("h2", "", chapter.title),
    );
    section.append(heading);
    $("messages").append(section);
    sections.set(chapter.id, section);
    for (const item of chapter.messages.filter((m) => m.speaker === "sasha"))
      section.append(message("sasha", item.paragraphs).node);
    const intro = chapter.messages
      .find((m) => m.speaker === "team")
      .paragraphs.slice(0, chapter.decision.afterTeamParagraph);
    const start = message("team", intro, pending);
    section.append(start.node);
    return { section, start };
  }
  function introductionReady() {
    renderComposer();
    $("announcement").textContent =
      "Ответ команды готов. Можно выбрать вопрос.";
    updateJump();
  }
  function renderTranscript(animateLast = false) {
    if (stream) {
      cancelAnimationFrame(frame);
      stream = null;
    }
    sections.clear();
    $("messages").replaceChildren();
    const count = state.book ? chapters.length : state.opened;
    for (let i = 0; i < count; i++) {
      const chapter = chapters[i];
      const pending =
        animateLast &&
        i === count - 1 &&
        !state.book &&
        state.choices[chapter.id] === undefined;
      const { section, start } = appendIntroduction(chapter, pending);
      if (
        state.book ||
        i < count - 1 ||
        state.choices[chapter.id] !== undefined
      ) {
        resolution(chapter, section);
        section.append(footer(chapter));
      }
      if (pending) animate(start, introductionReady);
    }
    renderComposer();
    renderSkills();
  }
  function choose(index) {
    if (stream || state.book) return;
    const chapter = chapters[state.opened - 1];
    if (state.choices[chapter.id] !== undefined) return;
    state.choices[chapter.id] = index;
    save();
    // Keep the scroll position: the selected question and answer grow below the
    // paragraph the reader just finished instead of moving the reader to its end.
    following = false;
    const result = resolution(chapter, sections.get(chapter.id), true);
    animate(result, () => {
      sections.get(chapter.id).append(footer(chapter));
      if (state.opened < chapters.length) nextChapter();
      else {
        renderComposer();
        $("announcement").textContent = "История закончилась.";
      }
      updateJump();
    });
  }
  function nextChapter() {
    if (stream || state.opened >= chapters.length) return;
    state.opened++;
    save();
    const current = chapters[state.opened - 1];
    const { start } = appendIntroduction(current, true);
    renderSkills();
    animate(start, introductionReady);
  }
  function renderComposer() {
    const node = $("composer");
    node.replaceChildren();
    $("composer-note").textContent = state.book
      ? "Режим чтения. Отметки сохраняются только по вашему выбору."
      : "Выбирайте вопросы вместо ввода текста. Это подготовленная история.";
    if (stream) {
      const controls = el("div", "stream-controls");
      controls.append(
        el("span", "", "Команда отвечает…"),
        button("Показать сразу", flushStream),
      );
      node.append(controls);
      return;
    }
    if (state.book) {
      const controls = el("div", "book-controls");
      controls.append(
        el("span", "", "Весь рассказ открыт"),
        button("Карта знаний", () => {
          renderSkills();
          showDialog("skills");
        }),
      );
      node.append(controls);
      return;
    }
    const chapter = chapters[state.opened - 1];
    const choices = el("div", "choices");
    if (state.choices[chapter.id] === undefined) {
      node.append(el("p", "composer-prompt", chapter.title));
      chapter.decision.options.forEach((option, index) =>
        choices.append(button(option.label, () => choose(index))),
      );
    } else if (state.opened < chapters.length) {
      choices.append(button("Продолжить разговор", nextChapter));
    } else {
      node.append(
        el(
          "p",
          "composer-prompt",
          "История закончилась. Впереди — анатомия агента.",
        ),
      );
      choices.append(
        button("Посмотреть, что уже изучено", () => {
          renderSkills();
          showDialog("skills");
        }),
      );
    }
    node.append(choices);
  }
  function renderSkills() {
    const n = state.completed.length;
    $("header-progress").textContent = `${n} / ${chapters.length}`;
    $("skills-summary").textContent =
      `Изучено ${n} из ${chapters.length} глав. Осталось ${chapters.length - n}.`;
    $("skills-progress").max = chapters.length;
    $("skills-progress").value = n;
    const content = $("skill-groups");
    content.replaceChildren();
    for (const group of data.groups) {
      const section = el("section", "skill-group");
      const done = group.chapters.filter((id) =>
        state.completed.includes(id),
      ).length;
      section.append(
        el("h3", "", group.title + ` · ${done} / ${group.chapters.length}`),
        el("p", "", group.skill),
      );
      const list = el("ol", "skill-path");
      for (const id of group.chapters) {
        const chapter = byId.get(id),
          index = chapters.indexOf(chapter),
          li = el("li");
        const completed = state.completed.includes(id),
          opened = state.book || index < state.opened;
        li.classList.toggle("studied", completed);
        li.classList.toggle(
          "current",
          !state.book && index === state.opened - 1,
        );
        const b = button(chapter.title, () => {
          $("skills").close();
          navigate(id);
        });
        li.append(
          b,
          el(
            "span",
            "chapter-state",
            completed
              ? "Изучено ✓"
              : opened
                ? "Открыто · без отметки"
                : "Впереди",
          ),
        );
        const children = data.extras.filter((extra) => extra.parent === id);
        if (children.length) {
          const sub = el("div", "optional-branch");
          const count = children.filter((extra) =>
            state.extrasDone.includes(extra.id),
          ).length;
          sub.append(
            el(
              "span",
              "optional-state",
              (count === children.length ? "✓" : count ? "◐" : "+") +
                ` Необязательные разборы · ${count} / ${children.length}`,
            ),
          );
          for (const extra of children)
            sub.append(
              button(extra.title, () => {
                $("skills").close();
                openExtra(extra.id);
              }),
            );
          li.append(sub);
        }
        list.append(li);
      }
      section.append(list);
      content.append(section);
    }
  }
  function navigate(rawId) {
    const aliases = { "whole-story": "human-search", rules: "patterns" };
    const id = aliases[rawId] || rawId;
    if (extras.has(id)) {
      openExtra(id);
      return;
    }
    const chapter = byId.get(id);
    if (!chapter) return;
    flushStream();
    const index = chapters.indexOf(chapter);
    if (!state.book && index >= state.opened) {
      state.opened = index + 1;
      save();
      renderTranscript();
    }
    history.replaceState(null, "", "#" + id);
    sections.get(id)?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }
  document
    .querySelectorAll("[data-close]")
    .forEach((b) =>
      b.addEventListener("click", () => b.closest("dialog").close()),
    );
  document.querySelectorAll("dialog").forEach((dialog) =>
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
    }),
  );
  $("skills-open").addEventListener("click", () => {
    renderSkills();
    showDialog("skills");
  });
  $("reading-open").addEventListener("click", () => showDialog("reading"));
  $("about-open").addEventListener("click", () => showDialog("about"));
  $("speed").value = state.speed;
  $("speed").addEventListener("change", () => {
    state.speed = $("speed").value;
    save();
    if (state.speed === "instant") flushStream();
  });
  $("book-mode").addEventListener("click", () => {
    flushStream();
    state.book = true;
    save();
    $("reading").close();
    renderTranscript();
  });
  $("chat-mode").addEventListener("click", () => {
    state.book = false;
    save();
    $("reading").close();
    renderTranscript();
    sections
      .get(chapters[state.opened - 1].id)
      .scrollIntoView({ block: "start" });
  });
  $("jump").addEventListener("click", () => {
    following = true;
    scrollEnd("smooth");
  });
  let lastScroll = scrollY;
  addEventListener(
    "scroll",
    () => {
      if (scrollY < lastScroll - 3) following = false;
      lastScroll = scrollY;
      updateJump();
    },
    { passive: true },
  );
  addEventListener(
    "wheel",
    (event) => {
      if (event.deltaY < 0) following = false;
    },
    { passive: true },
  );
  addEventListener("hashchange", () =>
    navigate(decodeURIComponent(location.hash.slice(1))),
  );
  const observer = new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      "--composer-height",
      document.querySelector(".composer-wrap").offsetHeight + "px",
    );
    updateJump();
  });
  observer.observe(document.querySelector(".composer-wrap"));
  save();
  const hasHash = location.hash.length > 1;
  renderTranscript(
    !hasHash &&
      state.opened === 1 &&
      state.choices[chapters[0].id] === undefined &&
      !state.book,
  );
  if (hasHash) navigate(decodeURIComponent(location.hash.slice(1)));
  else if (state.opened > 1 && !state.book) {
    sections
      .get(chapters[state.opened - 1].id)
      .scrollIntoView({ block: "start" });
  }
  updateJump();
})();
