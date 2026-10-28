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
  shadow.innerHTML = `<link rel="stylesheet" href="/__review/review.css"><div id="outline" hidden></div><span id="pin" hidden></span><button id="selection" hidden>＋ Комментировать выделение</button><button id="toggle" aria-expanded="false">Рецензия <span id="count">0</span></button><div id="picking" hidden>Нажмите на нужный блок · Esc — отмена</div><section id="panel" aria-label="Список правок" hidden><header><strong>Правки</strong><a id="history" href="/__review/history" target="_blank" rel="noopener noreferrer">История</a><button id="close" aria-label="Свернуть замечания">×</button></header><p class="intro">Выберите блок или выделите текст, затем напишите комментарий.</p><div class="actions"><button id="pick">Прокомментировать блок</button><button id="pick-ui">Элемент интерфейса</button><button id="page">Общее замечание</button></div><form id="editor" hidden><p id="target-title"></p><blockquote id="quote" hidden></blockquote><label for="body">Комментарий</label><textarea id="body" rows="4" maxlength="20000" placeholder="Ваш комментарий…"></textarea><p id="draft-status" class="muted small"></p><div class="actions"><button id="save" type="submit">Сохранить</button><button id="cancel" type="button">Отменить</button></div></form><details id="drafts" hidden><summary id="drafts-label">Черновики</summary><div id="drafts-list"></div></details><p id="status" role="status"></p><div id="undo" hidden><span id="undo-label"></span><button id="undo-delete">Отменить удаление</button></div><div class="list-header"><span>Открытые правки</span><button id="refresh">Обновить</button></div><input id="search" type="search" aria-label="Найти правку" placeholder="Найти правку…"><div id="comments"></div></section>`;
  const $ = (id) => shadow.getElementById(id);
  const draftKey = "unknowntalks:local-review:draft:v1";
  const recoveryKey = "unknowntalks:local-review:recovery:v1";
  const state = {
    comments: [],
    file: "",
    open: false,
    picking: false,
    pickMode: "block",
    lastDeleted: null,
    draft: null,
    recoveredDrafts: [],
    commentsLoaded: false,
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
    state.commentsLoaded = true;
    reconcileDrafts();
    if (
      state.selectedId &&
      state.comments.find((c) => c.id === state.selectedId)?.status !== "open"
    ) {
      state.selectedId = null;
      state.target = null;
      highlightRange = null;
      updateOutline();
    }
    renderList();
  }
  function freshCopy(draft) {
    return {
      clientId: crypto.randomUUID(),
      body: draft.body,
      category: draft.category || "content",
      anchor: structuredClone(draft.anchor),
      context: structuredClone(draft.context || {}),
    };
  }
  function normalizeDraft(draft) {
    if (!draft?.anchor || typeof draft.body !== "string" || !draft.body.trim())
      return null;
    if (!state.commentsLoaded) return draft;
    const saved = state.comments.find((c) =>
      draft.editingId
        ? c.id === draft.editingId
        : c.clientId === draft.clientId,
    );
    if (saved && saved.body.trim() === draft.body.trim()) return null;
    if (draft.editingId) {
      if (
        !saved ||
        saved.status !== "open" ||
        saved.updatedAt !== draft.baseUpdatedAt
      )
        return freshCopy(draft);
    } else if (saved) return freshCopy(draft);
    return draft;
  }
  function storeDrafts() {
    try {
      // Persist recovery first: an interrupted write cannot erase the previous active draft.
      if (state.recoveredDrafts.length)
        localStorage.setItem(
          recoveryKey,
          JSON.stringify(state.recoveredDrafts),
        );
      else localStorage.removeItem(recoveryKey);
      if (state.draft)
        localStorage.setItem(draftKey, JSON.stringify(state.draft));
      else localStorage.removeItem(draftKey);
      return true;
    } catch {
      return false;
    }
  }
  function persistDraft() {
    if (state.draft) state.draft.body = $("body").value;
    const saved = storeDrafts();
    $("draft-status").textContent = !state.draft
      ? ""
      : saved
        ? "Черновик сохранён."
        : "Черновик пока только в этом окне. Сохраните его перед закрытием.";
    $("save").disabled = state.saving || !$("body").value.trim();
  }
  function reconcileDrafts() {
    state.recoveredDrafts = state.recoveredDrafts
      .map(normalizeDraft)
      .filter(Boolean);
    // Explicit editing stays open until the record actually changes remotely.
    if (state.draft && !state.saving) {
      const draft = state.draft;
      draft.body = $("body").value;
      const saved = state.comments.find((c) =>
        draft.editingId
          ? c.id === draft.editingId
          : c.clientId === draft.clientId,
      );
      const editExpired =
        draft.editingId &&
        (!saved ||
          saved.status !== "open" ||
          saved.updatedAt !== draft.baseUpdatedAt);
      const acceptedCreation = !draft.editingId && saved;
      if (editExpired || acceptedCreation) {
        if (saved && saved.body.trim() === draft.body.trim()) {
          state.draft = null;
          $("body").value = "";
          $("editor").hidden = true;
          say(
            "Этот комментарий уже сохранён. Для новой правки выберите блок или выделите текст.",
          );
        } else {
          state.draft = freshCopy(draft);
          showEditor();
          say(
            "Предыдущая правка уже изменилась. Ваш несохранённый текст оставлен как новый комментарий.",
          );
        }
      }
    }
    storeDrafts();
    renderRecovery();
  }
  function parkActiveDraft() {
    if (state.saving) {
      say("Дождитесь завершения сохранения.");
      return false;
    }
    if (state.draft) {
      state.draft.body = $("body").value;
      const draft = normalizeDraft(state.draft);
      if (draft) {
        state.recoveredDrafts = state.recoveredDrafts.filter(
          (d) => d.clientId !== draft.clientId,
        );
        state.recoveredDrafts.push(draft);
      }
    }
    state.draft = null;
    $("body").value = "";
    $("editor").hidden = true;
    if (!storeDrafts())
      say(
        "Предыдущий текст оставлен в черновиках этого окна. Браузер не разрешил сохранить его между перезагрузками.",
        true,
      );
    renderRecovery();
    return true;
  }
  function renderRecovery() {
    $("drafts").hidden = !state.recoveredDrafts.length;
    $("drafts-label").textContent =
      "Несохранённые черновики · " + state.recoveredDrafts.length;
    $("drafts-list").replaceChildren();
    for (const draft of state.recoveredDrafts) {
      const row = el("div", "recovered-draft");
      row.append(
        el(
          "p",
          "small muted",
          draft.anchor.chapterTitle || draft.anchor.title || "Комментарий",
        ),
        el(
          "p",
          "",
          draft.body.length > 180 ? draft.body.slice(0, 180) + "…" : draft.body,
        ),
      );
      const actions = el("div", "actions");
      actions.append(
        button("Продолжить", () => {
          if (!parkActiveDraft()) return;
          const restored = normalizeDraft(draft);
          state.recoveredDrafts = state.recoveredDrafts.filter(
            (d) => d.clientId !== draft.clientId,
          );
          if (restored) {
            state.draft = restored;
            showEditor();
            open();
            persistDraft();
            $("body").focus();
          } else say("Комментарий уже сохранён.");
          storeDrafts();
          renderRecovery();
        }),
        button("Удалить черновик", () => {
          state.recoveredDrafts = state.recoveredDrafts.filter(
            (d) => d.clientId !== draft.clientId,
          );
          storeDrafts();
          renderRecovery();
        }),
      );
      row.append(actions);
      $("drafts-list").append(row);
    }
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
    if (!parkActiveDraft()) return;
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
    say("");
    $("body").focus();
  }
  function showEditor() {
    const draft = state.draft;
    $("editor").hidden = !draft;
    if (!draft) return;
    const kindLabel = {
      block: "Блок",
      text: "Выделенный текст",
      element: "Элемент интерфейса",
      page: "Страница в целом",
    }[draft.anchor.kind];
    $("target-title").textContent =
      kindLabel +
      (draft.anchor.kind === "page"
        ? ""
        : " · " + (draft.anchor.chapterTitle || draft.anchor.title));
    const preview =
      draft.anchor.quote?.exact ||
      (draft.anchor.kind === "block"
        ? draft.anchor.blockText
        : draft.anchor.kind === "element"
          ? draft.anchor.label
          : "");
    $("quote").hidden = !preview;
    $("quote").textContent = preview;
    $("body").value = draft.body;
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
    $("pick-ui").classList.remove("active");
    document.documentElement.style.removeProperty("cursor");
  }
  function startPicking(mode = "block") {
    if (!parkActiveDraft()) return;
    state.picking = true;
    state.pickMode = mode;
    state.selection = null;
    $("selection").hidden = true;
    $("picking").hidden = false;
    $(mode === "block" ? "pick" : "pick-ui").classList.add("active");
    $("picking").textContent =
      mode === "block"
        ? "Нажмите на нужное сообщение или схему · Esc — отмена"
        : "Нажмите на нужную кнопку или элемент · Esc — отмена";
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
    if (state.pickMode === "block")
      return (
        element.closest(
          ".message, figure, .reply-options, .chapter-heading, .track, article, .skill-node, .opening, .story-footer, .knowledge-check, .internal-thread, section, header, footer",
        ) || element
      );
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
      const result = snapshot(
        target,
        state.pickMode === "block" ? "block" : "element",
      );
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
    if (comment.status !== "open") {
      say(
        "Правка закрыта. Ниже сохранён исходный фрагмент, а переход к старому участку отключён.",
      );
      return;
    }
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
  function speakerName(id) {
    try {
      return (
        JSON.parse(
          document.getElementById("lesson-data").textContent,
        ).characters.find((p) => p.id === id)?.name || id
      );
    } catch {
      return id;
    }
  }
  async function deleteComment(comment) {
    if (state.draft?.editingId === comment.id) {
      say(
        "Сначала сохраните или отмените редактирование этого комментария.",
        true,
      );
      return;
    }
    try {
      const removed = await api("/comments/" + comment.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: "deleted",
          baseUpdatedAt: comment.updatedAt,
        }),
      });
      state.lastDeleted = removed;
      if (state.selectedId === comment.id) {
        state.target = null;
        state.selectedId = null;
        highlightRange = null;
        updateOutline();
      }
      await refresh();
      $("undo-label").textContent = "Комментарий удалён.";
      $("undo").hidden = false;
      say("");
    } catch (e) {
      say(e.message, true);
    }
  }
  async function restoreComment(comment) {
    try {
      await api("/comments/" + comment.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: comment.previousStatus || "open",
          baseUpdatedAt: comment.updatedAt,
        }),
      });
      state.lastDeleted = null;
      $("undo").hidden = true;
      await refresh();
      say("Комментарий восстановлен.");
    } catch (e) {
      say(e.message, true);
    }
  }
  $("undo-delete").addEventListener("click", () => {
    if (state.lastDeleted) restoreComment(state.lastDeleted);
  });
  function renderList() {
    const openCount = state.comments.filter((c) => c.status === "open").length;
    $("count").textContent = String(openCount);
    const list = $("comments");
    list.replaceChildren();
    const search = $("search").value.trim().toLowerCase();
    const comments = state.comments
      .filter(
        (c) =>
          c.status === "open" &&
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
      list.append(el("p", "muted small", "Открытых правок нет."));
    for (const c of comments) {
      const article = el("article", "comment");
      article.dataset.id = c.id;
      const meta = el("p", "comment-meta");
      meta.append(el("strong", "", c.id), el("span", "", ""));
      article.append(meta, el("p", "comment-body", c.body));
      article.append(
        el(
          "p",
          "location",
          "Где: " +
            (c.anchor.kind === "page"
              ? "страница в целом"
              : c.anchor.chapterTitle || c.anchor.title) +
            (c.anchor.speaker
              ? " · " +
                (document.getElementById("lesson-data")
                  ? speakerName(c.anchor.speaker)
                  : c.anchor.speaker)
              : ""),
        ),
      );
      const excerpt =
        c.anchor.quote?.exact ||
        (c.anchor.kind === "block"
          ? c.anchor.blockText
          : c.anchor.kind === "element"
            ? c.anchor.label
            : "");
      if (excerpt)
        article.append(
          el(
            "blockquote",
            "",
            excerpt.length > 260 ? excerpt.slice(0, 260) + "…" : excerpt,
          ),
        );
      const actions = el("div", "actions");
      actions.append(
        button("Показать место", () => showTarget(c)),
        button("Изменить", async () => {
          if (!parkActiveDraft()) return;
          try {
            await refresh();
            const current = state.comments.find((n) => n.id === c.id);
            if (!current || current.status !== "open") {
              say(
                "Эта правка уже закрыта. Выберите блок, чтобы создать новый комментарий.",
              );
              return;
            }
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
        button("Удалить", () => deleteComment(c)),
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
      state.comments = [
        ...state.comments.filter((c) => c.id !== comment.id),
        comment,
      ];
      renderList();
      say("Комментарий сохранён.");
      try {
        await refresh();
      } catch {
        say(
          "Комментарий сохранён. Остальной список временно не удалось обновить.",
        );
      }
      updateOutline();
    } catch (error) {
      say(
        error.message + " Черновик оставлен; можно повторить сохранение.",
        true,
      );
    } finally {
      state.saving = false;
      $("body").readOnly = false;
      $("cancel").disabled = false;
      persistDraft();
    }
  });
  $("body").addEventListener("input", persistDraft);
  $("cancel").addEventListener("click", () => {
    clearDraft();
    say("Черновик отменён.");
  });
  $("toggle").addEventListener("click", () => open(!state.open));
  $("close").addEventListener("click", () => open(false));
  $("pick").addEventListener("click", () => startPicking("block"));
  $("pick-ui").addEventListener("click", () => startPicking("element"));
  $("page").addEventListener("click", () => {
    const result = snapshot(document.body, "page");
    result.anchor.blockText = "";
    result.anchor.label = document.title;
    result.anchor.selector = "body";
    begin(result.anchor, result.context, null);
  });
  $("search").addEventListener("input", renderList);
  $("refresh").addEventListener("click", () =>
    refresh()
      .then(() => say("Список обновлён."))
      .catch((e) => say(e.message, true)),
  );
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
    const recovered = JSON.parse(localStorage.getItem(recoveryKey));
    const active = JSON.parse(localStorage.getItem(draftKey));
    const candidates = [
      ...(Array.isArray(recovered) ? recovered : []),
      ...(active ? [active] : []),
    ];
    state.recoveredDrafts = [
      ...new Map(
        candidates
          .filter(
            (d) => d?.anchor && typeof d.body === "string" && d.body.trim(),
          )
          .map((d) => [d.clientId, d]),
      ).values(),
    ];
    renderRecovery();
  } catch {
    /* Saved comments remain available from the server. */
  }
  refresh()
    .then(() => {
      const id = new URL(location.href).searchParams.get("review");
      const comment = state.comments.find((c) => c.id === id);
      if (comment) {
        open();
        if (comment.status === "open") showTarget(comment);
        else
          location.replace(
            "/__review/history?comment=" + encodeURIComponent(comment.id),
          );
      }
    })
    .catch((error) => say(error.message, true));
})();
