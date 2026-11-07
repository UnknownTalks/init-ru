import { uiElement as node } from './ui/dom.js';
import { enhanceSelects } from './select.js';
// Structured work is checked against explicit task conditions. Free prose in
// the personal workbook is saved, never automatically certified.
const normalize = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim().replace(/\s+/g, ' ').replace(/[.!]$/, '');
export function validResponse(task, response) {
  return !!response && typeof response === 'object' && task.fields.every(f => {
    const value = response[f.id];
    if (f.kind === 'multi') return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every(v => f.options.some(o => o.value === v));
    if (f.kind === 'text') return typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
    return f.options.some(o => o.value === value);
  });
}
export function fieldCorrect(field, value) {
  if (field.kind === 'multi') return Array.isArray(value) && value.length === field.answer.length && field.answer.every(v => value.includes(v));
  if (field.kind === 'text') return field.answer.some(answer => normalize(answer) === normalize(value));
  return value === field.answer;
}
export function correctResponse(task, response) {
  return validResponse(task, response) && task.fields.every(f => fieldCorrect(f, response[f.id]));
}
export const validAnswer = (q, a) => q.exercise ? validResponse(q.exercise, a) : Number.isInteger(a) && q.options[a] !== undefined;
export const correctAnswer = (q, a) => q.exercise ? correctResponse(q.exercise, a) : a === q.correct;
export function solutionValue(f) { return f.kind === 'text' ? f.answer[0] : f.answer; }
function valueText(f, value) {
  if (f.kind === 'text') return String(value ?? '');
  const values = Array.isArray(value) ? value : [value];
  return values.map(v => f.options.find(o => o.value === v)?.label || '').join('; ');
}
export function answerText(q, a) {
  return q.exercise ? q.exercise.fields.map(f => `${f.label} ${valueText(f, a?.[f.id])}`).join('\n') : q.options[a];
}
export function solutionText(task) {
  return task.fields.map(f => `${f.label} ${valueText(f, solutionValue(f))}. ${f.feedback}`).join('\n');
}
let sequence = 0;
export function exerciseForm(task, { response = {}, onChange = () => {}, onSubmit, label = 'Отправить' }) {
  const form = node('form', 'skill-exercise');
  const prefix = 'exercise-' + (++sequence);
  form.setAttribute('aria-label', 'Практическая работа');
  form.append(node('p', 'exercise-prompt', task.prompt));
  const values = structuredClone(response || {});
  const send = node('button', 'reply-send', label); send.type = 'submit';
  const update = () => { send.disabled = !validResponse(task, values); onChange(structuredClone(values)); };
  task.fields.forEach(f => {
    const group = node('fieldset', 'exercise-field');
    group.append(node('legend', '', f.label));
    if (f.kind === 'multi') {
      group.append(node('p', 'small muted', 'Можно выбрать несколько вариантов.'));
      for (const o of f.options) {
        const label = node('label', 'exercise-check');
        const input = node('input'); input.type = 'checkbox'; input.name = f.id; input.value = o.value;
        input.checked = Array.isArray(values[f.id]) && values[f.id].includes(o.value);
        input.addEventListener('change', () => {
          values[f.id] = [...group.querySelectorAll('input[name]:checked')].map(n => n.value); update();
        });
        label.append(input, node('span', '', o.label)); group.append(label);
      }
    } else {
      const input = node(f.kind === 'text' ? 'input' : 'select', 'exercise-input');
      input.id = prefix + '-' + f.id; input.name = f.id; input.setAttribute('aria-label', f.label);
      if (f.kind === 'text') {
        input.type = 'text'; input.maxLength = 240; input.autocomplete = 'off';
        if (f.answer.every(a => /^\d+$/.test(a))) { input.inputMode = 'numeric'; input.placeholder = 'Числом, без единиц'; }
      }
      else {
        const empty = node('option', '', 'Выберите…'); empty.value = ''; input.append(empty);
        for (const o of f.options) { const option = node('option', '', o.label); option.value = o.value; input.append(option); }
      }
      input.value = typeof values[f.id] === 'string' ? values[f.id] : '';
      input.addEventListener('input', () => { values[f.id] = input.value; update(); });
      input.addEventListener('change', () => { values[f.id] = input.value; update(); });
      group.append(input);
    }
    form.append(group);
  });
  send.disabled = !validResponse(task, values);
  const actions = node('div', 'reply-actions'); actions.append(send); form.append(actions);
  form.addEventListener('submit', e => {
    e.preventDefault(); if (!validResponse(task, values)) return;
    onSubmit(structuredClone(values), form);
  });
  enhanceSelects(form);
  return form;
}

export function workbookView(workbook, { saved = {}, onSave }) {
  const section = node('section', 'personal-workbook');
  section.append(node('h3', '', workbook.title), node('p', '', workbook.intro));
  const values = { ...saved }; const status = node('p', 'small muted', 'Черновик хранится только в этом браузере. Его можно скачать.'); status.setAttribute('aria-live', 'polite');
  for (const field of workbook.fields) {
    const label = node('label', 'workbook-field');
    label.append(node('strong', '', field.label), node('span', 'small muted', field.hint));
    const input = node('textarea'); input.rows = 3; input.maxLength = 8000; input.value = values[field.id] || '';
    input.addEventListener('input', () => { values[field.id] = input.value; status.textContent = onSave({ ...values }) === false ? 'Не удалось сохранить. Скачайте черновик, пока страница открыта.' : 'Черновик сохранён в этом браузере. Это ваша работа, без автоматической оценки.'; });
    label.append(input); section.append(label);
  }
  const download = node('button', 'conversation-action', 'Скачать моё задание'); download.type = 'button';
  download.addEventListener('click', () => {
    const text = '# Задание для цифрового сотрудника\n\n' + workbook.fields.map(f => `## ${f.label}\n\n${values[f.id] || '(пока не заполнено)'}`).join('\n\n');
    const href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = node('a'); a.href = href; a.download = 'my-agent-work.md'; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  section.append(status, download); return section;
}
