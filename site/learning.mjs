import { validAnswer, correctAnswer } from './exercise.mjs';
// Shared by the browser, the build and the checks. No network or storage here.
export const TIMING_MODEL_VERSION = "1.4";

export function freshExam(revision, formId = null, mode = "practice") {
  return { revision, formId, mode, status: "idle", answers: {}, confidence: {}, assisted: false };
}

export function nextForm(assessment, exposed = [], purpose = "independent") {
  const forms = assessment.forms.filter((form) => form.purpose === purpose);
  const unused = forms.find((form) => !exposed.includes(form.id));
  return { form: unused || forms[0], fresh: !!unused };
}

// A/B questions are unchanged from the preceding release. Preserve their valid
// deferred results, but never promote an immediate-feedback practice attempt.
export function compatibleExam(exam, assessment, revision) {
  return exam && (exam.revision === revision ||
    (exam.revision === assessment.legacyRevision && ["A", "B"].includes(exam.formId)) ||
    (assessment.compatibleRevisions || []).some((entry) =>
      entry.revision === exam.revision && entry.forms.includes(exam.formId)));
}

export function formQuestions(assessment, formId) {
  return assessment.forms.find((form) => form.id === formId)?.questions || [];
}

export function isComplete(exam, questions) {
  return questions.length > 0 && questions.every((q) =>
    validAnswer(q, exam.answers[q.id]));
}

export function outcomeResult(outcome, exam, assessment) {
  const questions = formQuestions(assessment, exam.formId);
  const relevant = questions.filter((q) => q.outcome === outcome);
  const covered = ["cause", "transfer"].every((kind) => relevant.some((q) => q.kind === kind));
  const complete = exam.status === "complete" && isComplete(exam, questions);
  const correct = complete && covered && relevant.every((q) => correctAnswer(q, exam.answers[q.id]));
  const independentForm = assessment.forms.find(f => f.id === exam.formId)?.purpose === 'independent';
  return { correct, independent: correct && independentForm && exam.mode === "independent" && !exam.assisted && exam.feedbackMode !== "immediate",
    complete, covered, relevant };
}

export function knowledgeState(outcome, state, assessment, encountered = []) {
  const history = (state.assessmentHistory || []).filter((x) => x.revision === state.finalExam.revision);
  // A later error is a reason to revisit a previous success. Memorising the same
  // form afterwards must not repair that evidence; another unused form can.
  let evidence = null;
  let needsReview = false;
  for (const exam of history) {
    const result = outcomeResult(outcome.id, exam, assessment);
    if (!result.complete) continue;
    if (!result.correct) { needsReview = true; evidence = null; }
    else if (result.independent) { evidence = exam; needsReview = false; }
  }
  const practised = Object.keys(state.chapterAnswers || {}).some((id) => id === `practice-${outcome.id.toLowerCase()}`);
  const met = outcome.evidenceMessages.some((id) => encountered.includes(id));
  const attempted = history.length > 0 || formQuestions(assessment, state.finalExam.formId)
    .some((q) => q.outcome === outcome.id && validAnswer(q, state.finalExam.answers[q.id]));
  if (evidence) return { state: "checked", label: "Подтверждено в заданиях", evidence };
  if (needsReview) return { state: "encountered", label: "Нужен повторный разбор" };
  if (practised || attempted) return { state: "encountered", label: "Была практика · без подтверждения" };
  if (met) return { state: "encountered", label: "Встречалось · без подтверждения" };
  return { state: "ahead", label: "Ещё не встречалось здесь" };
}

const words = (text) => (String(text || "").match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu) || []).length;
function eventSize(event) {
  const result = { words: 0, visuals: 0, messages: 0, delaySeconds: 0 };
  if (event.type === "message") {
    const text = (event.paragraphs || []).join(" ");
    result.words = words(text);
    result.messages = 1;
    result.delaySeconds = Math.min(1.6, .65 + text.length * .0014);
  } else if (event.type === "narration") result.words = words(event.text);
  else if (event.type === "visual") {
    result.visuals = 1;
    // Reading the labels is distinct from inspecting their relationships.
    // Count only participant-facing fields, never IDs, types or source metadata.
    result.words = words([event.title, event.caption, ...(event.columns || []),
      ...(event.items || []).flatMap((item) => typeof item === "string" ? [item] :
        [item.label, item.text, item.result])].filter(Boolean).join(" "));
  }
  for (const attachment of event.attachments || []) addSize(result, eventSize(attachment));
  return result;
}
function addSize(a, b) {
  for (const key of ["words", "visuals", "messages", "delaySeconds"]) a[key] += b[key];
  return a;
}
function sizes(events) {
  return events.reduce((acc, event) => addSize(acc, eventSize(event)),
    { words: 0, visuals: 0, messages: 0, delaySeconds: 0 });
}
function estimate(size, { transitions = 0, reflection = 0 } = {}) {
  // Assumptions, not population measurements: technical reading, inspecting
  // diagrams, thinking, choosing a continuation, and bounded animation waiting.
  const reading = [size.words / 210, size.words / 140];
  const visuals = [size.visuals * .35, size.visuals * .85];
  const thinking = [reflection * .3, reflection * .75];
  const choosing = [transitions * .15, transitions * .35];
  const waiting = [0, size.delaySeconds / 60]; // overlaps reading; upper bound only
  const range = [0, 1].map((i) => reading[i] + visuals[i] + thinking[i] + choosing[i] + waiting[i]);
  return { ...size, visualCount: size.visuals, range, reading, visuals, thinking, choosing, waiting };
}
export function formatMinutes(range) {
  const minutes = Math.max(1, Math.round((range[0] + range[1]) / 2));
  return `~${minutes} мин`;
}
export function estimateLesson(story) {
  const byChapter = new Map(story.chapters.map((c) => [c.id, c]));
  const groups = story.chapterGroups.map((group) => {
    const scenes = group.chapters.map((id) => byChapter.get(id));
    const size = sizes(scenes.flatMap((c) => [...c.intro, ...c.outro]));
    for (const c of scenes.filter((c) => c.decision)) {
      const option = c.decision.options[0];
      addSize(size, sizes([{ type: "message", paragraphs: [option.label, option.reply] }]));
    }
    const coreWords = size.words;
    // Collapsed threads still display their opening message. Count that once,
    // here; the optional estimate below covers the remaining thread only.
    const previews = sizes(scenes.flatMap((c) => c.threads.map((t) => t.messages[0])));
    previews.delaySeconds = 0;
    const checkPreview = scenes.flatMap((c) => c.checks)[0];
    if (checkPreview) previews.words += words(checkPreview.question);
    addSize(size, previews);
    const estimated = estimate(size, { transitions: scenes.filter((c) => c.decision).length, reflection: 1 });
    return { id: group.id, coreWords, previewWords: previews.words, ...estimated };
  });
  const opening = estimate(sizes([{ type: "narration", text: story.premise.setup.join(" ") }]));
  const main = [0, 1].map((i) => groups.reduce((sum, g) => sum + g.range[i], opening.range[i]));
  const threads = Object.fromEntries(story.chapters.flatMap((c) => c.threads.map((t) =>
    [t.id, estimate(sizes(t.messages.slice(1)), { reflection: .5 })])));
  const optional = [0, 1].map((i) => Object.values(threads).reduce((sum, t) => sum + t.range[i], 0));
  const practiceCount = story.chapters.reduce((sum, c) => sum + c.checks.length, 0);
  const practice = [practiceCount * .7, practiceCount * 1.5];
  function estimateForm(form) {
    const assessmentWords = form.questions.reduce((sum, q) => sum + words(q.question) + (q.options || []).reduce((n, option) => n + words(option), 0) + (q.exercise ? words(q.exercise.prompt) + q.exercise.fields.reduce((n, f) => n + words(f.label) + (f.options || []).reduce((m, o) => m + words(o.label), 0), 0) : 0), 0);
    const feedbackWords = form.questions.reduce((sum, q) => sum + words(q.explanation), 0);
    const tasks = form.questions.filter(q => q.exercise).length;
    const response = [assessmentWords / 210 + form.questions.length * .25 + tasks * .5, assessmentWords / 140 + form.questions.length * .65 + tasks * 1.5];
    const range = [response[0] + feedbackWords / 210 + 1, response[1] + feedbackWords / 140 + 3];
    return { range, assessmentWords, feedbackWords, response };
  }
  // Budget for either available form, rather than silently timing only A.
  const forms = Object.fromEntries(story.assessment.forms.map((f) => [f.id, estimateForm(f)]));
  const rangeFor = (purpose) => {
    const values = story.assessment.forms.filter((f) => f.purpose === purpose).map((f) => forms[f.id].range);
    return [Math.min(...values.map((v) => v[0])), Math.max(...values.map((v) => v[1]))];
  };
  const assessment = rangeFor("independent"), guidedPractice = rangeFor("practice");
  const firstEvents = story.chapters[0].intro.slice(0,
    story.chapters[0].intro.findIndex((e) => e.id === "human-search-distinction") + 1);
  const first = estimate(sizes(firstEvents), { reflection: .4 });
  const firstValue = [0, 1].map((i) => opening.range[i] + first.range[i]);
  // Evidence is evaluated only after the complete form; no modelled time to
  // success or retention can be inferred from the position of a question.
  const outcomes = Object.fromEntries(story.outcomes.map((o) => [o.id, main.map((n, i) => n + assessment[i])]));
  // Conservative chapter-end milestones, not inferred mastery timestamps.
  const explanationAvailable = Object.fromEntries(story.outcomes.map((o) => {
    const lastGroup = Math.max(...o.chapters.map((id) => story.chapterGroups.findIndex((g) => g.chapters.includes(id))));
    return [o.id, { chapter: groups[lastGroup].id,
      range: [0, 1].map((i) => opening.range[i] + groups.slice(0, lastGroup + 1).reduce((sum, g) => sum + g.range[i], 0)) }];
  }));
  // Sum the displayed component minutes so the visible total reconciles. The
  // underlying uncertainty ranges remain additive and are retained below.
  const rounded = (range) => Math.max(1, Math.round((range[0] + range[1]) / 2));
  const withAssessment = main.map((n, i) => n + assessment[i]);
  const expanded = main.map((n, i) => n + optional[i] + practice[i] + guidedPractice[i] + assessment[i]);
  const scenario = (range) => ({ minimum: range[0], central: (range[0] + range[1]) / 2, maximum: range[1] });
  return { version: TIMING_MODEL_VERSION, preliminary: true, groups, threads, opening, main, optional,
    practice, guidedPractice, assessment, forms, firstValue, outcomes,
    explanationAvailable, observedTimeToOutcome: null,
    scenarios: Object.fromEntries(Object.entries({ main, optional, practice, guidedPractice, assessment,
      firstValue, withAssessment, expanded }).map(([id, range]) => [id, scenario(range)])),
    requiredMinutes: rounded(main) + rounded(assessment),
    withAssessment, expanded,
    assumptions: { readingWordsPerMinute: [140, 210], idleThresholdSeconds: 60,
      central: "Середина двух расчётных сценариев для округлённого ориентира; данных в пользу одного из них пока нет. Это экспертное допущение, не среднее наблюдений.",
      components: "140–210 слов/мин: сценарии более медленного технического и более знакомого чтения. На схему сверх чтения: 0,35–0,85 мин для сопоставления; на главу: 0,3–0,75 мин для размышления; переход: 0,15–0,35 мин. На ответ сверх чтения: 0,25–0,65 мин; на итоговое вступление, обзор результата и переходы: 1–3 мин. Практика главы: 0,7–1,5 мин на задание; возвраты к объяснению не ограничены. Это проектные резервы для указанных действий, не измеренные нормы.",
      note: "Расчёт времени до заданий и их разбора, не срок подтверждения понимания. Это не измерение прохождения. Ожидание может совпадать с чтением. Возвраты и внешние источники не ограничены диапазоном." } };
}

// Opt-in, local-only measurement. 'reading' is time with text visible, not a
// claim about eye movement, comprehension or uninterrupted attention.
export class LearningClock {
  constructor(now = 0, previous = null) {
    this.data = previous?.version === 1 ? previous : {
      version: 1, activeMs: 0, idleMs: 0, hiddenMs: 0, interfaceMs: 0,
      modes: { reading: 0, response: 0, review: 0, navigation: 0 }, milestones: {}, answers: [] };
    this.last = now;
    this.activity = now;
  }
  interact(now) { this.activity = now; }
  tick(now, { visible = true, focused = true, mode = "reading", waiting = false, section = null, optional = false } = {}) {
    const delta = Math.max(0, now - this.last);
    const start = this.last;
    this.last = now;
    if (!visible || !focused) { this.data.hiddenMs += delta; return; }
    const active = Math.max(0, Math.min(now, this.activity + 60000) - start);
    this.data.idleMs += delta - active;
    this.data.activeMs += active;
    this.data.modes[mode] = (this.data.modes[mode] || 0) + active;
    if (section && mode !== "navigation") {
      this.data.sections ||= {};
      this.data.sections[section] = (this.data.sections[section] || 0) + active;
    }
    if (mode === "reading") {
      this.data.readingRoutes ||= { main: 0, optional: 0 };
      this.data.readingRoutes[optional ? "optional" : "main"] += active;
    }
    if (waiting) this.data.interfaceMs += active; // subset; never add twice
  }
  mark(name, metadata = {}) {
    if (!this.data.milestones[name]) this.data.milestones[name] = { activeMs: this.data.activeMs, ...metadata };
  }
  answer(item) {
    this.data.answers.push({ activeMs: this.data.activeMs, ...item });
    this.data.answers = this.data.answers.slice(-200);
  }
}
