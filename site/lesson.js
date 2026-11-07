import { validAnswer, correctAnswer, answerText, solutionText, exerciseForm } from "./exercise.mjs";
import { createDiscoverySystem } from "./discovery.js";
import { enhanceSelects, refreshControls } from './select.js';
import { uiElement } from './ui/dom.js';
import { buttonVariants } from './ui/variants.js';
import { createLessonViews } from './lesson-views.js';
import { initTactile } from './ui/tactile.js';
import { initLessonMechanism } from './ui/mechanism.js';
import { initPreferences, interfaceScale } from './ui/preferences.js';
import { initAgent } from './ui/agent.js';
import { freshExam, nextForm, formQuestions, isComplete, outcomeResult, compatibleExam, formatMinutes, LearningClock } from "./learning.mjs";
(() => {
  "use strict";
  initPreferences();
  const motion = initTactile();
  const $ = (id) => document.getElementById(id),
    data = JSON.parse($("lesson-data").textContent);
  let appViews = null;
  initLessonMechanism({ openAgentView: () => appViews?.open('mechanism-agent') });
  const initialParams = new URL(location.href).searchParams;
  // Retired feature links return to the saved lesson instead of pausing it.
  if (initialParams.has('map') || initialParams.get('view') === 'map') {
    const url = new URL(location.href); url.searchParams.delete('map');
    if (url.searchParams.get('view') === 'map') url.searchParams.delete('view');
    history.replaceState(history.state, '', url);
    initialParams.delete('map');
    if (initialParams.get('view') === 'map') initialParams.delete('view');
  }
  const restoringSecondaryView = initialParams.has('view') && initialParams.get('view') !== 'read';
  const preparationKey = "unknowntalks:preparation:v1";
  let preparation = "beginner";
  try {
    const saved = localStorage.getItem(preparationKey);
    preparation = saved === "experienced" ? "experienced" : "beginner";
  } catch { /* The choice also works without storage. */ }
  const beginnerCopy = Object.entries(data.readingLevels?.beginner?.replacements || {}).sort((a, b) => b[0].length - a[0].length);
  // Template fragments can be separate text nodes around the reader's name.
  for (const [source, target] of [...beginnerCopy]) if (source.includes("{{name}}") && target.includes("{{name}}")) {
    const parts = target.split("{{name}}");
    source.split("{{name}}").forEach((part, index) => { if (part) beginnerCopy.push([part, parts[index]]); });
  }
  const employeeForms = {
    "агентами": "цифровыми сотрудниками", "агентах": "цифровых сотрудниках", "агентов": "цифровых сотрудников", "агентом": "цифровым сотрудником", "агенту": "цифровому сотруднику", "агенте": "цифровом сотруднике", "агента": "цифрового сотрудника", "агенты": "цифровые сотрудники", "агент": "цифровой сотрудник"
  };
  const agentForms = Object.fromEntries(Object.entries(employeeForms).map(([a, b]) => [b, a]));
  function readingText(source) {
    let text = source;
    if (preparation === "beginner") {
      for (const [from, to] of beginnerCopy) text = text.split(from).join(to);
    }
    // A definition needs both names, regardless of the selected reading level.
    if (/также называют агентом|агент — синонимы|Другое название цифрового сотрудника/iu.test(text)) return text;
    const forms = preparation === "experienced" ? agentForms : employeeForms;
    return text.replace(/(?<![а-яё])(?:цифровыми сотрудниками|цифровых сотрудниках|цифровых сотрудников|цифрового сотрудника|цифровому сотруднику|цифровым сотрудником|цифровом сотруднике|цифровой сотрудник|цифровые сотрудники|агентами|агентах|агентов|агентом|агенту|агенте|агента|агенты|агент)(?![а-яё])/giu, word => {
      const result = forms[word.toLowerCase()];
      return result ? (word[0] === word[0].toUpperCase() ? result[0].toUpperCase() + result.slice(1) : result) : word;
    });
  }
  // Retain authored text so switching back restores it exactly, without touching
  // lesson state, event IDs, answers, open dialogs or the reader's own writing.
  const renderedText = new WeakMap(), renderedAttributes = new WeakMap();
  const renderedCopies = new WeakMap();
  const termWords = [...new Set(data.termHighlights || [])].filter(Boolean).sort((a, b) => b.length - a.length);
  const escapeTerm = word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const termPattern = termWords.length ? new RegExp("(?<![\\p{L}\\p{N}_])(?:" + termWords.map(escapeTerm).join("|") + ")(?![\\p{L}\\p{N}_])", "giu") : null;
  const termContent = '#participant-prelude, #messages, #skills-journal, #term-detail, #final-check, #material-body, #about';
  const termExcluded = 'header, button, input, textarea, select, option, code, pre, svg, .workbook-field, .reaction-people, .sr-only, [data-agent-ui]';
  function termFragment(text, matches) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      const term = document.createElement("strong");
      term.className = "lesson-term";
      term.textContent = match[0];
      fragment.append(term);
      cursor = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    return fragment;
  }
  function highlightedMatches(node, text) {
    return termPattern && node.closest(termContent) && !node.closest(termExcluded)
      ? [...text.matchAll(termPattern)] : [];
  }

  const readingExcluded = 'script, style, .preparation-choice, [data-participant-name], [data-participant-initial], .reaction-people, #participant-exchange .outgoing, #preparation-exchange .outgoing, #mechanism-agent, #mechanism-agent-open, #mechanism-agent-status, [data-agent-ui], input, textarea, [contenteditable]';
  function applyReadingLevel() {
    // Keep a whole authored text fragment together, so changing the reading
    // level can still replace complete explanations after terms gain markup.
    for (const node of document.querySelectorAll('[data-lesson-copy]')) {
      if (node.closest(readingExcluded)) continue;
      const previous = renderedCopies.get(node);
      const source = previous && node.textContent === previous.output ? previous.source : node.textContent;
      const output = readingText(source);
      if (!previous || node.textContent !== output) {
        node.replaceChildren(termFragment(output, highlightedMatches(node, output)));
      }
      renderedCopies.set(node, { source, output });
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement && !node.parentElement.closest(readingExcluded + ', [data-lesson-copy]')) nodes.push(node);
    }
    for (const node of nodes) {
      const previous = renderedText.get(node);
      const source = previous && node.data === previous.output ? previous.source : node.data;
      const output = readingText(source);
      const matches = highlightedMatches(node.parentElement, output);
      if (matches.length) {
        const copy = document.createElement("span");
        copy.dataset.lessonCopy = "";
        copy.append(termFragment(output, matches));
        renderedCopies.set(copy, { source, output });
        node.replaceWith(copy);
      } else {
        renderedText.set(node, { source, output });
        if (node.data !== output) node.data = output;
      }
    }
    for (const node of document.querySelectorAll('[title], [aria-label]')) {
      if (node.closest(readingExcluded) || node.matches('.message[data-speaker="sasha"], .message[data-speaker="learner"], [data-reaction-message]')) continue;
      const saved = renderedAttributes.get(node) || {};
      for (const attribute of ['title', 'aria-label']) if (node.hasAttribute(attribute)) {
        const current = node.getAttribute(attribute), previous = saved[attribute];
        const source = previous && current === previous.output ? previous.source : current;
        const output = readingText(source);
        saved[attribute] = { source, output };
        if (current !== output) node.setAttribute(attribute, output);
      }
      renderedAttributes.set(node, saved);
    }
    document.title = readingText(data.title + " · UnknownTalks");
  }
  function setPreparation(value) {
    preparation = value === "experienced" ? "experienced" : "beginner";
    try { localStorage.setItem(preparationKey, preparation); } catch { /* Keep the choice for this page. */ }
    syncReadingChoices();
    applyReadingLevel();
    renderPreparationChat();
  }
  function syncReadingChoices() {
    for (const input of document.querySelectorAll('.reading-mode input[name]')) input.checked = input.value === preparation;
    refreshControls();
  }
  for (const input of document.querySelectorAll('[name="preparation-settings"]'))
    input.addEventListener('change', () => { if (input.checked) setPreparation(input.value); });
  syncReadingChoices();
  // New messages and feedback use the same reading level.
  new MutationObserver(applyReadingLevel).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
  const discoveryPoints = data.discoveryEvents || data.discoveries || [];
  const chapters = data.chapters,
    byChapter = new Map(chapters.map((c) => [c.id, c])),
    people = new Map(data.characters.map((p) => [p.id, p]));
  people.set("system", { id: "system", name: "UnknownTalks", initial: "U", tone: "system", role: "Системные сообщения" });
  people.set("learner", { id: "learner", name: "Вы", initial: "В", tone: "neutral", role: "Ваш ответ на проверку" });
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
  const introductionMessages = data.premise.setup.map((text, index) => ({
    id: "lesson-introduction-" + index,
    type: "message", speaker: "system", paragraphs: [text], prelude: true,
  }));
  const introductionAction = { id: "lesson-introduction--start", type: "introduction-action", prelude: true };
  const introductionTimeline = [...introductionMessages, introductionAction];
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
  let reduced = motion ? !motion.enabled() : matchMedia("(prefers-reduced-motion: reduce)").matches;
  motion?.subscribe(enabled => { reduced = !enabled; });
  const key = "unknowntalks:init-ru:messenger:v4" + (data.storageId ? ":" + data.storageId : "");
  const animateUI = (element, frames, options = {}) => {
    if (!motion) return element.animate(frames, options);
    if (options.kind === 'message') {
      const arrival = performance.now();
      // Message feedback never builds a delayed animation backlog or hides
      // unread text. Old and off-screen entrances simply remain readable.
      options = { ...options, valid: () => {
        const box = element.getBoundingClientRect();
        return element.isConnected && performance.now() - arrival < 300 &&
          (!appViews || appViews.isReading()) && box.bottom > 0 && box.top < innerHeight;
      } };
    }
    return motion.frame(element, frames, options);
  };
  const state = {
    version: 4,
    participantName: "",
    participantIntroduction: "",
    preparationConfirmed: false,
    started: false,
    preview: false,
    reactions: {},
    storyComplete: false,
    tracks: [],
    expanded: [],
    collapsed: [],
    activeView: "intro",
    positions: {},
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
    contentRevision: data.contentRevision,
    exposedForms: [],
    assessmentHistory: [],
    pace: "normal",
    timingVersion: 1,
  };
  const known = new Set([
    ...discoveryPoints.map(c => "discovery--" + c.id),
    ...messages.keys(),
    ...introductionTimeline.map((event) => event.id),
    ...[...threads.keys()].map((id) => id + "--thread"),
    ...chapters.flatMap((c) => [
      c.id + "--heading",
      c.id + "--sent",
      c.id + "--reply",
      c.id + "--supplement",
      c.id + "--resources",
      c.id + "--choice",
    ]),
  ]);
  let storage = true, migrationNotice = "", forgettingLesson = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved?.version === 4) {
      state.participantName = cleanParticipantName(saved.participantName);
      state.participantIntroduction = cleanParticipantName(saved.participantIntroduction);
      state.started = saved.started === true;
      state.preparationConfirmed = saved.preparationConfirmed === true || state.started;
      state.preview = saved.preview === true;
      for (const [id, choices] of Object.entries(saved.reactions || {})) {
        const allowed = messages.get(id)?.event.reactions || [];
        if (Array.isArray(choices)) state.reactions[id] = choices.filter((emoji) => allowed.some((reaction) => reaction.emoji === emoji));
      }
      state.activeView = saved.activeView || null;
      if (saved.positions && typeof saved.positions === "object") state.positions = saved.positions;
      state.storyComplete =
        saved.storyComplete === true ||
        (Array.isArray(saved.seen) &&
          saved.seen.includes(chapters.at(-1).id + "--supplement"));
      for (const field of ["tracks", "expanded", "collapsed", "seen"])
        if (Array.isArray(saved[field]))
          state[field] = [
            ...new Set(
              saved[field]
                .map((id) => (field === "seen" ? data.aliases[id] || id : id))
                .filter(
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
          (c.decision
            ? c.decision.options[saved.choices[c.id]]
            : [0, 1].includes(saved.choices[c.id]))
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
            previousEncounters
              .map((id) => data.aliases[id] || id)
              .filter((id) => {
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
      if (saved.contentRevision !== data.contentRevision && !(data.compatibleContentRevisions || []).includes(saved.contentRevision) && saved.started) {
        state.encountered = [];
        migrationNotice = "Урок обновлён. Открытая глава и ваши ответы сохранены. Темы заново отмечаются по мере чтения; результаты проверок сохраняются только для заданий, которые не изменились.";
      }
      state.exposedForms = (saved.exposedForms || []).filter((id) => data.assessment.forms.some((f) => f.id === id));
      state.assessmentHistory = (saved.assessmentHistory || []).filter((exam) =>
        compatibleExam(exam, data.assessment, data.assessmentRevision) && exam.status === "complete" &&
        isComplete(exam, formQuestions(data.assessment, exam.formId)))
        .map((exam) => ({ ...exam, revision: data.assessmentRevision })).slice(-20);
      if (compatibleExam(saved.finalExam, data.assessment, data.assessmentRevision)) {
        const qs = formQuestions(data.assessment, saved.finalExam.formId);
        if (qs.length) {
          const answers = {};
          for (const q of qs) {
            const answer = saved.finalExam.answers?.[q.id];
            if (!validAnswer(q, answer)) break;
            answers[q.id] = answer;
          }
          state.finalExam = { ...freshExam(data.assessmentRevision, saved.finalExam.formId, saved.finalExam.mode === "independent" ? "independent" : "practice"),
            ...saved.finalExam, revision: data.assessmentRevision, answers };
          state.finalExam.status = saved.finalExam.status === "complete" && isComplete(state.finalExam, qs) ? "complete" : "active";
          if (!state.exposedForms.includes(state.finalExam.formId)) state.exposedForms.push(state.finalExam.formId);
        }
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
  function cleanParticipantName(value) {
    return typeof value === "string"
      ? value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/gu, " ").trim().slice(0, 40)
      : "";
  }
  function participantName() { return state.participantName || "Вы"; }
  function updateParticipantIdentity() {
    const name = participantName();
    const initial = Array.from(name)[0].toLocaleUpperCase("ru");
    for (const id of ["sasha", "learner"]) {
      const person = people.get(id);
      if (person) { person.name = name; person.initial = initial; }
    }
    document.querySelectorAll("[data-participant-name]").forEach((node) => { node.textContent = name; });
    document.querySelectorAll("[data-participant-initial]").forEach((node) => { node.textContent = initial; });
    document.querySelectorAll('.message[data-speaker="sasha"], .message[data-speaker="learner"]').forEach((node) => node.setAttribute("aria-label", name));
    for (const node of document.querySelectorAll("[data-reaction-message]")) {
      const event = messages.get(node.dataset.reactionMessage)?.event;
      const reaction = event?.reactions?.find((item) => item.emoji === node.dataset.reaction);
      if (reaction) updateReaction(node, event, reaction);
    }
  }
  updateParticipantIdentity();
  state.tracks = data.tracks.map((track) => track.id);
  const encountered = new Set(state.encountered);
  const seen = new Set(state.seen),
    mounted = new Map(),
    parentNodes = new Map(),
    groupNodes = new Map(),
    quizSessions = new Map(),
    introduced = new Set();
  // A saved choice places its preceding chapter in history, including text
  // added by a later editorial revision. It must not replay as a new arrival.
  for (const c of chapters)
    if (
      state.choices[c.id] !== undefined ||
      (!c.decision && seen.has(c.id + "--supplement"))
    )
      for (const id of [
        c.id + "--heading",
        ...c.intro.map((e) => e.id),
        c.id + "--sent",
        ...(c === chapters.at(-1) && !state.storyComplete
          ? []
          : [c.id + "--reply"]),
        ...(c.decision ? [c.id + "--resources"] : []),
        ...(c === chapters.at(-1) && !state.storyComplete
          ? []
          : [...c.outro.map((e) => e.id), c.id + "--supplement"]),
        ...c.threads.flatMap((t) => [
          t.id + "--thread",
          ...t.messages.map((e) => e.id),
        ]),
      ])
        seen.add(id);
  let introductionReadyAt = 0;
  let agentContextOpen = false;
  let playbackState = null;
  let timer = null,
    busy = null,
    readAll = false,
    restoring = false,
    readingDepth = 0,
    transitioning = false,
    participantEditing = false;
  let discoveryContinuation = null;
  const discoveries = createDiscoverySystem({ data, storageKey: key,
    onClaim: (point, { keyboard = false } = {}) => keepReading(() => {
      if (point) {
        discoveryContinuation = { view: state.activeView, keyboard };
      }
      save(); discoveries.render(); sync();
      if (point && discoveryContinuation) {
        const last = byQuizGroup.get(state.activeView)?.scenes.at(-1);
        const next = last && document.getElementById(last.id + '--choice');
        if (next) revealDiscoveryContinuation(next);
      }
    }),
    onFragment: id => navigate(id), openView,
  });
  discoveries.restoreProgress(seen);
  const discoveryAfter = new Map();
  for (const point of discoveryPoints) {
    if (!discoveryAfter.has(point.after)) discoveryAfter.set(point.after, []);
    discoveryAfter.get(point.after).push(point);
  }
  const discoveryEvents = events => events.flatMap(event => [event,
    ...(discoveryAfter.get(event.id) || []).map(concept => ({ id: 'discovery--' + concept.id, type: 'discovery', concept, chapter: byChapter.get(concept.chapter) })),
  ]);
  const pendingDiscovery = point => !discoveries.claimed(point.id) && state.choices[point.chapter] === undefined;
  const viewIds = ["intro", ...chapterGroups.map((g) => g.id), "final-check"];
  if (!state.started && !readAll) state.activeView = "intro";
  else if (!viewIds.includes(state.activeView)) state.activeView = reachedView();
  if (!readAll && state.activeView === "final-check" && !storyFinished()) state.activeView = reachedView();
  else if (!readAll && byQuizGroup.has(state.activeView) && !groupUnlocked(byQuizGroup.get(state.activeView))) state.activeView = reachedView();

  let measurement = null, measurementEnabled = false, measurementTimer = null;
  const measurementKey = "unknowntalks:init-ru:learning-time:v1:original";
  function visibleInViewport(node) {
    if (!node || !node.getClientRects().length) return false;
    const r = node.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }
  function measurementContext() {
    const dialog = appViews && !appViews.isReading();
    let mode = dialog ? "navigation" : "reading";
    if (!dialog && [...document.querySelectorAll(".quiz-options")].some(visibleInViewport)) mode = "response";
    else if (!dialog && [...document.querySelectorAll(".assessment-review[open], .answer-feedback, .forwards, .quiz-body .message")].some(visibleInViewport)) mode = "review";
    const conversation = document.querySelector(".conversation").getBoundingClientRect();
    const centre = document.elementFromPoint(Math.max(0, Math.min(innerWidth - 1, conversation.left + conversation.width / 2)), innerHeight / 2);
    return { visible: !document.hidden, focused: document.hasFocus(), mode,
      section: state.activeView || "opening",
      optional: !!centre?.closest('[data-thread][data-open="true"]'),
      waiting: [...document.querySelectorAll(".typing, .time-passing")].some(visibleInViewport) };
  }
  function measureTick() {
    if (!measurementEnabled || !measurement) return;
    measurement.tick(performance.now(), measurementContext());
  }
  function persistMeasurement() {
    if (!measurement) return;
    try { localStorage.setItem(measurementKey, JSON.stringify({ enabled: measurementEnabled,
      revision: data.contentRevision, assessmentRevision: data.assessmentRevision, data: measurement.data })); }
    catch { $("measurement-status").textContent = "Измерения доступны до закрытия страницы: браузер не разрешил сохранение."; }
  }
  function enableMeasurement(enabled) {
    measureTick();
    measurementEnabled = enabled;
    clearInterval(measurementTimer);
    if (enabled) {
      if (!measurement) {
        measurement = new LearningClock(performance.now());
        measurement.data.startedAfterStoryStart = state.started;
        measurement.data.startedAt = Date.now();
      }
      measurement.last = performance.now();
      measurement.interact(measurement.last);
      measurementTimer = setInterval(() => { measureTick(); persistMeasurement(); }, 1000);
    }
    $("measure-local").checked = enabled;
    $("export-learning").disabled = !measurement;
    $("clear-learning").disabled = !measurement;
    $("measurement-status").textContent = enabled ? "Запись включена только в этом браузере. Данные никуда не отправляются." : "Запись выключена.";
    if (measurement) persistMeasurement();
  }
  function recordAnswer(q, answer, practice, confidence, responseMs, formId = null) {
    if (!measurementEnabled) return;
    measureTick();
    measurement.answer({ id: q.id, outcome: q.outcome, kind: q.kind, correct: correctAnswer(q, answer),
      practice, formId: formId || (practice ? null : state.finalExam.formId),
      confidence: confidence ? Number(confidence) : null, responseMs });
    persistMeasurement();
  }
  function recordExam(exam) {
    if (!measurementEnabled) return;
    measureTick();
    measurement.mark("assessmentCompleted", { mode: exam.mode, assisted: exam.assisted, feedbackMode: exam.feedbackMode || "deferred" });
    if (exam.mode !== "independent" || exam.assisted || exam.feedbackMode === "immediate") return;
    const answers = measurement.data.answers.filter((a) => !a.practice && a.formId === exam.formId && a.correct);
    for (const kind of ["cause", "transfer"]) {
      const first = answers.find((a) => a.kind === kind);
      const name = kind === "cause" ? "firstIndependentCauseSelection" : "firstIndependentTransferSelection";
      if (first && !measurement.data.milestones[name]) measurement.data.milestones[name] = {
        activeMs: first.activeMs, validatedAtActiveMs: measurement.data.activeMs, formId: exam.formId, scope: "selected-response" };
    }
    const previous = measurement.data.exams || [];
    const completedAt = Date.now();
    for (const outcome of data.outcomes) {
      if (!outcomeResult(outcome.id, exam, data.assessment).independent) continue;
      const finalAnswer = answers.filter((a) => a.outcome === outcome.id).at(-1);
      if (!measurement.data.milestones["outcome:" + outcome.id]) measurement.data.milestones["outcome:" + outcome.id] = {
        activeMs: measurement.data.activeMs, answerActiveMs: finalAnswer?.activeMs ?? null, formId: exam.formId, scope: "selected-response" };
      const earlier = previous.find((x) => x.outcomes.includes(outcome.id));
      if (earlier && completedAt - earlier.completedAt >= 3 * 86400000)
        measurement.mark("laterFreshForm:" + outcome.id, { intervalDays: (completedAt - earlier.completedAt) / 86400000, scope: "selected-response; intervening study unknown" });
    }
    measurement.data.exams = [...previous, { completedAt, formId: exam.formId,
      outcomes: data.outcomes.filter((o) => outcomeResult(o.id, exam, data.assessment).independent).map((o) => o.id) }].slice(-20);
    if (storyFinished()) measurement.mark("storyAndIndependentAssessmentCompleted", { scope: "completion does not imply all outcomes correct" });
    persistMeasurement();
  }
  function setupMeasurement() {
    try {
      const saved = JSON.parse(localStorage.getItem(measurementKey));
      if (saved?.revision === data.contentRevision && saved.data?.version === 1 && saved.data.modes && saved.data.milestones && Array.isArray(saved.data.answers)) {
        measurement = new LearningClock(performance.now(), saved.data);
        enableMeasurement(saved.enabled === true);
      } else enableMeasurement(false);
    } catch { enableMeasurement(false); }
    $("measure-local").addEventListener("change", () => enableMeasurement($("measure-local").checked));
    $("export-learning").addEventListener("click", () => {
      if (!measurement) return;
      measureTick(); persistMeasurement();
      const payload = { version: 1, contentRevision: data.contentRevision, assessmentRevision: data.assessmentRevision,
        notice: "Local opt-in estimates. No direct observation of reading, attention or free explanation.", data: measurement.data };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = el("a"); link.href = url; link.download = "unknowntalks-learning-time.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    $("clear-learning").addEventListener("click", () => {
      clearInterval(measurementTimer); measurementEnabled = false; measurement = null;
      try { localStorage.removeItem(measurementKey); } catch { /* Session-only storage. */ }
      enableMeasurement(false);
      $("measurement-status").textContent = "Измерения удалены; запись выключена. Ваши ответы и открытая глава сохранены.";
    });
    for (const event of ["pointerdown", "keydown", "scroll"]) addEventListener(event, () => {
      if (!measurementEnabled) return;
      measureTick(); measurement.interact(performance.now());
    }, { passive: true });
    addEventListener("blur", () => { measureTick(); persistMeasurement(); });
    addEventListener("focus", () => {
      if (!measurementEnabled) return;
      // Account for the hidden interval before resetting the activity boundary.
      measurement.tick(performance.now(), { visible: false });
      measurement.interact(performance.now());
    });
    document.addEventListener("visibilitychange", () => {
      if (!measurementEnabled) return;
      measurement.tick(performance.now(), { visible: false });
      if (!document.hidden) measurement.interact(performance.now());
      persistMeasurement();
    });
    addEventListener("pagehide", () => { measureTick(); persistMeasurement(); });
  }

  const readingTop = () => Math.max(20, document.querySelector('.lesson-toolbar').getBoundingClientRect().height + 16 * interfaceScale());
  const encounterObserver = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const entry of entries)
        if (
          entry.isIntersecting &&
          entry.target.isConnected &&
          !document.hidden &&
          !agentContextOpen &&
          (!appViews || appViews.isReading()) &&
          !encountered.has(entry.target.id)
        ) {
          encountered.add(entry.target.id);
          if (measurementEnabled && entry.target.id === "human-search-distinction") {
            measureTick(); measurement.mark("firstValueVisible", { scope: "explanation visible, comprehension not observed" });
          }
          if (measurementEnabled) {
            const chapter = messages.get(entry.target.id)?.chapter;
            const group = chapter && groupByScene.get(chapter.id);
            if (group && group.scenes[0].intro.find((e) => e.type === "message")?.id === entry.target.id) {
              measureTick(); measurement.mark("chapterVisible:" + group.id, { scope: "first message visible, not completion" });
            }
          }
          changed = true;
        }
      if (changed) {
        save();
      }
    },
    { rootMargin: `-${Math.ceil(readingTop())}px 0px -40px 0px`, threshold: 0.1 },
  );
  const el = uiElement;
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
    { quiz = false, prompt = "Ваш ответ", sendLabel = "Отправить" } = {},
  ) {
    const form = el("form", "reply-options" + (quiz ? " quiz-options" : ""));
    const fieldset = el("fieldset", "reply-fieldset action-cue");
    fieldset.append(el("legend", "reply-legend", prompt));
    const name = "reply-" + ++replyGroup;
    const send = el("button", "reply-send", sendLabel);
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
      const selected = fieldset.querySelector("input[name]:checked");
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
    enhanceSelects(form);
    return form;
  }
  function infoTrigger(label, cls, action) {
    const trigger = el("span", cls, label);
    trigger.tabIndex = 0;
    trigger.setAttribute("role", "button");
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
  function showPerson(person) {
    $("person-name").textContent = person.name;
    $("person-handle").textContent = "@" + person.handle;
    $("person-role").textContent = person.role;
    $("person-description").textContent = person.description || "";
    openView("person-info", { person: person.id });
  }
  function richText(node, text) {
    if (text.includes("{{name}}")) {
      for (const [index, part] of text.split("{{name}}").entries()) {
        if (index) {
          const name = el("span", "", participantName());
          name.dataset.participantName = "";
          node.append(name);
        }
        richText(node, part);
      }
      return;
    }
    let cursor = 0;
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)|@[a-z0-9_]+(?:\.[a-z0-9_]+)*/gi)) {
      node.append(text.slice(cursor, match.index));
      if (match[1]) {
        const url = new URL(match[2], location.href);
        if (["http:", "https:"].includes(url.protocol)) {
          const link = el("a", "", match[1]);
          link.href = url.href;
          if (url.origin !== location.origin) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
          link.addEventListener("click", noteAssistance);
          node.append(link);
        } else node.append(match[0]);
        cursor = match.index + match[0].length;
        continue;
      }
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
        richText(strong, part);
        p.append(strong);
      } else richText(p, part);
    }
    return p;
  }
  function save() {
    if (forgettingLesson) return;
    state.preview = readAll;
    state.seen = [...seen];
    state.encountered = [...encountered];
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      storage = false;
    }
    $("storage-message").textContent = storage
      ? migrationNotice
      : "Браузер не разрешил сохранить прохождение. Здесь оно работает до закрытия страницы.";
  }
  function threadOpen(t) {
    return state.expanded.includes(t.id) && !state.collapsed.includes(t.id);
  }
  function currentTimeline(all = readAll) {
    if (state.activeView === "intro") return state.participantName && state.preparationConfirmed ? introductionTimeline : [];
    const group = byQuizGroup.get(state.activeView);
    if (!group) return [];
    const events = [];
    for (const c of group.scenes) {
      events.push({ id: c.id + "--heading", type: "heading", chapter: c });
      events.push(...discoveryEvents(c.intro));
      if (c.decision) {
        const selected = c.decision.options[state.choices[c.id] ?? 0] || c.decision.options[0];
        // Chapter navigation is not a message written by the learner. Keep old
        // --sent IDs readable in saved progress, but omit the synthetic reply.
        events.push({ id: c.id + "--reply", type: "message", speaker: c.decision.responder, paragraphs: [selected.reply], time: c.replyTime });
      }
      events.push(...discoveryEvents(c.outro));
      // Resources follow the scene. Restoring never mounts them ahead of a
      // missing message, and optional threads mount their contents in one pass.
      events.push({ id: c.id + "--resources", type: "supplement", chapter: c });
      for (const t of c.threads) if (threadOpen(t))
        events.push(...t.messages.map((e) => ({ ...e, parent: t.id, optional: true })));
      events.push({ id: c.id + "--supplement", type: "milestone", chapter: c });
    }
    const last = group.scenes.at(-1);
    events.push({ id: last.id + "--choice", type: "choice", chapter: last });
    if (all) return events;
    const barrier = events.findIndex(event => event.type === 'discovery' && pendingDiscovery(event.concept));
    return barrier < 0 ? events : events.slice(0, barrier + 1);
  }
  const coreIds = new Set(
    chapters
      .flatMap((c) => [
        ...c.intro,
        ...c.outro,
        ...(c.decision
          ? [{ id: c.id + "--sent" }, { id: c.id + "--reply" }]
          : []),
      ])
      .map((e) => e.id),
  );
  function storyFinished() {
    return (
      state.started &&
      chapters.every(
        (c) =>
          (!c.decision || state.choices[c.id] !== undefined) &&
          seen.has(c.id + "--supplement"),
      ) &&
      state.storyComplete
    );
  }
  function finalAvailable() { return storyFinished(); }
  function chapterReached(c) {
    return seen.has(c.id + "--heading") || state.choices[c.id] !== undefined;
  }
  function reachedView() {
    if (!state.started) return "intro";
    if (storyFinished()) return "final-check";
    const group = chapterGroups.find((g) => !groupDone(g));
    return group?.id || chapterGroups.at(-1).id;
  }
  function groupDone(group) {
    return group.scenes.every((c) => seen.has(c.id + "--supplement")) &&
      state.choices[group.scenes.at(-1).id] !== undefined;
  }
  function groupUnlocked(group) {
    const i = chapterGroups.indexOf(group);
    return state.started && (i === 0 || state.choices[chapterGroups[i - 1].scenes.at(-1).id] !== undefined);
  }
  function chapterContainer(event) {
    if (event.prelude) return $("participant-prelude");
    const chapter = event.chapter || messages.get(event.id)?.chapter || byChapter.get(event.id.split("--")[0]);
    const group = chapter && groupByScene.get(chapter.id);
    if (!group) return $("messages");
    if (!groupNodes.has(group.id)) {
      const node = el("section", "chapter-transcript");
      node.id = "transcript-" + group.id;
      node.setAttribute("aria-label", `Глава ${group.number}: ${group.title}`);
      groupNodes.set(group.id, node);
      $("messages").append(node);
    }
    return groupNodes.get(group.id);
  }
  function updateView() {
    const nameChat = $("participant-chat");
    $("participant-prelude").hidden = !state.participantName || !state.preparationConfirmed || participantEditing;
    const startAction = $(introductionAction.id);
    if (startAction) startAction.hidden = false;
    send.textContent = state.started ? "Открыть первую главу" : "Начать главу";
    if (!state.participantName || !state.preparationConfirmed || participantEditing) {
      nameChat.hidden = false;
      $("reader-frame").prepend(nameChat);
      for (const id of ["system-opening", "messages", "final-check", "reader-location"]) $(id).hidden = true;
      return;
    }
    nameChat.hidden = state.activeView !== "intro";
    if (!nameChat.hidden && nameChat.parentElement !== $("reader-frame")) $("reader-frame").prepend(nameChat);
    for (const [id, node] of groupNodes) node.hidden = id !== state.activeView;
    $("system-opening").hidden = true;
    $("messages").hidden = !byQuizGroup.has(state.activeView);
    $("final-check").hidden = state.activeView !== "final-check";
    const index = chapterGroups.findIndex((g) => g.id === state.activeView);
    $("reader-location").hidden = state.activeView === "intro";
    $("previous-chapter").hidden = false;
    $("previous-chapter").textContent = index === 0 ? "← Открыть знакомство" : "← Открыть прошлую главу";
    $("previous-chapter").href = "?view=read#" + (index === 0 ? "intro" : index < 0 ? chapterGroups.at(-1).id : chapterGroups[index - 1].id);

  }
  function rememberPosition() {
    if (agentContextOpen || appViews && !appViews.isReading() || transitioning || !state.participantName || participantEditing) return;
    const container = state.activeView === "intro" ? $("participant-chat") : state.activeView === "final-check" ? $("final-check") : groupNodes.get(state.activeView);
    const anchor = container && [...container.querySelectorAll("[id]")].find((node) => {
      const r = node.getBoundingClientRect(); return r.height && r.bottom > readingTop() && r.top < innerHeight;
    });
    state.positions[state.activeView] = { y: scrollY, anchor: anchor?.id, offset: anchor?.getBoundingClientRect().top };
  }
  function restorePosition(view, target = null) {
    const position = state.positions[view];
    if (target) {
      const node = document.getElementById(target);
      if (node?.getClientRects().length) {
        window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - readingTop(), behavior: "instant" }); return;
      }
    }
    const anchor = position?.anchor && document.getElementById(position.anchor);
    const top = anchor?.getClientRects().length
      ? scrollY + anchor.getBoundingClientRect().top - position.offset : position?.y || 0;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }
  async function animateFrame(keyframes, duration) {
    if (reduced) return;
    const animation = animateUI($("reader-frame"), keyframes, { kind: duration < 150 ? 'exit' : 'enter', duration, easing: "ease-out", fill: "forwards" });
    try { await animation.finished; } catch { /* Interrupted animation. */ }
    return animation;
  }
  async function switchView(view, { target = null, preview = false, fresh = false, rebuild = false } = {}) {
    discoveryContinuation = null;
    if (appViews && !appViews.isReading()) appViews.read({ resume: false });
    if (transitioning || !viewIds.includes(view)) return false;
    const group = byQuizGroup.get(view);
    if (group && !groupUnlocked(group)) return false;
    if (view === "final-check" && !finalAvailable()) return false;
    if (state.activeView === view && !rebuild) { if (target) restorePosition(view, target); return true; }
    if (state.activeView === "final-check" && group) noteAssistance();
    rememberPosition(); stopTimer();
    transitioning = true; $("reader-frame").setAttribute("aria-busy", "true");
    const outgoing = await animateFrame([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], 130);
    // Restore the anchor in layout coordinates, after removing the exit
    // transform. Otherwise each return drifts by the animation's six pixels.
    $("reader-frame").style.opacity = "0";
    outgoing?.cancel();
    if (rebuild) clearTranscript();
    state.activeView = view;
    if (preview) readAll = true;
    if (fresh) delete state.positions[view];
    restoring = true;
    restoreIntroductionHistory();
    if (group) {
      for (const event of currentTimeline()) {
        if (readAll || seen.has(event.id) || event.type === "choice" && groupDone(group)) mount(event, false);
        else break;
      }
      if (!mounted.has(group.scenes[0].id + "--heading")) mount({ id: group.scenes[0].id + "--heading", type: "heading", chapter: group.scenes[0] }, !readAll);
    }
    if (view === "final-check") renderFinal();
    updateView(); updateProgress();
    restoring = false;
    document.body.style.minHeight = "";
    restorePosition(view, target);
    history.replaceState(history.state, "", location.pathname + location.search);
    const incoming = await animateFrame([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], 180);
    $("reader-frame").style.opacity = "";
    incoming?.cancel();
    transitioning = false; $("reader-frame").removeAttribute("aria-busy");
    save(); sync(); scheduleTimelinePosition(true);
    return true;
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

    updateFinalControls();
    updateView();
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
          (["sasha", "learner"].includes(event.speaker) ? "outgoing" : "incoming") +
          " tone-" +
          (person?.tone || "neutral"),
      );
    node.dataset.speaker = event.speaker;
    node.setAttribute("aria-label", nameOf(event.speaker));
    const meta = el("header", "message-meta");
    const author = el("span", "message-author");
    const avatar = el("span", "avatar", person?.initial || "?");
    avatar.setAttribute("aria-hidden", "true");
    const sender = person && !["sasha", "learner", "system"].includes(event.speaker)
      ? infoTrigger(person.name, "sender", () => showPerson(person))
      : el("span", "sender", nameOf(event.speaker));
    if (["sasha", "learner"].includes(event.speaker)) {
      sender.dataset.participantName = "";
      avatar.dataset.participantInitial = "";
    }
    author.append(avatar, sender);
    meta.append(author);
    const time = el("time", "", event.time || "");
    meta.append(time);
    node.append(meta);
    if (person && (event.speaker === "system" ? event.introducesSpeaker : !forwarded && !introduced.has(person.id))) {
      node.append(el("span", "role", person.role));
      introduced.add(person.id);
    }
    meta.querySelector(".sender").title = person?.role || "";
    for (const p of event.paragraphs || []) node.append(paragraph(p));
    if (event.reactions?.length) appendReactions(node, event, forwarded);
    for (const attachment of event.attachments || []) {
      const figure = diagram(attachment);
      if (!forwarded) figure.id = attachment.id;
      figure.classList.add("message-attachment");
      node.append(figure);
    }
    return node;
  }
  function appendReactions(node, event, forwarded) {
    const strip = el("div", "message-reactions"); strip.setAttribute("aria-label", "Реакции на сообщение");
    for (const reaction of event.reactions) {
      const chip = forwarded ? el("span", "message-reaction") : button("", () => {
        const selected = new Set(state.reactions[event.id] || []);
        selected.has(reaction.emoji) ? selected.delete(reaction.emoji) : selected.add(reaction.emoji);
        state.reactions[event.id] = [...selected]; save();
        document.querySelectorAll(`[data-reaction-message="${event.id}"]`).forEach((button) => {
          if (button.dataset.reaction === reaction.emoji) updateReaction(button, event, reaction);
        });
        if (!reduced) animateUI(chip, [{ opacity: .7 }, { opacity: 1 }], { kind: 'press', duration: 180 });
      }, "message-reaction");
      chip.dataset.reactionMessage = event.id; chip.dataset.reaction = reaction.emoji;
      updateReaction(chip, event, reaction); strip.append(chip);
    }
    node.append(strip);
  }
  function updateReaction(chip, event, reaction) {
    const selected = state.reactions[event.id]?.includes(reaction.emoji) || false;
    const names = reaction.by.map(nameOf), people = [...names, ...(selected ? ["вы"] : [])];
    chip.replaceChildren(el("span", "reaction-emoji", reaction.emoji), el("span", "reaction-people", people.join(", ")));
    chip.classList.toggle("selected", selected);
    chip.title = `${reaction.label}. ${selected ? "Нажмите, чтобы убрать свою реакцию" : "Нажмите, чтобы присоединиться"}`;
    if (chip.tagName === "BUTTON") { chip.setAttribute("aria-pressed", String(selected)); chip.setAttribute("aria-label", `${reaction.emoji} ${reaction.label}. Реакция: ${people.join(", ")}`); }
  }
  function diagram(event) {
    const fig = el("figure", "visual visual-" + event.kind);
    fig.setAttribute("aria-label", event.title);
    fig.append(el("figcaption", "", event.title));
    if (["table", "token-table"].includes(event.kind)) {
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
      for (const [index, item] of event.items.entries()) {
        const row = el("tr");
        const values = event.kind === "token-table"
          ? [String(index + 1), item.label, item.text.replace(/^ID /, "")]
          : [item.label, item.text, item.result];
        for (const [column, value] of values.entries()) {
          const cell = el(column === 0 ? "th" : "td", "", value);
          if (column === 0) cell.scope = "row";
          if (event.kind === "token-table" && column) cell.className = "token-cell";
          row.append(cell);
        }
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
    if (t.id === "tokens-bpe") {
      const a = el("a", "small", "Открыть эксперимент с токенизатором");
      a.href = "demos/tokens.html";
      content.append(a);
    }
    panel.append(preview, content);
    setThreadView(panel, threadOpen(t));
    toggle.addEventListener("click", () =>
      keepReading(() => {
        const open = panel.dataset.open !== "true";
        if (open) noteAssistance();
        state.expanded = open
          ? [...new Set([...state.expanded, t.id])]
          : state.expanded.filter((id) => id !== t.id);
        state.collapsed = open
          ? state.collapsed.filter((id) => id !== t.id)
          : [...new Set([...state.collapsed, t.id])];
        if (open) fillThread(t);
        setThreadView(panel, open, true);
        save();
        sync();
      }),
    );
    return panel;
  }
  function fillThread(t) {
    for (const e of t.messages) mount({ ...e, parent: t.id, optional: true }, !readAll);
  }
  function setThreadView(panel, open, animate = false) {
    const t = threads.get(panel.dataset.thread).thread;
    const changed = panel.dataset.open !== String(open);
    panel.dataset.open = String(open);
    const content = panel.querySelector(".thread-content");
    panel.querySelector(".thread-toggle").setAttribute("aria-expanded", String(open));
    panel.querySelector(".thread-action").textContent = open
      ? "Свернуть переписку" : `Дополнительно · ${formatMinutes(data.learningTime.threads[t.id].range)}`;
    if (!changed && panel._motion) return;
    panel._motion?.cancel(); panel._motion = null;
    if (animate && changed && !reduced) {
      content.hidden = false;
      content.style.overflow = "hidden";
      content.style.height = "";
      const height = content.getBoundingClientRect().height / interfaceScale();
      content.style.height = open ? "0px" : height + "px";
      const motion = animateUI(content, open
        ? [{ height: "0px", opacity: 0 }, { height: height + "px", opacity: 1 }]
        : [{ height: height + "px", opacity: 1 }, { height: "0px", opacity: 0 }],
        { kind: 'fold', duration: 220, easing: "ease-in-out", fill: "both" });
      panel._motion = motion;
      motion.finished.then(() => {
        if (panel._motion !== motion) return;
        content.hidden = !open; motion.cancel(); panel._motion = null;
        content.style.overflow = ""; content.style.height = "";
      }).catch(() => {});
    } else { content.hidden = !open; content.style.overflow = ""; content.style.height = ""; }
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
        title: `Практика с Николаем · глава ${group.number}`,
        participants: ["nina", "learner"],
      });
      const toggle = preview.querySelector(".thread-toggle");
      toggle.setAttribute("aria-controls", group.id + "--quiz-body");
      const body = el("div", "quiz-body");
      body.id = group.id + "--quiz-body";
      body.hidden = true;
      check.append(preview, body);
      toggle.addEventListener("click", () =>
        keepReading(() => setQuizOpen(check, check.dataset.open !== 'true', true)),
      );
      updateQuizToggle(check);
      node.append(check);
    }
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
  function setQuizOpen(check, open, animate = false) {
    const body = check.querySelector(".quiz-body");
    check._motion?.cancel(); check._motion = null;
    body.style.height = ""; body.style.overflow = "";
    check.dataset.open = String(open);
    body.hidden = false;
    updateQuizToggle(check);
    if (open) noteAssistance();
    if (open && !quizSessions.has(check.dataset.quiz)) {
      const c = byQuizGroup.get(check.dataset.quiz);
      startQuiz(c.id, c.checks, body);
    }
    if (animate && !reduced) {
      const height = body.getBoundingClientRect().height / interfaceScale();
      body.style.overflow = 'clip'; body.style.height = open ? '0px' : height + 'px';
      const animation = animateUI(body, open
        ? [{ height: '0px' }, { height: height + 'px' }]
        : [{ height: height + 'px' }, { height: '0px' }], { kind: 'fold', duration: 450, fill: 'both' });
      check._motion = animation;
      animation.finished.then(() => {
        if (check._motion !== animation) return;
        body.hidden = !open; body.style.height = ''; body.style.overflow = ''; animation.cancel(); check._motion = null;
      });
    } else body.hidden = !open;
  }
  function showChoice(c) {
    const group = groupByScene.get(c.id), index = chapterGroups.indexOf(group);
    const actions = el("div", "chapter-continuation");
    const last = index === chapterGroups.length - 1;
    const next = el("a", buttonVariants({ variant: "action" }) + " chapter-navigation chapter-continue", last ? "К итоговой проверке →" : `Далее: ${chapterGroups[index + 1].title} →`);
    next.dataset.slot = "button"; next.dataset.variant = "action"; next.dataset.size = "default";
    next.href = "?view=read#" + (last ? "final-check" : chapterGroups[index + 1].id);
    next.addEventListener("click", async event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (await continueChapter(group)) history.replaceState(history.state, "", next.href);
    });
    if (!last) next.setAttribute("aria-label", "Открыть следующую главу: " + chapterGroups[index + 1].title);
    actions.append(next);
    return actions;
  }
  async function continueChapter(group) {
    if (busy || transitioning || !readAll && discoveryPoints.some(p => group.scenes.some(c => c.id === p.chapter) && pendingDiscovery(p))) return;
    const last = group.scenes.at(-1), index = chapterGroups.indexOf(group);
    if (!readAll) {
      for (const scene of group.scenes) state.choices[scene.id] ??= 0;
      if (index === chapterGroups.length - 1) state.storyComplete = true;
      save();
    }
    return switchView(index === chapterGroups.length - 1 ? "final-check" : chapterGroups[index + 1].id);
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
      const group = groupByScene.get(event.chapter.id);
      const sceneNumber = group.scenes.indexOf(event.chapter) + 1;
      if (sceneNumber === 1) {
        node.classList.add("chapter-start");
        node.append(el("h2", "", `Глава ${group.number} — ${group.title}`));
      }
      if (newDay) node.append(el("p", "episode-meta", `День ${event.chapter.day}`));
      node.append(el("h3", "episode-title", event.chapter.title));
    } else if (event.type === "discovery") node = discoveries.card(event.concept);
    else if (event.type === "message") node = bubble(event);
    else if (event.type === "narration") node = bubble({ ...event, speaker: "system", paragraphs: [event.text] });
    else if (event.type === "visual") {
      const chapter = messages.get(event.id)?.chapter;
      const before = chapter?.intro.slice(0, chapter.intro.findIndex((e) => e.id === event.id));
      const speaker = event.speaker || before?.findLast((e) => e.type === "message")?.speaker || "system";
      node = bubble({ id: event.id, speaker, paragraphs: [], attachments: [{ ...event, id: event.id + "--figure" }] });
    }
    else if (event.type === "choice") node = showChoice(event.chapter);
    else if (event.type === "introduction-action") {
      node = el("div", "chapter-continuation");
      node.append(send);
      node.hidden = false;
    } else if (event.type === "milestone") {
      node = el("span");
      node.hidden = true;
    } else if (event.type === "supplement") node = supplement(event.chapter);
    else if (event.type === "thread")
      node = threadPanel(event.chapter, event.thread);
    else return;
    node.id = event.id;
    if (!node.isConnected)
      (event.parent ? parentNodes.get(event.parent) : chapterContainer(event))?.append(
        node,
      );
    mounted.set(event.id, node);
    if (event.type === "message" && !event.prelude) encounterObserver.observe(node);
    const previous = node.previousElementSibling;
    if (node.matches(".message") && previous?.matches(".message") && previous.dataset.speaker === node.dataset.speaker)
      node.classList.add("message-continuation");
    if (mark && event.type !== "choice") {
      seen.add(event.id);
      if (event.id === chapters.at(-1).id + "--supplement") {
        state.storyComplete = true;
        if (measurementEnabled) { measureTick(); measurement.mark("storyCompleted"); }
      }
      save();
    }
    updateProgress();
    if (mark && !restoring && !reduced && !readAll && ["message", "visual", "narration"].includes(event.type))
      animateUI(node, [{ opacity: .8, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }], { kind: 'message', duration: 190, easing: "ease-out" });
    if (event.type === 'choice' && discoveryContinuation?.view === state.activeView) revealDiscoveryContinuation(node);
  }
  // Claiming explicitly asks to continue. Bring the next action into view once,
  // after the closing reply; ordinary incoming messages still never auto-scroll.
  function revealDiscoveryContinuation(node) {
    const intent = discoveryContinuation; discoveryContinuation = null;
    const target = node.querySelector('.chapter-continue'); if (!target) return;
    const valid = () => intent.view === state.activeView && appViews?.isReading() && target.isConnected;
    const finish = () => { if (valid() && intent.keyboard) target.focus({ preventScroll: true }); };
    const reveal = () => target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    if (!motion) { requestAnimationFrame(() => { if (valid()) { reveal(); finish(); } }); return; }
    let started = false;
    motion.enqueue({ key: 'discovery-continue', valid,
      run: async signal => {
        if (!await motion.begin(signal) || !valid()) return;
        started = true;
        const box = target.getBoundingClientRect();
        if (box.bottom <= innerHeight - 24 && box.top >= readingTop()) return;
        await new Promise(resolve => {
          const done = () => { clearTimeout(timeout); document.removeEventListener('scrollend', done); signal.removeEventListener('abort', stop); resolve(); };
          const stop = () => { window.scrollTo({ top: scrollY, behavior: 'instant' }); done(); };
          const timeout = setTimeout(done, 650);
          document.addEventListener('scrollend', done, { once: true }); signal.addEventListener('abort', stop, { once: true });
          target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        if (!signal.aborted) motion.end();
      }, finish: () => { if (valid()) { if (!started) reveal(); finish(); } },
    });
  }
  function stopTimer() {
    clearTimeout(timer);
    timer = null;
    if (busy) {
      keepReading(() => busy.typing?.remove());
      busy = null;
    }
    updatePlayback();
  }
  function updatePlayback() {
    const kind = !agentContextOpen && (!appViews || appViews.isReading()) && busy
      ? busy.event.type === "message" ? "message" : "loading" : null;
    if(kind === playbackState) return;
    playbackState = kind;
    document.dispatchEvent(new CustomEvent('unknowntalks:playback', { detail: { kind } }));
  }
  // Incoming messages never scroll on the reader's behalf. Keep the visible
  // paragraph anchored even when a reply form disappears or a thread above it grows.
  function keepReading(change) {
    if (appViews && !appViews.isReading() || restoring || readingDepth || transitioning) return change();
    const candidates = document.querySelectorAll(
      "#participant-chat .message, #messages .message, #messages .chapter-heading, #messages .visual, .quiz-body > .message",
    );
    const anchor = [...candidates].find((node) => {
      const r = node.getBoundingClientRect();
      return r.height && r.bottom > readingTop() && r.top < innerHeight - 60;
    });
    const y = scrollY,
      top = anchor?.getBoundingClientRect().top;
    // Retain reading space while a large composer is replaced by a short reply.
    // Otherwise the browser clamps scrollY to a temporarily smaller document.

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
    }
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
    if (agentContextOpen || !appViews && restoringSecondaryView || appViews && !appViews.isReading() || !state.participantName || participantEditing || busy || readAll || transitioning || (!byQuizGroup.has(state.activeView) && !(state.activeView === "intro" && !state.started))) {
      updatePlayback();
      return;
    }
    const remainingIntroductionPause = introductionReadyAt - performance.now();
    if (remainingIntroductionPause > 0) {
      timer = setTimeout(advance, remainingIntroductionPause);
      updatePlayback();
      return;
    }
    const event = currentTimeline().find((e) => !mounted.has(e.id));
    if (!event) {
      updatePlayback();
      updateProgress();
      return;
    }
    if (
      seen.has(event.id) ||
      event.type === "discovery" ||
      event.type === "choice" ||
      event.type === "introduction-action" ||
      event.type === "supplement" ||
      event.type === "milestone" ||
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
    const target = event.parent ? parentNodes.get(event.parent) : chapterContainer(event);
    const typing = typingFor(event);
    keepReading(() => target?.append(typing));
    busy = { event, typing };
    updatePlayback();
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
      updatePlayback();
      return;
    }
    advance();
    updateProgress();
    updatePlayback();
  }
  function clearTranscript() {
    $("reader-frame").prepend($("participant-chat"));
    stopTimer();
    for (const q of quizSessions.values()) {
      q.active = false;
      clearTimeout(q.timer);
    }
    mounted.clear();
    parentNodes.clear();
    groupNodes.clear();
    quizSessions.clear();
    introduced.clear();
    encounterObserver.disconnect();
    document.body.style.minHeight = "";
    $("participant-prelude").replaceChildren();
    $("messages").replaceChildren();
    $("final-check-body").replaceChildren();
  }
  function restoreIntroductionHistory() {
    if (state.activeView !== "intro") return;
    for (const event of introductionTimeline) {
      if (state.started || seen.has(event.id)) mount(event, false);
      else break;
    }
  }
  function renderRestored() {
    restoring = true;
    clearTranscript();
    const group = byQuizGroup.get(state.activeView);
    restoreIntroductionHistory();
    for (const e of currentTimeline()) {
      if (readAll || seen.has(e.id) || e.type === "choice" && groupDone(group)) mount(e, false);
      else break;
    }
    if (state.activeView === "final-check") renderFinal();
    updateView();
    restoring = false;
    requestAnimationFrame(() => {
      if (state.participantName) restorePosition(state.activeView);
      else window.scrollTo({ top: 0, behavior: "instant" });
      sync();
    });
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
    if (previous) { previous.active = false; clearTimeout(previous.timer); }
    if (!qs.length) return;
    const session = { id, qs, body, index: 0, active: true,
      inlineFirst: !!body.closest("[data-quiz]"), isChapter: !!body.closest("[data-quiz]") };
    quizSessions.set(id, session);
    body.replaceChildren();
    const answers = session.isChapter ? state.chapterAnswers : state.finalExam.answers;
    while (session.index < qs.length && Number.isInteger(answers[qs[session.index].id])) {
      const q = qs[session.index], answer = answers[q.id];
      if (!session.inlineFirst || session.index) body.append(quizMessage("nina", q.question));
      body.append(quizMessage("learner", q.options[answer]));
      if (session.isChapter) body.append(quizMessage("nina", answerFeedback(q, answer)));
      session.index++;
    }
    session.inlineFirst = session.isChapter && session.index === 0;
    if (session.index === qs.length) finishQuiz(session);
    else if (session.index || session.isChapter) ask(session);
    else ask(session);
  }
  function answerFeedback(q, answer) {
    if (q.exercise) return (correctAnswer(q, answer) ? "Работа выполнена верно. " : "В решении есть что исправить. ") + solutionText(q.exercise);
    return (answer === q.correct ? "Вы выбрали подходящее объяснение. " :
      `Здесь подходит ответ «${q.options[q.correct]}». `) + q.explanation;
  }
  function appendReferences(body, q) {
    const forwards = el("div", "forwards");
    forwards.append(el("p", "small muted", "Вернитесь к связи, которая поможет разобраться:"));
    for (const ref of q.references) forwards.append(forwarded(ref));
    body.append(forwards);
  }
  function finishQuiz(session) {
    session.body.append(quizMessage("nina", "Практику разобрали. В конце истории можно проверить эти связи на новых ситуациях без подсказок или продолжить практику с разбором каждого ответа."));
  }
  function ask(session) {
    if (session.index >= session.qs.length) { finishQuiz(session); return; }
    const q = session.qs[session.index];
    const showOptions = () => {
      const options = replyComposer(q.options, (i) => {
        if (Number.isInteger(state.chapterAnswers[q.id])) return false;
        const responseMs = measurement ? measurement.data.modes.response - session.responseStart : null;
        options.remove();
        session.body.append(quizMessage("learner", q.options[i]));
        state.chapterAnswers[q.id] = i;
        state.answers[q.id] = [...(state.answers[q.id] || []), i].slice(-30);
        recordAnswer(q, i, true, null, responseMs);
        save();
        quizIncoming(session, answerFeedback(q, i), () => {
          if (i !== q.correct) appendReferences(session.body, q);
          session.index++;
          if (session.index === session.qs.length) finishQuiz(session);
          else {
            const next = button("Следующая ситуация", () => { next.remove(); ask(session); }, "quiz-next");
            session.body.append(next);
          }
          discoveries.render();
        });
      }, { quiz: true, prompt: "Как вы это объясните?", sendLabel: "Отправить" });
      session.responseStart = measurement?.data.modes.response || 0;
      session.body.append(options);
    };
    if (session.inlineFirst && session.index === 0) { session.inlineFirst = false; showOptions(); }
    else quizIncoming(session, q.question, showOptions);
  }
  function updateFinalControls() {
    const note = $("assessment-mode");
    if (note) note.textContent = state.finalExam.feedbackMode === "immediate"
      ? "Практика: после ответа сразу появится разбор. Можно прерваться."
      : state.finalExam.assisted
        ? "Вы открыли материал урока во время проверки. Эта попытка будет отмечена как практика с помощью; разбор — после всех ответов."
        : state.finalExam.mode === "practice"
          ? "Это повтор знакомых заданий: практика без нового подтверждения. Разбор — после всех ответов."
        : "Самостоятельная проверка: разбор появится после всех ответов. Можно прерваться; открытие объяснений урока отмечает помощь.";
  }
  let finalChanging = false;
  async function changeFinal(action, { revealFeedback = false } = {}) {
    if (finalChanging || transitioning) return;
    finalChanging = true;
    const body = $("final-check-body");
    body.setAttribute("aria-busy", "true");
    body.inert = true;
    let animation;
    if (!reduced) {
      animation = animateUI(body, [{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }], { kind: 'exit', duration: 120, fill: "forwards", easing: "ease-in" });
      try { await animation.finished; } catch { /* No motion is required for the action. */ }
    }
    if (animation) body.style.opacity = "0";
    action();
    renderFinal();
    if (state.activeView === "final-check") {
      let target = $("final-check");
      if (revealFeedback) {
        const question = $("assessment-question"), feedback = $("assessment-feedback");
        const fits = feedback.getBoundingClientRect().bottom - question.getBoundingClientRect().top < innerHeight - readingTop();
        target = fits ? question : body.querySelector('[data-speaker="learner"]');
      }
      window.scrollTo({ top: Math.max(0, scrollY + target.getBoundingClientRect().top - readingTop()), behavior: "instant" });
      delete state.positions["final-check"];
    }
    animation?.cancel();
    if (!reduced && state.activeView === "final-check") {
      animation = animateUI(body, [{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { kind: 'enter', duration: 180, easing: "ease-out" });
      try { await animation.finished; } catch { /* Leaving this chapter is allowed. */ }
    }
    body.style.opacity = "";
    animation?.cancel();
    body.inert = false;
    body.removeAttribute("aria-busy"); finalChanging = false;
    save(); updateTimeline(); discoveries.render();
    if (state.activeView === "final-check") {
      const focus = revealFeedback ? $("assessment-feedback") : body.querySelector("[tabindex='-1']");
      if (focus) { focus.tabIndex = -1; focus.focus({ preventScroll: true }); }
    }
  }
  function startFinalExam(purpose = "independent") {
    if (!finalAvailable()) return;
    changeFinal(() => {
      const { form, fresh } = nextForm(data.assessment, state.exposedForms, purpose);
      state.finalExam = { ...freshExam(data.assessmentRevision, form.id, purpose === "independent" && fresh ? "independent" : "practice"),
        status: "active", feedbackMode: purpose === "practice" ? "immediate" : "deferred", pendingFeedback: null, responseSupport: {} };
      state.exposedForms = [...new Set([...state.exposedForms, form.id])];
    });
  }
  function renderFinal() {
    const body = $("final-check-body"), exam = state.finalExam;
    body.replaceChildren();
    if (exam.status === "idle") {
      const { fresh } = nextForm(data.assessment, state.exposedForms);
      const welcome = quizMessage("nina", `${storyFinished() ? "Историю мы закончили." : "Вы открыли задания в режиме просмотра."} Теперь проверим ${data.outcomes.length} навыков. ${data.skills ? "Для каждого выберите объяснение и выполните практическое задание на новых условиях." : "В каждой ситуации ответьте на два вопроса."} Разбор появится после всех ответов, чтобы не подсказывать следующие решения.`);
      welcome.tabIndex = -1;
      welcome.append(paragraph(fresh
        ? "Навык отмечается как подтверждённый в заданиях, если верны и объяснение, и все части практической работы. Свободный текст собственной задачи сохраняется без автоматической оценки. Долговременное освоение здесь не проверяется. Если хочется сначала разобраться с поддержкой, выберите практику: там объяснение следует сразу за ответом."
        : "Оба набора самостоятельной проверки уже открывались. Их повтор останется практикой. Свежих заданий для нового подтверждения в этом уроке больше нет; ваши результаты сохранены в итоговом разборе."));
      body.append(welcome);
      const actions = el("div", "final-actions");
      actions.append(el("p", "small muted", `Проверка с разбором ${formatMinutes(data.learningTime.assessment)} · ответы сохраняются в этом браузере`),
        button(fresh ? "Проверить самостоятельно" : "Повторить проверку как практику", () => startFinalExam(), "conversation-action"),
        button(`Практика с разбором · ${formatMinutes(data.learningTime.guidedPractice)}`, () => startFinalExam("practice"), "conversation-action"));
      body.append(actions); return;
    }
    const qs = formQuestions(data.assessment, exam.formId);
    if (exam.status === "complete") { renderFinalResult(body, qs, exam); return; }
    const unanswered = qs.findIndex((q) => !validAnswer(q, exam.answers[q.id]));
    const frontier = unanswered < 0 ? qs.length - 1 : unanswered;
    const pending = qs.findIndex((q) => q.id === exam.pendingFeedback && validAnswer(q, exam.answers[q.id]));
    const resume = pending >= 0 ? pending : frontier;
    const viewed = qs.findIndex((q) => q.id === exam.viewQuestion);
    const index = viewed >= 0 && viewed <= frontier ? viewed : resume;
    const q = qs[index], answered = validAnswer(q, exam.answers[q.id]);
    const progress = el("nav", "final-navigation"); progress.setAttribute("aria-label", "Навигация по ситуациям");
    const move = (next) => changeFinal(() => {
      exam.viewQuestion = qs[next].id;
      if (pending >= 0 && next > pending) exam.pendingFeedback = null;
    });
    const back = button("←", () => move(index - 1), "exercise-nav-button");
    back.disabled = index === 0; back.setAttribute("aria-label", "Предыдущая ситуация");
    const forward = button("→", () => move(index + 1), "exercise-nav-button");
    forward.disabled = index >= frontier; forward.setAttribute("aria-label", "Следующая доступная ситуация");
    const position = el("span", "final-step small muted", exam.feedbackMode === "immediate"
      ? `Ситуация ${index + 1} из ${qs.length}`
      : `Ситуация ${Math.floor(index / 2) + 1} из ${qs.length / 2} · ${index % 2 ? "Практическая работа" : "Объяснение"}`);
    position.setAttribute("role", "status"); progress.append(back, position, forward);
    const question = quizMessage("nina", q.question); question.tabIndex = -1; question.id = "assessment-question";
    if (answered && q.exercise) question.append(paragraph(q.exercise.prompt));
    if (answered) {
      const answer = quizMessage("learner", answerText(q, exam.answers[q.id]));
      if (exam.feedbackMode !== "immediate") {
        body.append(progress, question, answer, quizMessage("nina", "Ответ сохранён. Разберём его после завершения проверки."));
        const actions = el("div", "final-actions");
        actions.append(button("К текущему вопросу", () => move(frontier), "conversation-action"));
        body.append(actions); return;
      }
      const feedback = quizMessage("nina", answerFeedback(q, exam.answers[q.id]));
      feedback.classList.add("answer-feedback");
      feedback.id = "assessment-feedback";
      const actions = el("div", "final-actions");
      const reviewing = index < resume;
      actions.append(button(reviewing ? `Вернуться к ситуации ${resume + 1}` : isComplete(exam, qs) ? "Завершить разговор" : "Следующая ситуация", () => changeFinal(() => {
        if (reviewing) { exam.viewQuestion = qs[resume].id; return; }
        exam.pendingFeedback = null; exam.viewQuestion = null;
        if (isComplete(exam, qs)) completeFinalExam(exam);
      }), "conversation-action"));
      body.append(progress, question, answer, feedback, actions);
      return;
    }
    let responseStart = measurement?.data.modes.response || 0;
    const submitAnswer = (answer) => {
      if (validAnswer(q, exam.answers[q.id]) || finalChanging) return false;
      measureTick();
      const responseMs = measurement ? measurement.data.modes.response - responseStart : null;
      const immediate = exam.feedbackMode === "immediate";
      recordAnswer(q, answer, exam.mode !== "independent" || exam.assisted, null, responseMs, exam.formId);
      exam.answers[q.id] = answer;
      exam.responseSupport ||= {};
      exam.responseSupport[q.id] = { assisted: exam.assisted, feedbackBeforeAnswer: immediate && Object.keys(exam.answers).length > 1 };
      exam.pendingFeedback = immediate ? q.id : null;
      exam.viewQuestion = immediate ? q.id : null;
      delete exam.draft;
      if (!immediate && isComplete(exam, qs)) completeFinalExam(exam);
      save();
      changeFinal(() => {}, { revealFeedback: immediate });
    };
    const options = q.exercise ? exerciseForm(q.exercise, {
      response: exam.draft?.question === q.id ? exam.draft.response : {},
      onChange: response => { exam.draft = { question: q.id, response }; save(); },
      onSubmit: submitAnswer,
    }) : replyComposer(q.options, submitAnswer, { quiz: true, prompt: "Выберите одно объяснение", sendLabel: "Отправить" });
    options.addEventListener("change", (event) => {
      if (!event.target.matches('input[type="radio"]')) return;
      exam.draft = { question: q.id, answer: Number(event.target.value) }; save();
    });
    if (!q.exercise && exam.draft?.question === q.id && q.options[exam.draft.answer] !== undefined) {
      options.querySelectorAll('input[type="radio"][name]')[exam.draft.answer].checked = true;
      options.querySelector('button[type="submit"]').disabled = false;
    }
    refreshControls(options);
    options.classList.add("final-options");
    options.querySelectorAll(".action-cue").forEach((node) => node.classList.remove("action-cue"));
    const mode = el("p", "small muted"); mode.id = "assessment-mode";
    body.append(progress, question, options, mode); updateFinalControls();
  }
  function completeFinalExam(exam) {
    if (exam.status === "complete") return;
    exam.status = "complete";
    state.assessmentHistory.push(JSON.parse(JSON.stringify(exam)));
    state.assessmentHistory = state.assessmentHistory.slice(-20);
    recordExam(exam);
  }
  function renderFinalResult(body, qs, exam) {
    const independent = exam.mode === "independent" && !exam.assisted && exam.feedbackMode !== "immediate";
    const result = quizMessage("nina", "Вы ответили на все ситуации. Здесь сохранены ваши ответы и объяснения — можно вернуться к любой теме.");
    result.tabIndex = -1;
    for (const outcome of data.outcomes) {
      const detail = el("details", "assessment-review outcome-review");
      detail.dataset.outcome = outcome.id;
      const summary = el("summary", "", outcome.title);
      detail.append(summary);
      const evidence = outcomeResult(outcome.id, exam, data.assessment);
      detail.append(el("p", "small", evidence.independent ? "Подтверждено в новых заданиях: объяснение и практическая работа выполнены верно."
        : evidence.correct ? "Ответы верны; эта попытка была с поддержкой или повторной."
          : "Нужен разбор: в одном из ответов потеряна важная связь."));
      for (const q of qs.filter((q) => q.outcome === outcome.id)) {
        const exchange = el("section", "answer-review");
        exchange.append(paragraph(q.question));
        if (q.exercise) exchange.append(paragraph(q.exercise.prompt));
        const reply = el("blockquote", "review-answer");
        reply.append(el("span", "small muted", "Ваш ответ"), paragraph(answerText(q, exam.answers[q.id])));
        exchange.append(reply, paragraph(answerFeedback(q, exam.answers[q.id])));
        if (!correctAnswer(q, exam.answers[q.id])) appendReferences(exchange, q);
        detail.append(exchange);
      }
      result.append(detail);
    }
    result.append(paragraph(independent
      ? "Вы отвечали на новые задания до разбора. В результате отдельно учитываются объяснение и практическая работа. Это подтверждает выполнение работы в этих условиях. Для своей задачи проверьте результат отдельно; долговременное освоение здесь не измеряется."
      : exam.feedbackMode === "immediate"
        ? "Мы разбирали ответы по ходу разговора: объяснения могли помочь дальше. Это практика с разбором; самостоятельного подтверждения она не даёт."
        : "Задания уже открывались или во время попытки был открыт материал урока. Ответы сохранены как практика с поддержкой, без нового самостоятельного подтверждения."));
    body.append(result);
    const actions = el("div", "final-actions");
    actions.append(button("Журнал навыков", () => { noteAssistance(); discoveries.open(); }, "conversation-action"));
    body.append(actions);
    const { fresh } = nextForm(data.assessment, state.exposedForms);
    const next = quizMessage("nina", "А в следующем уроке разберём саму агентную систему: что поддерживает её работу, какие части можно менять под свою задачу и где нужны границы. К этому разговору можно вернуться в любое время.");
    body.append(next);
    const retry = el("div", "final-actions");
    retry.append(button(fresh ? "Новая самостоятельная проверка" : "Повторить проверку как практику", () => startFinalExam(), "conversation-action"),
      button("Практика с разбором", () => startFinalExam("practice"), "conversation-action"));
    body.append(retry);
  }
  function noteAssistance() {
    if (state.finalExam.status === "active" && !state.finalExam.assisted) {
      state.finalExam.assisted = true; save(); updateFinalControls();
    }
  }
  const timelineRows = new Map();
  let lastTimelineChapter = null;
  function openTimelineChapter(view) {
    const available = view === "intro" || (view === "final-check" ? finalAvailable() : groupUnlocked(byQuizGroup.get(view)));
    if (!available) {
      const jump = timelineRows.get(view).jump;
      if (!reduced) animateUI(jump, [0, -4, 4, -2, 2, 0].map(x => ({ transform: `translateX(${x}px)`, easing: "ease-in-out" })), {
        kind: "panel", duration: 337.5, fill: "none", key: "chapter-unavailable",
        valid: () => jump.isConnected && document.body.dataset.appView === "chapters" && jump.getAttribute("aria-disabled") === "true",
      });
      return;
    }
    appViews.read({ resume: false });
    switchView(view);
  }
  function initializeTimeline() {
    const navigationChapters = [{ id: "intro", number: 0, title: "Знакомство" }, ...chapterGroups];
    for (const group of navigationChapters) {
      const row = el("li", "timeline-step"); row.dataset.chapter = group.id;
      const jump = button("", () => openTimelineChapter(group.id), "timeline-jump");
      const icon = el("span", "chapter-state-icon", String(group.number)); icon.setAttribute("aria-hidden", "true");
      const text = el("span", "chapter-link-copy");
      const status = el("span", "chapter-state sr-only");
      const duration = group.id === "intro" ? "Начало истории" : formatMinutes(data.learningTime.groups.find((g) => g.id === group.id).range);
      jump.title = `${group.title} · ${duration}`;
      text.append(el("span", "", group.title), el("span", "chapter-time", duration), status);
      jump.append(icon, text); row.append(jump); $("timeline-chapters").append(row);
      timelineRows.set(group.id, { row, jump, icon, status });
    }
    const row = el("li", "timeline-step timeline-final-step"), jump = $("timeline-final");
    row.dataset.chapter = "final-check"; jump.classList.add("timeline-jump"); jump.replaceChildren();
    const icon = el("span", "chapter-state-icon", String(chapterGroups.length + 1)); icon.setAttribute("aria-hidden", "true");
    const copy = el("span", "chapter-link-copy"), status = el("span", "chapter-state sr-only");
    copy.append(el("span", "", "Проверим понимание"), el("span", "chapter-time", formatMinutes(data.learningTime.assessment)), status);
    jump.title = `Проверим понимание · ${formatMinutes(data.learningTime.assessment)}`;
    jump.append(icon, copy); row.append(jump); $("timeline-chapters").append(row);
    timelineRows.set("final-check", { row, jump, icon, status });
    jump.addEventListener("click", () => openTimelineChapter("final-check"));
    $("timeline-open").addEventListener("click", () => openView("timeline-dialog"));
    $("reset-from").addEventListener("change", describeReset);
    $("rollback-cancel").addEventListener("click", () => openView("settings"));
    $("rollback-confirm").addEventListener("click", async () => {
      const choice = $("reset-from").value; appViews.read({ resume: false });
      if (choice === "all-data") {
        clearAllLessonData();
      } else if (choice === "final-check") {
        state.finalExam = freshExam(data.assessmentRevision); state.assessmentHistory = [];
        save(); await switchView("final-check", { fresh: true, rebuild: true }); discoveries.render();
      } else await performRollback(byQuizGroup.get(choice)?.scenes[0] || chapters[0]);
    });
    updateTimeline();
  }
  function updateTimeline() {
    const intro = timelineRows.get("intro");
    if (intro) {
      const current = state.activeView === "intro";
      intro.row.classList.toggle("done", state.started);
      intro.row.classList.toggle("current", current);
      intro.row.classList.add("reached");
      intro.icon.textContent = state.started ? "✓" : "0";
      intro.status.textContent = current ? "Текущая глава" : state.started ? "Знакомство завершено" : "Можно начать";
      if (current) intro.jump.setAttribute("aria-current", "step"); else intro.jump.removeAttribute("aria-current");
    }
    let doneCount = 0;
    for (const group of chapterGroups) {
      const item = timelineRows.get(group.id); if (!item) continue;
      const done = groupDone(group), reached = groupUnlocked(group), current = state.activeView === group.id;
      if (done) doneCount++;
      item.row.classList.toggle("done", done); item.row.classList.toggle("reached", reached); item.row.classList.toggle("current", current);
      item.jump.setAttribute("aria-disabled", String(!reached && !readAll));
      item.icon.textContent = done ? "✓" : String(group.number);
      item.status.textContent = current ? (done ? "Текущая глава, пройдена" : "Текущая глава") : done ? "Глава пройдена" : reached ? "Можно продолжить" : "Ещё не открыта";
      if (current) item.jump.setAttribute("aria-current", "step"); else item.jump.removeAttribute("aria-current");
    }
    const final = timelineRows.get("final-check");
    if (final) {
      const done = state.finalExam.status === "complete", current = state.activeView === "final-check";
      final.row.classList.toggle("done", done); final.row.classList.toggle("current", current); final.row.classList.toggle("reached", storyFinished());
      final.jump.setAttribute("aria-disabled", String(!finalAvailable())); final.icon.textContent = done ? "✓" : String(chapterGroups.length + 1);
      final.status.textContent = current ? "Текущая глава" : done ? "Разбор сохранён" : finalAvailable() ? "Можно начать" : "После истории";
      if (current) final.jump.setAttribute("aria-current", "step"); else final.jump.removeAttribute("aria-current");
    }
    $("progress-label").textContent = state.started ? `Главы · пройдено ${doneCount + 1} из ${chapterGroups.length + 1}` : "Главы урока";
    lastTimelineChapter = state.activeView;
  }
  function scheduleTimelinePosition() { updateTimeline(); }
  function requestRollback() {
    const select = $("reset-from"); select.replaceChildren();
    const add = (value, text) => { const option = el("option", "", text); option.value = value; select.append(option); };
    add("all", "Начать урок заново");
    for (const group of chapterGroups.slice(1).filter(groupUnlocked)) add(group.id, `С главы ${group.number}: ${group.title}`);
    if (storyFinished()) add("final-check", "Только итоговую проверку");
    add("all-data", "Полный сброс: удалить все данные урока");
    select.value = "all"; describeReset(); openView("rollback-dialog");
  }
  function describeReset() {
    const value = $("reset-from").value;
    $("rollback-description").textContent = value === "all-data"
      ? "Удалятся имя, прохождение, ответы, результаты, реакции, настройки и записанные измерения времени. Урок откроется с начала."
      : value === "final-check"
      ? "Ответы и результат итоговой попытки будут сброшены. Прочитанная история останется на месте."
      : value === "all" ? "Переписка, ответы на практику и итоговый результат начнутся заново. В начале чата можно будет снова ввести имя. Настройки и записанные измерения времени сохранятся."
      : "Эта глава и всё после неё начнутся заново. Их ответы и итоговый результат будут сброшены. Предыдущие главы сохранятся.";
    $("rollback-note").textContent = value === "all-data"
      ? "После удаления страница не сможет определить, какие задания вы открывали раньше."
      : "Рабочий черновик сохраняется, кроме полного удаления данных. Знакомые задания после сброса остаются практикой.";
    $("rollback-confirm").textContent = value === "all-data" ? "Удалить все данные" : "Начать заново";
  }
  function clearAllLessonData() {
    stopTimer();
    clearTimeout(positionSave);
    clearInterval(measurementTimer);
    measurementEnabled = false;
    measurement = null;
    // Pending observers must not restore state while the document is leaving.
    // Also clear data owned by the retired skill-card UI on explicit full reset.
    forgettingLesson = true;
    try {
      for (const owned of [key, measurementKey, key + ":discoveries:v1", key + ":practice:v1", key + ":workbook:v1"]) localStorage.removeItem(owned);
      appViews?.clearPositions();
    } catch {
      forgettingLesson = false;
      $("storage-message").textContent = "Не удалось удалить данные урока. Проверьте доступ браузера к хранилищу и повторите полный сброс.";
      return;
    }
    const start = new URL(location.href);
    start.hash = "";
    location.replace(start.href);
  }
  async function performRollback(c) {
    stopTimer();
    if (measurementEnabled) {
      measureTick(); measurement.data.restarts ||= [];
      measurement.data.restarts.push({ activeMs: measurement.data.activeMs, chapter: groupByScene.get(c.id).id });
      persistMeasurement();
    }
    const index = chapters.indexOf(c),
      affected = new Set(chapters.slice(index).map((chapter) => chapter.id));
    discoveries.reset([...affected]);
    const ids = new Set(discoveryPoints.filter(p => affected.has(p.chapter)).map(p => "discovery--" + p.id));
    for (const [id, entry] of messages)
      if (affected.has(entry.chapter.id)) ids.add(id);
    for (const chapter of chapters.slice(index)) {
      delete state.choices[chapter.id];
      for (const suffix of [
        "heading",
        "sent",
        "reply",
        "supplement",
        "resources",
        "choice",
      ])
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
      delete state.reactions[id];
    }
    state.expanded = state.expanded.filter(
      (id) => !affected.has(threads.get(id)?.chapter.id),
    );
    state.collapsed = state.collapsed.filter(
      (id) => !affected.has(threads.get(id)?.chapter.id),
    );
    state.finalExam = freshExam(data.assessmentRevision);
    state.assessmentHistory = [];
    // Exposed forms stay remembered: resetting the story cannot make them unseen.
    state.started = index !== 0;
    if (index === 0) {
      for (const event of introductionTimeline) seen.delete(event.id);
      state.participantName = "";
      state.participantIntroduction = "";
      state.preparationConfirmed = false;
      participantEditing = false;
      introductionReadyAt = 0;
      updateParticipantIdentity();
      renderParticipantChat();
    }
    state.storyComplete = false;
    for (const group of chapterGroups) if (group.scenes.some((scene) => affected.has(scene.id))) delete state.positions[group.id];
    delete state.positions["final-check"];
    readAll = false;
    save();
    await switchView(index ? groupByScene.get(c.id).id : "intro", { fresh: true, rebuild: true });
    discoveries.render(); updateProgress();
    if (index === 0) $("participant-name").focus({ preventScroll: true });
  }
  function chapterOf(target) {
    return (
      byChapter.get(target) ||
      byChapter.get(target.split("--")[0]) ||
      messages.get(target)?.chapter ||
      threads.get(target)?.chapter
    );
  }
  async function navigate(raw, returnTo = null, { preview = false } = {}) {
    if (appViews && !appViews.isReading()) appViews.read({ resume: false });
    noteAssistance();
    if (raw === "intro") { await switchView("intro"); return; }
    const destination = byQuizGroup.get(raw);
    const previous = raw === "final-check" ? chapterGroups.at(-1) : destination && chapterGroups[chapterGroups.indexOf(destination) - 1];
    // A copied chapter link may be opened before the old tab records the move.
    // Advance only from a chapter whose reading boundary was already reached.
    if (previous && (destination ? !groupUnlocked(destination) : !finalAvailable()) &&
        groupUnlocked(previous) && previous.scenes.every(scene => seen.has(scene.id + "--supplement"))) {
      await continueChapter(previous);
    }
    if (raw === "final-check") { await switchView("final-check"); return; }
    const id = data.aliases[raw] || raw, c = chapterOf(id) || byQuizGroup.get(raw.replace(/^transcript-/, ""))?.scenes[0];
    if (!c) return;
    const group = groupByScene.get(c.id), thread = threads.get(id)?.thread || messages.get(id)?.thread;
    if (!groupUnlocked(group)) return;
    if (thread) {
      state.expanded = [...new Set([...state.expanded, thread.id])];
      state.collapsed = state.collapsed.filter((x) => x !== thread.id);
    }
    if (transitioning) return;
    await switchView(group.id, { target: id, preview: preview && !groupUnlocked(group) });
    // A reference deliberately reveals its scene, without pretending the
    // material was read or advancing the saved route in preview mode.
    const events = currentTimeline();
    const targetIndex = events.findIndex((e) => e.id === id ||
      thread && id === thread.id && e.id === thread.messages[0].id ||
      e.id === c.id + "--heading" && [c.id, group.id].includes(id));
    if (targetIndex >= 0) {
      stopTimer();
      for (const e of events.slice(0, targetIndex + 1)) mount(e, false);
    }
    if (thread) {
      const body = parentNodes.get(thread.id);
      if (body) { setThreadView(body.closest("[data-thread]"), true); fillThread(thread); }
    }
    if (returnTo) {
      const target = document.getElementById(id) || document.getElementById(c.id + "--heading");
      document.querySelector(".return-question")?.remove();
      target?.before(button("← Вернуться к проверке", () => switchView("final-check"), "return-question text-button"));
    }
    restorePosition(group.id, document.getElementById(id) ? id : c.id + "--heading");
    save(); sync();
  }
  function showMaterial(url) {
    noteAssistance();
    const body = $("material-body"); body.replaceChildren();
    if (url.pathname.endsWith("materials.html")) {
      const item = data.materials.find((m) => m.id === decodeURIComponent(url.hash.slice(1)));
      $("material-title").textContent = item?.title || "Материалы учебного примера";
      for (const material of item ? [item] : data.materials) {
        if (!item) body.append(el("h3", "", material.title));
        body.append(paragraph(material.text));
      }
      body.append(el("p", "small muted", "Вымышленный материал учебной истории."));
    } else {
      rememberPosition(); save(); location.assign(url.href); return;
    }
    openView("material-info", { material: decodeURIComponent(url.hash.slice(1)) || 'all' });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]"); if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && (url.pathname.endsWith("materials.html") || url.pathname.endsWith("demos/tokens.html"))) {
      event.preventDefault(); showMaterial(url);
    }
  });
  document.addEventListener("unknowntalks:reveal", (event) => { if (event.detail?.id) navigate(event.detail.id, null, { preview: true }); });
  function openView(id, options = {}) {
    if (["person-info", "about"].includes(id)) noteAssistance();
    appViews?.open(id, options);
  }
  for (const p of data.characters.filter(
    (p) => !["tool", "agent"].includes(p.id),
  )) {
    const item = el("p");
    const name = el("strong", "", p.name);
    if (p.id === "sasha") name.dataset.participantName = "";
    item.append(name, document.createTextNode(". " + p.role));
    $("cast").append(item);
  }
  function renderParticipantChat(preserveQuestion = false) {
    const exchange = $("participant-exchange");
    if (!preserveQuestion) exchange.replaceChildren(bubble({ speaker: "system", introducesSpeaker: true, paragraphs: [participantEditing
      ? "Как к тебе теперь обращаться?" : "Привет! Как к тебе обращаться?"] }, true));
    if (state.participantName && !participantEditing && !exchange.querySelector('[data-speaker="sasha"]')) {
      const answer = bubble({ speaker: "sasha", paragraphs: [] }, true);
      answer.append(el("p", "", `Привет! Меня зовут ${state.participantIntroduction || state.participantName}.`));
      exchange.append(answer);
    }
    $("participant-chat-title").hidden = !!state.participantName && !state.participantIntroduction;
    $("participant-form").hidden = !!state.participantName && !participantEditing;
    $("participant-cancel").hidden = !participantEditing;
    $("participant-name").value = participantEditing ? state.participantName : "";
    $("participant-save").disabled = !cleanParticipantName($("participant-name").value);
    $("participant-error").textContent = "";
    renderPreparationChat();
  }
  function renderPreparationChat() {
    const section = $("preparation-chat");
    section.hidden = !state.participantName || participantEditing;
    if (section.hidden) return;
    const exchange = $("preparation-exchange");
    exchange.replaceChildren(bubble({ speaker: "system", paragraphs: ["Как тебе удобнее читать: простыми словами или с техническими терминами? Выбор можно изменить в настройках урока."] }, true));
    $("preparation-form").hidden = state.preparationConfirmed;
    if (state.preparationConfirmed) {
      exchange.append(bubble({ speaker: "sasha", paragraphs: [preparation === "beginner" ? "Объясняй с начала, простыми словами." : "Мне знакомы модель, LLM и агент. Используй технические термины."] }, true));
    }
  }
  $("preparation-form").addEventListener("submit", event => {
    event.preventDefault();
    const selected = event.currentTarget.elements["preparation-intro"].value;
    state.preparationConfirmed = true;
    setPreparation(selected);
    introductionReadyAt = performance.now() + (state.pace === "instant" ? 0 : 650);
    save(); updateView(); sync();
  });
  function openParticipantName() {
    rememberPosition();
    participantEditing = !!state.participantName;
    stopTimer();
    renderParticipantChat();
    updateView();
    window.scrollTo({ top: 0, behavior: "instant" });
    $("participant-name").focus({ preventScroll: true });
  }
  function cancelParticipantName() {
    if (!participantEditing) return;
    participantEditing = false;
    renderParticipantChat();
    updateView();
    restorePosition(state.activeView);
    sync();
  }
  $("participant-name").addEventListener("input", () => {
    $("participant-save").disabled = !cleanParticipantName($("participant-name").value);
    $("participant-error").textContent = "";
  });
  $("participant-name").addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelParticipantName();
  });
  $("participant-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = cleanParticipantName($("participant-name").value);
    if (!name) {
      $("participant-error").textContent = "Напиши имя, чтобы отправить сообщение.";
      return;
    }
    const firstIntroduction = !state.participantName;
    state.participantName = name;
    if (firstIntroduction) state.participantIntroduction = name;
    const wasEditing = participantEditing;
    participantEditing = false;
    keepReading(() => {
      updateParticipantIdentity();
      renderParticipantChat(firstIntroduction && !wasEditing);
    });
    save();
    if (!state.started && !readAll) {
      // Stay in the introduction until the reader explicitly starts chapter one.
      state.activeView = "intro";
      introductionReadyAt = performance.now() + (state.pace === "instant" ? 0 : 650);
      save();
      updateView();
      sync();
    } else {
      updateView();
      restorePosition(state.activeView);
      sync();
    }
  });
  $("participant-cancel").addEventListener("click", cancelParticipantName);
  const send = button("Начать главу", async () => {
    if (transitioning) return;
    if (!state.participantName || !state.preparationConfirmed) { openParticipantName(); return; }
    state.started = true;
    readAll = false;
    introductionReadyAt = performance.now() + (state.pace === "instant" ? 0 : 650);
    save();
    await switchView(chapterGroups[0].id);
  }, "conversation-action");
  send.id = "start";
  $("opening-composer").append(send);
  $("previous-chapter").addEventListener("click", async event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    const index = chapterGroups.findIndex((g) => g.id === state.activeView);
    const target = state.activeView === "final-check" ? chapterGroups.at(-1).id
      : index === 0 ? "intro" : index > 0 ? chapterGroups[index - 1].id : null;
    if (target && await switchView(target)) history.replaceState(history.state, "", href);
  });
  $("restart-chat").addEventListener("click", () => requestRollback());
  $("skills-open").addEventListener("click", () => { rememberPosition(); save(); noteAssistance(); discoveries.open(); });
  $("settings-open").addEventListener("click", () => openView("settings"));
  $("about-open").addEventListener("click", () => openView("about"));
  $("pace").value = state.pace;
  $("pace").addEventListener("change", () => {
    state.pace = $("pace").value;
    save();
    sync();
  });
  $("read-all").addEventListener("click", () => {
    noteAssistance();
    appViews.read({ resume: false }); readAll = true;
    if (state.activeView === "intro") switchView(chapterGroups[0].id, { preview: true });
    else sync();
  });
  function returnToChat() {
    appViews.read({ resume: false }); readAll = false;
    // Previewed nodes are not progress. Reconstruct the saved route so unseen
    // messages resume normally, even when returning to the same chapter.
    switchView(reachedView(), { rebuild: true }); updateProgress();
  }
  $("back-to-chat").addEventListener("click", returnToChat);
  $("return-inline").addEventListener("click", returnToChat);
  for (const link of document.querySelectorAll('a[href*="glossary"], a[href*="agent."], a[href*="agent-prompt"]'))
    link.addEventListener("click", noteAssistance);
  // These exports disclose the answer banks. Opening them is known exposure,
  // even before an attempt; external help outside this browser is unobservable.
  for (const link of document.querySelectorAll('a[href*="agent.md"], a[href*="agent.html"]'))
    link.addEventListener("click", () => {
      state.exposedForms = data.assessment.forms.map((f) => f.id);
      save();
    });
  let positionSave;
  addEventListener(
    "scroll",
    () => {
      if (!transitioning) { rememberPosition(); clearTimeout(positionSave); positionSave = setTimeout(save, 160); }
    },
    { passive: true },
  );
  document.documentElement.classList.add("reading-chat");
  addEventListener("hashchange", () =>
    navigate(decodeURIComponent(location.hash.slice(1))),
  );
  enhanceSelects();
  setupMeasurement();
  save();
  initializeTimeline();
  renderParticipantChat();
  renderRestored();
  initAgent({motion,lesson:{id:data.storageId||'init-ru',title:data.title},onSource:id=>navigate(id),onContextChange:open=>{
    if(open){rememberPosition();save();}
    agentContextOpen=open;
    if(open){
      stopTimer();
      updatePlayback();
    }else if(appViews?.isReading()){
      sync();
    }
  }});
  appViews = createLessonViews({
    motion,
    storageKey: key,
    rememberReading: () => { rememberPosition(); save(); },
    restoreReading: () => {
      restorePosition(state.activeView);
      const anchor = document.getElementById(state.positions[state.activeView]?.anchor);
      if (anchor) { anchor.tabIndex = -1; anchor.focus({ preventScroll: true }); }
    },
    pauseReading: () => {
      discoveryContinuation = null;
      stopTimer();
    },
    resumeReading: () => {
      sync();
    },
    onChange: (name, params) => {
      if (name === 'skills') discoveries.render();
      if (name === 'skill') discoveries.select(params.get('skill'), { route: false });
      if (name === 'reset') requestRollback();
      if (name === 'person' && people.has(params.get('person'))) showPerson(people.get(params.get('person')));
      if (name === 'materials') showMaterial(new URL('materials.html#' + (params.get('material') === 'all' ? '' : params.get('material') || ''), location.href));
    },
  });
  discoveries.render();
  if (location.hash) navigate(decodeURIComponent(location.hash.slice(1)));
  updateParticipantIdentity();
  applyReadingLevel();
  if (!state.participantName && appViews.isReading()) $("participant-name").focus({ preventScroll: true });
})();
