(() => {
  "use strict";
  if (window.__unknownTalksReview) return;
  window.__unknownTalksReview = true;
  const config = JSON.parse(
    document.getElementById("ut-review-config").textContent,
  );
  const host = document.createElement("div");
  host.id = "ut-review-host";
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<link rel="stylesheet" href="/__review/review.css"><div id="outline" hidden></div><span id="pin" hidden></span><button id="selection" hidden>＋ Комментарий к выделению</button><button id="toggle" aria-expanded="false">Рецензия <span id="count">0</span></button><div id="picking" hidden>Нажмите на нужный элемент · Esc — отмена</div><section id="panel" aria-label="Локальные замечания" hidden><header><strong>Локальная рецензия</strong><button id="close" aria-label="Свернуть замечания">×</button></header><p class="intro">Выделите текст или выберите элемент. Замечания сохраняются в файл на этом компьютере.</p><div class="actions"><button id="pick">Выбрать элемент</button><button id="page">К странице в целом</button></div><form id="editor" hidden><p id="target-title"></p><blockquote id="quote" hidden></blockquote><label for="category">Что изменить</label><select id="category"><option value="content">Текст</option><option value="explanation">Объяснение / логика</option><option value="ui">Интерфейс</option><option value="other">Другое</option></select><label for="body">Замечание</label><textarea id="body" rows="5" maxlength="20000" placeholder="Что не так и какого результата хочется…"></textarea><p id="draft-status" class="muted small"></p><div class="actions"><button id="save" type="submit">Сохранить</button><button id="cancel" type="button">Отменить</button></div></form><p id="status" role="status"></p><div class="list-header"><select id="filter" aria-label="Какие замечания показать"><option value="open">Открытые</option><option value="resolved">Готовые</option><option value="all">Все</option></select><button id="refresh">Обновить</button></div><input id="search" type="search" aria-label="Найти замечание" placeholder="Найти по тексту, месту или номеру…"><div id="comments"></div><footer><button id="export-json">Скачать JSON</button><button id="export-md">Текст для агента</button><p id="file" class="small muted"></p></footer></section>`;
  const $ = (id) => shadow.getElementById(id);
  const categories = {
    content: "Текст",
    explanation: "Объяснение",
    ui: "Интерфейс",
    other: "Другое",
  };
  const draftKey = "unknowntalks:local-review:draft:v1";
  const state = {
    comments: [],
    file: "",
    open: false,
    picking: false,
    draft: null,
    selection: null,
    target: null,
    selectedId: null,
    saving: false,
  };
  let highlightRange = null,
    refreshTimer = null,
    hovered = null;
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(text, action, cls = "") {
    const b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  }
  function own(event) {
    return event.composedPath().includes(host);
  }
  function say(text, error = false) {
    $("status").textContent = text;
    $("status").className = error ? "error" : "";
  }
  function attach() {
    const modal = [...document.querySelectorAll("dialog[open]")]
      .filter((n) => n.matches(":modal"))
      .at(-1);
    const parent = modal || document.body;
    if (parent && host.parentNode !== parent) parent.append(host);
  }
  attach();
  new MutationObserver(() => {
    attach();
    updateOutline();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
  });
  const globalStyle = document.createElement("style");
  globalStyle.textContent =
    "::highlight(ut-review-selection){background:#c5a75c66;color:inherit}";
  document.head.append(globalStyle);
  function open(value = true) {
    state.open = value;
    $("panel").hidden = !value;
    $("toggle").setAttribute("aria-expanded", String(value));
    if (value) {
      attach();
      refresh().catch((error) => say(error.message, true));
    }
  }
  async function api(path = "", options = {}) {
    const response = await fetch(config.api + path, {
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Не удалось сохранить замечание.");
    return data;
  }
  async function refresh() {
    const data = await api();
    state.comments = data.comments;
    state.file = data.file;
    renderList();
  }
  function persistDraft() {
    if (state.draft) {
      state.draft.body = $("body").value;
      state.draft.category = $("category").value;
    }
    try {
      if (state.draft)
        localStorage.setItem(draftKey, JSON.stringify(state.draft));
      else localStorage.removeItem(draftKey);
      $("draft-status").textContent = state.draft
        ? "Черновик сохранён в браузере. В файл попадёт после «Сохранить»."
        : "";
    } catch {
      $("draft-status").textContent =
        "Черновик пока только в этом окне. Сохраните его перед закрытием.";
    }
    $("save").disabled = state.saving || !$("body").value.trim();
  }
  function selectorFor(element) {
    const parts = [];
    let node = element;
    while (node && node !== document.body && parts.length < 12) {
      if (node.id) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter(
            (n) => n.tagName === node.tagName,
          )
        : [];
      parts.unshift(
        node.tagName.toLowerCase() +
          (siblings.length > 1
            ? `:nth-of-type(${siblings.indexOf(node) + 1})`
            : ""),
      );
      node = node.parentElement;
    }
    return parts.length ? parts.join(" > ") : "body";
  }
  function chapterFor(element) {
    const holder = element.closest("[data-chapter], [id]");
    const dataNode = document.getElementById("lesson-data");
    if (!dataNode) return {};
    try {
      const data = JSON.parse(dataNode.textContent);
      let chapter = data.chapters.find(
        (c) => c.id === element.closest("[data-chapter]")?.dataset.chapter,
      );
      if (!chapter)
        chapter = data.chapters.find(
          (c) =>
            [
              ...c.intro,
              ...c.outro,
              ...c.threads.flatMap((t) => t.messages),
            ].some((e) => e.id === holder?.id) ||
            holder?.id?.startsWith(c.id + "--"),
        );
      return chapter
        ? { chapterId: chapter.id, chapterTitle: chapter.title }
        : {};
    } catch {
      return {};
    }
  }
  function snapshot(element, kind, range = null) {
    const common = range
      ? range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
      : element;
    const scope = common.closest("[id]") || common;
    const block =
      element.closest(
        "article, figure, [data-quiz], .reply-options, .track, section, header, footer, dialog",
      ) || element;
    const label =
      element.getAttribute("aria-label") ||
      element.innerText ||
      element.getAttribute("title") ||
      element.tagName.toLowerCase();
    const anchor = {
      kind,
      page: location.pathname,
      title: document.title,
      hash: location.hash,
      selector: selectorFor(element),
      elementId: scope.id || "",
      tag: element.tagName.toLowerCase(),
      label: label.trim().slice(0, 2000),
      blockText: (block.innerText || block.textContent || "")
        .trim()
        .slice(0, 12000),
      ...chapterFor(element),
      threadId: element.closest("[data-thread]")?.dataset.thread || "",
      quizId: element.closest("[data-quiz]")?.dataset.quiz || "",
      speaker: element.closest("[data-speaker]")?.dataset.speaker || "",
    };
    if (range) {
      const before = range.cloneRange();
      before.selectNodeContents(scope);
      before.setEnd(range.startContainer, range.startOffset);
      const source = scope.textContent || "",
        start = before.toString().length,
        exact = range.toString();
      anchor.quote = {
        exact: exact.slice(0, 8000),
        prefix: source.slice(Math.max(0, start - 120), start),
        suffix: source.slice(start + exact.length, start + exact.length + 120),
      };
    }
    const context = {
      sourceRevision: config.sourceRevision,
      pageVersion: config.pageVersion,
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        pixelRatio: devicePixelRatio,
        scrollX,
        scrollY,
      },
    };
    try {
      const saved = JSON.parse(
        localStorage.getItem("unknowntalks:init-ru:messenger:v4"),
      );
      if (saved)
        context.lesson = {
          started: saved.started,
          tracks: saved.tracks,
          expanded: saved.expanded,
          collapsed: saved.collapsed,
          choices: saved.choices,
          pace: saved.pace,
          preview: !document.getElementById("return-inline")?.hidden,
          dialogs: [...document.querySelectorAll("dialog[open]")].map(
            (n) => n.id,
          ),
        };
    } catch {
      /* Selection and comments also work without browser storage. */
    }
    return { anchor, context };
  }
  function begin(anchor, context, target, range = null) {
    if (state.draft?.body.trim()) {
      open();
      say(
        "Есть несохранённый комментарий. Сохраните или отмените его перед выбором другого места.",
        true,
      );
      return;
    }
    state.draft = {
      clientId: crypto.randomUUID(),
      body: "",
      category:
        anchor.kind === "element" &&
        ["button", "input", "select", "summary", "nav"].includes(anchor.tag)
          ? "ui"
          : "content",
      anchor,
      context,
    };
    state.target = target;
    state.selectedId = null;
    state.selection = null;
    highlightRange = range;
    stopPicking();
    showEditor();
    open();
    persistDraft();
    updateOutline();
    $("body").focus();
  }
  function showEditor() {
    const draft = state.draft;
    $("editor").hidden = !draft;
    if (!draft) return;
    $("target-title").textContent =
      (draft.editingId ? draft.editingId + " · " : "") +
      (draft.anchor.chapterTitle || draft.anchor.title) +
      (draft.anchor.kind === "page" ? " · вся страница" : "");
    $("quote").hidden = !draft.anchor.quote;
    $("quote").textContent = draft.anchor.quote?.exact || "";
    $("body").value = draft.body;
    $("category").value = draft.category;
    $("save").textContent = draft.editingId
      ? "Сохранить изменения"
      : "Сохранить";
  }
  function clearDraft() {
    state.draft = null;
    $("body").value = "";
    $("editor").hidden = true;
    persistDraft();
  }
  function stopPicking() {
    state.picking = false;
    $("picking").hidden = true;
    $("pick").classList.remove("active");
    document.documentElement.style.removeProperty("cursor");
  }
  function startPicking() {
    if (state.draft?.body.trim()) {
      open();
      say("Сначала сохраните или отмените текущий комментарий.", true);
      return;
    }
    state.picking = true;
    state.selection = null;
    $("selection").hidden = true;
    $("picking").hidden = false;
    $("pick").classList.add("active");
    open(false);
    document.documentElement.style.cursor = "crosshair";
  }
  function targetFrom(event) {
    const element =
      event.target instanceof Element
        ? event.target
        : event.target.parentElement;
    if (
      !element ||
      element === document.documentElement ||
      element === document.body ||
      element.closest("script, style, #ut-review-host")
    )
      return null;
    return (
      element.closest(
        "button, a, input, select, textarea, summary, progress, figure",
      ) || element
    );
  }
  function updateOutline() {
    if (CSS.highlights) CSS.highlights.delete("ut-review-selection");
    const target = state.picking ? hovered : state.target;
    if (!target?.isConnected) {
      $("outline").hidden = true;
      $("pin").hidden = true;
      return;
    }
    const rect = target.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom < 0 ||
      rect.top > innerHeight
    ) {
      $("outline").hidden = true;
      $("pin").hidden = true;
      return;
    }
    const outline = $("outline");
    outline.hidden = false;
    outline.style.cssText = `left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px`;
    const pin = $("pin");
    pin.hidden = !state.selectedId;
    pin.textContent = state.selectedId || "";
    pin.style.cssText = `left:${Math.max(4, Math.min(innerWidth - 70, rect.right - 60))}px;top:${Math.max(4, rect.top - 22)}px`;
    if (CSS.highlights && typeof Highlight === "function") {
      if (highlightRange?.startContainer.isConnected)
        CSS.highlights.set(
          "ut-review-selection",
          new Highlight(highlightRange),
        );
    }
  }
  document.addEventListener(
    "pointermove",
    (event) => {
      if (state.picking && !own(event)) {
        hovered = targetFrom(event);
        updateOutline();
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (state.picking && !own(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!state.picking || own(event)) return;
      const target = targetFrom(event);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = snapshot(target, "element");
      begin(result.anchor, result.context, target);
    },
    true,
  );
  function captureSelection(event) {
    if (event && own(event)) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) {
      $("selection").hidden = true;
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    const common =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (
      !common ||
      common.getRootNode() !== document ||
      common.closest("input,textarea,script,style")
    )
      return;
    const exact = range.toString();
    if (!exact.trim()) return;
    if (exact.length > 8000) {
      open();
      say(
        "Выделение слишком большое. Выберите блок через «Выбрать элемент» или оставьте замечание к странице.",
        true,
      );
      return;
    }
    const element =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
    const scope = common.closest("[id]") || common;
    const result = snapshot(element, "text", range);
    // A selection spanning several elements is anchored to their common scope.
    result.anchor.elementId = scope.id || result.anchor.elementId;
    state.selection = { ...result, target: common, range };
    positionSelection();
    attach();
  }
  function positionSelection() {
    const selected = state.selection;
    if (
      !selected ||
      !selected.range.startContainer.isConnected ||
      window.getSelection()?.isCollapsed ||
      state.picking
    ) {
      $("selection").hidden = true;
      return;
    }
    const rect = selected.range.getBoundingClientRect(),
      menu = $("selection");
    if (rect.bottom < 0 || rect.top > innerHeight || !rect.width) {
      menu.hidden = true;
      return;
    }
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(innerWidth - 280, rect.left)) + "px";
    menu.style.top =
      Math.max(8, Math.min(innerHeight - 55, rect.bottom + 8)) + "px";
  }
  document.addEventListener(
    "pointerup",
    (event) => {
      if (!state.picking && !own(event))
        setTimeout(() => captureSelection(), 0);
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key.startsWith("Arrow") || event.key === "Shift")
        captureSelection(event);
    },
    true,
  );
  $("selection").addEventListener("pointerdown", (event) =>
    event.preventDefault(),
  );
  $("selection").addEventListener("click", () => {
    const selected = state.selection;
    if (!selected) return;
    $("selection").hidden = true;
    begin(selected.anchor, selected.context, selected.target, selected.range);
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey && event.shiftKey && event.code === "KeyC") {
        event.preventDefault();
        startPicking();
      }
      if (event.key === "Escape" && (state.picking || state.open)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopPicking();
        open(false);
        state.target = null;
        highlightRange = null;
        updateOutline();
      }
    },
    true,
  );
  function findRange(root, quote) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest("script,style,noscript,#ut-review-host")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    let text = "",
      node;
    while ((node = walker.nextNode())) {
      nodes.push({
        node,
        start: text.length,
        end: text.length + node.data.length,
      });
      text += node.data;
    }
    let index = text.indexOf(quote.exact);
    if (index < 0) return null;
    for (
      let candidate = index;
      candidate >= 0;
      candidate = text.indexOf(quote.exact, candidate + 1)
    ) {
      if (
        (!quote.prefix ||
          text.slice(
            Math.max(0, candidate - quote.prefix.length),
            candidate,
          ) === quote.prefix) &&
        (!quote.suffix ||
          text.slice(
            candidate + quote.exact.length,
            candidate + quote.exact.length + quote.suffix.length,
          ) === quote.suffix)
      ) {
        index = candidate;
        break;
      }
    }
    const first = nodes.find((n) => n.end > index),
      last = nodes.find((n) => n.end >= index + quote.exact.length);
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, index - first.start);
    range.setEnd(last.node, index + quote.exact.length - last.start);
    return range;
  }
  async function showTarget(comment) {
    const a = comment.anchor;
    const normalize = (value) =>
      value.replace(/\.html$/, "").replace(/\/$/, "");
    if (normalize(a.page) !== normalize(location.pathname)) {
      const url = new URL(a.page, location.origin);
      url.searchParams.set("review", comment.id);
      url.hash = a.hash || "";
      location.assign(url);
      return;
    }
    if (a.kind === "page") {
      state.target = null;
      state.selectedId = null;
      highlightRange = null;
      window.scrollTo({ top: 0, behavior: "auto" });
      updateOutline();
      say("Общее замечание к этой странице · " + comment.id);
      return;
    }
    let target = a.elementId ? document.getElementById(a.elementId) : null;
    const query = () => {
      try {
        return document.querySelector(a.selector);
      } catch {
        return null;
      }
    };
    const specific = query();
    target = specific || target;
    if (
      (!target ||
        !target.getClientRects().length ||
        (a.selector && !specific)) &&
      document.getElementById("lesson-data")
    ) {
      // Preview only; the lesson's "read all" action preserves saved progress.
      document.getElementById("read-all")?.click();
      if (a.threadId) {
        const thread = [...document.querySelectorAll("[data-thread]")].find(
          (n) => n.dataset.thread === a.threadId,
        );
        if (thread) thread.open = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      target = query() || document.getElementById(a.elementId);
    }
    if (!target) {
      target = a.chapterId
        ? document.getElementById(a.chapterId + "--heading")
        : null;
    }
    if (!target) {
      say(
        "Это место пока не найдено на странице. Исходная цитата и контекст сохранены в замечании.",
        true,
      );
      return;
    }
    for (
      let ancestor = target.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (ancestor.tagName === "DETAILS") ancestor.open = true;
    }
    const dialog = target.closest("dialog");
    if (dialog && !dialog.open) {
      for (const open of document.querySelectorAll("dialog[open]"))
        open.close();
      dialog.showModal();
      attach();
    }
    highlightRange = a.quote
      ? findRange(target, a.quote) ||
        (a.elementId
          ? findRange(document.getElementById(a.elementId) || target, a.quote)
          : null)
      : null;
    if (highlightRange)
      target =
        highlightRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? highlightRange.commonAncestorContainer
          : highlightRange.commonAncestorContainer.parentElement;
    state.target = target;
    state.selectedId = comment.id;
    target.scrollIntoView({ block: "center", behavior: "auto" });
    updateOutline();
    say(
      a.quote && !highlightRange
        ? "Точная цитата не найдена: текст мог измениться или ещё не раскрыт. Показан исходный блок; цитата сохранена."
        : "Показано место замечания " + comment.id + ".",
    );
  }
  function renderList() {
    const openCount = state.comments.filter((c) => c.status === "open").length;
    $("count").textContent = String(openCount);
    $("file").textContent = state.file ? "Файл: " + state.file : "";
    const filter = $("filter").value,
      list = $("comments");
    list.replaceChildren();
    const search = $("search").value.trim().toLowerCase();
    const comments = state.comments
      .filter(
        (c) =>
          (filter === "all" || c.status === filter) &&
          [
            c.id,
            c.body,
            c.anchor.chapterTitle,
            c.anchor.label,
            c.anchor.page,
            c.anchor.quote?.exact,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search),
      )
      .toReversed();
    if (!comments.length)
      list.append(
        el(
          "p",
          "muted small",
          filter === "open"
            ? "Открытых замечаний пока нет."
            : "Здесь пока нет замечаний.",
        ),
      );
    for (const c of comments) {
      const article = el("article", "comment");
      article.dataset.id = c.id;
      const meta = el("p", "comment-meta");
      meta.append(
        el("strong", "", c.id),
        el(
          "span",
          "",
          categories[c.category] + (c.status === "resolved" ? " · Готово" : ""),
        ),
      );
      article.append(meta);
      article.append(
        el(
          "p",
          "location",
          c.anchor.chapterTitle ||
            (c.anchor.label || "").slice(0, 100) ||
            c.anchor.title,
        ),
      );
      if (c.anchor.quote)
        article.append(el("blockquote", "", c.anchor.quote.exact));
      article.append(el("p", "comment-body", c.body));
      if (c.resolution) article.append(el("p", "resolution", c.resolution));
      const actions = el("div", "actions");
      actions.append(
        button("Показать место", () => showTarget(c)),
        button("Изменить", async () => {
          if (state.draft?.body.trim()) {
            say("Сначала сохраните или отмените текущий комментарий.", true);
            return;
          }
          try {
            await refresh();
            const current = state.comments.find((n) => n.id === c.id);
            state.draft = {
              ...structuredClone(current),
              editingId: c.id,
              baseUpdatedAt: current.updatedAt,
            };
            showEditor();
            persistDraft();
            $("body").focus();
          } catch (e) {
            say(e.message, true);
          }
        }),
        button(c.status === "open" ? "Готово" : "Открыть снова", async () => {
          try {
            await api("/comments/" + c.id, {
              method: "PATCH",
              body: JSON.stringify({
                status: c.status === "open" ? "resolved" : "open",
                baseUpdatedAt: c.updatedAt,
                resolution:
                  c.status === "open"
                    ? "Отмечено автором в локальной рецензии."
                    : null,
              }),
            });
            await refresh();
            say("Статус " + c.id + " сохранён.");
          } catch (e) {
            say(e.message, true);
          }
        }),
      );
      article.append(actions);
      list.append(article);
    }
  }
  $("editor").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.saving || !state.draft || !$("body").value.trim()) return;
    persistDraft();
    state.saving = true;
    $("save").disabled = true;
    $("body").readOnly = true;
    $("category").disabled = true;
    $("cancel").disabled = true;
    const draft = structuredClone(state.draft);
    try {
      const comment = await api(
        draft.editingId ? "/comments/" + draft.editingId : "/comments",
        {
          method: draft.editingId ? "PATCH" : "POST",
          body: JSON.stringify(
            draft.editingId
              ? {
                  body: draft.body,
                  category: draft.category,
                  baseUpdatedAt: draft.baseUpdatedAt,
                }
              : draft,
          ),
        },
      );
      clearDraft();
      state.selectedId = comment.id;
      await refresh();
      say("Сохранено в локальный файл · " + comment.id);
      updateOutline();
    } catch (error) {
      say(
        error.message + " Черновик оставлен; можно повторить сохранение.",
        true,
      );
    } finally {
      state.saving = false;
      $("body").readOnly = false;
      $("category").disabled = false;
      $("cancel").disabled = false;
      persistDraft();
    }
  });
  $("body").addEventListener("input", persistDraft);
  $("category").addEventListener("change", persistDraft);
  $("cancel").addEventListener("click", () => {
    clearDraft();
    say("Черновик отменён.");
  });
  $("toggle").addEventListener("click", () => open(!state.open));
  $("close").addEventListener("click", () => open(false));
  $("pick").addEventListener("click", startPicking);
  $("page").addEventListener("click", () => {
    const result = snapshot(document.body, "page");
    result.anchor.blockText = "";
    result.anchor.label = document.title;
    result.anchor.selector = "body";
    begin(result.anchor, result.context, null);
  });
  $("filter").addEventListener("change", renderList);
  $("search").addEventListener("input", renderList);
  $("refresh").addEventListener("click", () =>
    refresh()
      .then(() => say("Список обновлён."))
      .catch((e) => say(e.message, true)),
  );
  function download(text, name, type) {
    const blob = new Blob([text], { type }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $("export-json").addEventListener("click", async () => {
    try {
      const { schemaVersion, project, updatedAt, comments } = await api();
      download(
        JSON.stringify(
          { schemaVersion, project, updatedAt, comments },
          null,
          2,
        ),
        "unknowntalks-local-review.json",
        "application/json",
      );
    } catch (e) {
      say(e.message, true);
    }
  });
  $("export-md").addEventListener("click", async () => {
    try {
      const response = await fetch("/__review/export.md", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Не удалось собрать замечания.");
      download(
        await response.text(),
        "unknowntalks-local-review.md",
        "text/markdown",
      );
    } catch (e) {
      say(e.message, true);
    }
  });
  addEventListener(
    "scroll",
    () => {
      positionSelection();
      updateOutline();
    },
    true,
  );
  addEventListener("resize", () => {
    positionSelection();
    updateOutline();
  });
  addEventListener("focus", () => refresh().catch(() => {}));
  refreshTimer = setInterval(() => {
    if (state.open && !document.hidden) refresh().catch(() => {});
  }, 10000);
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey));
    if (draft?.anchor && typeof draft.body === "string") {
      state.draft = draft;
      showEditor();
      open();
      persistDraft();
      say("Восстановлен несохранённый черновик.");
    }
  } catch {
    /* The server copy remains the source of saved comments. */
  }
  refresh()
    .then(() => {
      const id = new URL(location.href).searchParams.get("review");
      const comment = state.comments.find((c) => c.id === id);
      if (comment) {
        open();
        showTarget(comment);
      }
    })
    .catch((error) => say(error.message, true));
})();
