import test from "node:test";
import { solutionValue, correctResponse } from "./exercise.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { freshExam, nextForm, outcomeResult, knowledgeState, compatibleExam, estimateLesson, LearningClock } from "./learning.mjs";

const story = JSON.parse(await readFile(new URL("../01-foundations/01-from-data-to-agents/story.json", import.meta.url)));
const assessment = story.assessment;
const independent = assessment.forms.filter(f => f.purpose === "independent");
const revision = "test-revision";
const solution = q => q.exercise ? Object.fromEntries(q.exercise.fields.map(f => [f.id, solutionValue(f)])) : q.correct;
function attempt(form, choose, extra = {}) {
  return { ...freshExam(revision, form.id, "independent"), status: "complete",
    answers: Object.fromEntries(form.questions.map((q, i) => [q.id, choose(q, i)])), ...extra };
}
function profile(exam, history = [exam], overrides = {}) {
  const state = { finalExam: exam, assessmentHistory: history, chapterAnswers: {}, ...overrides };
  return story.outcomes.map((o) => knowledgeState(o, state, assessment));
}

test("one complete main route with eight skill boundaries and valid references", () => {
  assert.equal(story.chapterGroups.length, 8);
  assert.deepEqual(story.chapterGroups.flatMap((g) => g.chapters), story.chapters.map((c) => c.id));
  const ids = new Set(), main = new Set();
  const people = new Set(story.characters.map((p) => p.id));
  function visit(e, core) {
    assert(!ids.has(e.id), `duplicate ${e.id}`); ids.add(e.id);
    if (core) main.add(e.id);
    if (e.type === "message") { assert(people.has(e.speaker)); assert(e.paragraphs.length); }
    for (const reaction of e.reactions || []) {
      assert(reaction.emoji && reaction.label && reaction.by.length);
      assert(reaction.by.every((person) => people.has(person)), `unknown reaction author in ${e.id}`);
    }
    for (const a of e.attachments || []) visit(a, core);
  }
  for (const c of story.chapters) {
    for (const e of [...c.intro, ...c.outro]) visit(e, true);
    for (const t of c.threads) for (const e of t.messages) visit(e, false);
  }
  for (const group of story.chapterGroups) {
    const scenes = group.chapters.map((id) => story.chapters.find((c) => c.id === id));
    assert.equal(scenes.filter((c) => c.decision).length, 1);
    assert(scenes.at(-1).decision);
    assert(scenes.at(-1).intro.slice(-2).every((e) => e.type === "message"));
  }
  for (const c of story.chapters) for (const refs of Object.values(c.arc))
    for (const ref of refs) assert(ids.has(ref), `missing arc ${ref}`);
  for (const o of story.outcomes) for (const id of o.evidenceMessages) assert(main.has(id), `optional premise ${id}`);
  for (const q of [...story.chapters.flatMap((c) => c.checks), ...assessment.forms.flatMap((f) => f.questions)]) {
    if (q.exercise) assert(correctResponse(q.exercise, solution(q)));
    else { assert(q.options[q.correct]); assert.equal(new Set(q.options).size, q.options.length); }
    assert(story.outcomes.some((o) => o.id === q.outcome));
    for (const ref of q.references) assert(main.has(ref), `assessment requires optional ${ref}`);
  }
});

test("guided practice and two fresh independent forms have separate exposure pools", () => {
  const ids = [...story.chapters.flatMap((c) => c.checks), ...assessment.forms.flatMap((f) => f.questions)].map((q) => q.id);
  assert.equal(ids.length, new Set(ids).size);
  for (const form of assessment.forms) for (const o of story.outcomes) {
    const relevant = form.questions.filter((q) => q.outcome === o.id);
    assert.deepEqual(relevant.map((q) => q.kind).sort(), ["cause", "transfer"]);
    assert(relevant.some(q => q.kind === "transfer" && q.exercise?.fields.length >= 2));
  }
  assert.equal(nextForm(assessment, []).form.id, "C");
  assert.equal(nextForm(assessment, ["A", "B"]).form.id, "C");
  assert.equal(nextForm(assessment, ["C"]).form.id, "D");
  assert.equal(nextForm(assessment, ["C", "D"]).fresh, false);
  assert.equal(nextForm(assessment, [], "practice").form.id, "A");
  assert.equal(nextForm(assessment, ["A"], "practice").form.id, "A");
});

test("constant answer positions cannot confirm any outcome", () => {
  for (const form of assessment.forms) for (let position = 0; position < 4; position++) {
    const exam = attempt(form, () => position);
    assert(profile(exam).every((p) => p.state !== "checked"), `${form.id}, position ${position}`);
  }
});

test("selecting the shortest or longest alternative cannot confirm any outcome", () => {
  for (const form of assessment.forms) for (const rank of [0, 3]) {
    const exam = attempt(form, (q) => q.exercise ? 0 : q.options.map((text, i) => ({ length: text.length, i })).sort((a, b) => a.length - b.length)[rank].i);
    assert(profile(exam).every((p) => p.state !== "checked"), `${form.id}, length rank ${rank}`);
  }
});

test("correct independent selections confirm only the stated outcome evidence", () => {
  const exam = attempt(independent[0], solution);
  assert(profile(exam).every((p) => p.state === "checked"));
  assert(story.outcomes.every((o) => outcomeResult(o.id, exam, assessment).independent));
  const wrong = structuredClone(exam);
  const question = independent[0].questions.find((q) => q.outcome === "R4");
  wrong.answers[question.id] = (question.correct + 1) % 4;
  assert.equal(profile(wrong).filter((p) => p.state === "checked").length, 7);
  assert.equal(profile(wrong)[3].state, "encountered");
});

test("incomplete, assisted, repeated and old results cannot create green", () => {
  const correct = attempt(independent[0], solution);
  for (const extra of [{ status: "active" }, { assisted: true }, { mode: "practice" }]) {
    const exam = { ...correct, ...extra };
    assert(profile(exam).every((p) => p.state !== "checked"));
  }
  assert(profile({ ...correct, revision: "new" }, [correct]).every((p) => p.state !== "checked"));
  const partial = structuredClone(correct); delete partial.answers[independent[0].questions.at(-1).id];
  assert(profile(partial).every((p) => p.state !== "checked"));
  const idle = freshExam(revision);
  const p = profile(idle, [], { chapterAnswers: { "practice-r1": 1 } });
  assert.equal(p[0].state, "encountered"); assert.equal(p[1].state, "ahead");
});

test("a new error removes earlier confirmation; memorised practice cannot restore it", () => {
  const first = attempt(independent[0], solution);
  const second = attempt(independent[1], (q) => q.exercise ? solution(q) : (q.correct + 1) % 4);
  const repeated = attempt(independent[1], solution, { mode: "practice" });
  assert(profile(second, [first, second]).every((p) => p.state !== "checked"));
  assert(profile(repeated, [first, second, repeated]).every((p) => p.state !== "checked"));
});

test("immediate explanations cannot create independent evidence even with a legacy mode flag", () => {
  const guided = attempt(independent[0], solution, { feedbackMode: "immediate" });
  assert(story.outcomes.every((o) => outcomeResult(o.id, guided, assessment).correct));
  assert(profile(guided).every((p) => p.state !== "checked"));
  const previous = attempt(independent[1], solution);
  assert(profile(guided, [previous, guided]).every((p) => p.state === "checked"));
});

test("time ranges account for more than words and keep optional depth separate", () => {
  const time = estimateLesson(story);
  assert(time.preliminary);
  assert(time.firstValue[1] < time.main[0]);
  assert(Object.values(time.forms).every((f) => f.assessmentWords > 0 && f.feedbackWords > 0));
  assert.deepEqual(time.withAssessment, time.main.map((n, i) => n + time.assessment[i]));
  time.expanded.forEach((n, i) => assert(Math.abs(n - time.main[i] - time.assessment[i] - time.practice[i] - time.guidedPractice[i] - time.optional[i]) < 1e-9));
  assert(time.groups.some((g) => g.visualCount > 0 && g.visuals[0] > 0));
  for (const range of [time.main, time.assessment, time.withAssessment, time.expanded, ...Object.values(time.outcomes)])
    assert(range[0] > 0 && range[1] > range[0]);
  assert(time.expanded[0] > time.withAssessment[0]);
  const withoutBranches = structuredClone(story); withoutBranches.chapters.forEach((c) => c.threads = []);
  const without = estimateLesson(withoutBranches);
  assert.deepEqual(without.groups.map((g) => g.coreWords), time.groups.map((g) => g.coreWords));
  assert.deepEqual(without.main, time.main); // This common route has no optional branches.
});

test("changed lesson banks do not reuse old evidence", () => {
  const exam = attempt(independent[1], solution);
  assert(compatibleExam(exam, assessment, revision));
  assert(!compatibleExam({ ...exam, revision: "old-lesson" }, assessment, revision));
});

test("time budget includes diagram reading and separates explanation from evidence opportunity", () => {
  const baseline = estimateLesson(story);
  const longer = structuredClone(story);
  const visual = longer.chapters.flatMap((c) => c.intro).find((e) => e.type === "visual");
  visual.caption += " Дополнительное пояснение".repeat(100);
  const changed = estimateLesson(longer);
  assert(changed.main[0] > baseline.main[0]);
  assert(changed.main[1] > baseline.main[1]);
  assert.deepEqual(changed.optional, baseline.optional);
  assert.deepEqual(changed.assessment, baseline.assessment);
  assert.equal(baseline.observedTimeToOutcome, null);
  for (const o of story.outcomes) {
    const explanation = baseline.explanationAvailable[o.id];
    assert(story.chapterGroups.some((g) => g.id === explanation.chapter));
    assert(explanation.range[0] < baseline.outcomes[o.id][0]);
    assert(explanation.range[1] < baseline.outcomes[o.id][1]);
  }
  assert(baseline.scenarios.main.minimum < baseline.scenarios.main.central);
  assert(baseline.scenarios.main.central < baseline.scenarios.main.maximum);
});

test("the opt-in clock separates active, idle, hidden, response and overlapping waiting", () => {
  const clock = new LearningClock(0);
  clock.tick(10000, { waiting: true, section: "model", optional: true });
  clock.interact(10000);
  clock.tick(30000, { mode: "response" });
  clock.tick(90000, { mode: "review" });
  clock.tick(110000, { visible: false });
  assert.equal(clock.data.activeMs, 70000);
  assert.equal(clock.data.idleMs, 20000);
  assert.equal(clock.data.hiddenMs, 20000);
  assert.equal(clock.data.interfaceMs, 10000);
  assert.equal(clock.data.sections.model, 10000);
  assert.equal(clock.data.readingRoutes.optional, 10000);
  assert.equal(clock.data.modes.response, 20000);
  assert.equal(Object.values(clock.data.modes).reduce((a, b) => a + b, 0), clock.data.activeMs);
  clock.mark("example"); clock.interact(110000); clock.tick(120000); clock.mark("example");
  assert.equal(clock.data.milestones.example.activeMs, 70000);
});

test("each skill has reading material and a main-route source", () => {
  assert.equal(story.skills.length, 8);
  const ids = new Set(story.chapters.flatMap(c => [...c.intro, ...c.outro].map(e => e.id)));
  for (const skill of story.skills) {
    assert(ids.has(skill.after));
    assert(skill.steps.length >= 3);
    assert(skill.detail);
    assert(skill.examples.length);
  }
});

test("independent work cannot be passed with the explanation alone or one missing field", () => {
  const form = assessment.forms.find(f => f.purpose === 'independent');
  const exam = attempt(form, solution);
  assert(profile(exam).every(p => p.state === 'checked'));
  const task = form.questions.find(q => q.exercise);
  delete exam.answers[task.id][task.exercise.fields[0].id];
  assert(profile(exam).every(p => p.state !== 'checked'));
});

test("a practice bank never becomes independent through its mode flag", () => {
  const form = assessment.forms.find(f => f.purpose === 'practice');
  const exam = attempt(form, solution);
  assert(profile(exam).every(p => p.state !== 'checked'));
  assert(story.outcomes.every(o => outcomeResult(o.id, exam, assessment).correct));
});

test("the three banks use distinct explanations and task scenarios", () => {
  const qs = assessment.forms.flatMap(f => f.questions);
  const causes = qs.filter(q => q.kind === 'cause').map(q => q.question);
  assert.equal(new Set(causes).size, causes.length);
  const cases = qs.filter(q => q.exercise).map(q => q.exercise.prompt);
  assert.equal(new Set(cases).size, cases.length);
});

test("authored conversation dates and clocks never run backwards in the main route", () => {
  const minutes = (time) => { assert.match(time, /^\d{2}:\d{2}$/); const [h, m] = time.split(":").map(Number); assert(h < 24 && m < 60); return h * 60 + m; };
  let previous = -1;
  for (const c of story.chapters) {
    const times = [...c.intro.filter((e) => e.time).map((e) => e.time), ...(c.decision ? [c.sentTime, c.replyTime] : []), ...c.outro.filter((e) => e.time).map((e) => e.time)];
    for (const time of times) { const stamp = c.day * 1440 + minutes(time); assert(stamp >= previous, `${c.id}: ${time} precedes its context`); previous = stamp; }
    for (const thread of c.threads) {
      let last = -1;
      for (const e of thread.messages.filter((e) => e.time)) { const stamp = minutes(e.time); assert(stamp >= last, `${thread.id} clock moves backwards`); last = stamp; }
    }
  }
});
