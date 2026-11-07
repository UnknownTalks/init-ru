import { createKnowledgeCard, createWorkedExample } from './knowledge-card.js';
import { uiElement as node } from './ui/dom.js';
const action = (label, run, className = '') => {
  const b = node('button', className, label);
  b.type = 'button'; b.addEventListener('click', run); return b;
};

export function createDiscoverySystem({ data, storageKey, onClaim, onFragment, openView }) {
  const concepts = data.discoveries || [], byId = new Map(concepts.map(c => [c.id, c]));
  const events = data.discoveryEvents || concepts;
  const byEvent = new Map(events.map(c => [c.id, c]));
  const dialog = document.getElementById('skills-journal');
  const sheet = document.getElementById('term-detail');
  const journal = document.getElementById('journal-entries');
  const key = storageKey + ':discoveries:v1';
  let history = [], selected = null, localOnly = false;
  const cards = new Map();
  const expandedKey = storageKey + ':expanded-skills:v1';
  let expanded = new Set();
  try { expanded = new Set(JSON.parse(sessionStorage.getItem(expandedKey) || '[]')); } catch {}
  const rememberExpanded = () => { try { sessionStorage.setItem(expandedKey, JSON.stringify([...expanded])); } catch {} };
  const hasClaim = id => history.some(c => c.id === id);
  const claimed = hasClaim;
  const records = c => (c.updates || [c]).filter(u => claimed(u.id));
  const latest = () => byEvent.get(history.at(-1)?.id)?.conceptId || history.at(-1)?.id;
  const related = id => data.relationships.filter(([a, b]) => (a === id || b === id) && claimed(a) && claimed(b));
  function readHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(saved) ? saved.filter(c => byEvent.has(c.id) && Number.isFinite(c.at)) : [];
    } catch { return null; }
  }
  function mergeHistory() {
    if (localOnly) return;
    const saved = readHistory();
    if (saved !== null) history = saved;
  }
  function persistHistory() {
    try { localStorage.setItem(key, JSON.stringify(history)); }
    catch {
      localOnly = true;
      document.getElementById('storage-message').textContent = 'Браузер запретил локальное сохранение. Шаги навыков останутся доступны до закрытия страницы.';
    }
  }
  mergeHistory();
  function claim(c) {
    mergeHistory();
    if (hasClaim(c.id)) return;
    const keyboard = cards.get(c.id)?.take.matches(':focus-visible');
    history.push({ id: c.id, at: Date.now() });
    persistHistory();
    for (const id of cards.keys()) updateCard(id);
    document.getElementById('discovery-status').textContent = `Открытие сохранено. Навык «${c.name}» обновлён.`;
    if (!dialog.hidden) render();
    onClaim(c, { keyboard });
  }
  function card(c) {
    const { element: article, button: take, badge } = createKnowledgeCard(c, {
      className: 'discovery-card',
      onAction: () => { if (!claimed(c.id)) claim(c); },
    });
    const saved = node('span', 'knowledge-card-saved', '✓ Навык добавлен');
    saved.hidden = true; take.after(saved);
    cards.set(c.id, { article, take, badge, saved }); updateCard(c.id);
    return article;
  }
  function updateCard(id) {
    const card = cards.get(id); if (!card) return;
    const done = claimed(id);
    card.article.classList.toggle('is-claimed', done);
    card.take.hidden = done; card.saved.hidden = !done;
    card.take.setAttribute('aria-label', 'Добавить навык и продолжить: ' + byEvent.get(id).name);
    card.badge.textContent = done ? 'Открытие сохранено' : 'Новое открытие';
  }
  // Only migrate a browser that has no discovery history at all. Once an empty
  // journal exists, reloading at an unclaimed card must keep that pause intact.
  function restoreProgress(seen) {
    try {
      if (localStorage.getItem(key) !== null) return;
      history = events.filter(c => seen.has(c.after)).map(c => ({ id: c.id, at: Date.now() }));
      persistHistory();
    } catch { /* The lesson remains usable without browser storage. */ }
  }
  function open(id) {
    mergeHistory();
    if (id && claimed(id)) { select(id); return; }
    selected = null;
    openView('skills-journal'); render();
  }
  function render() {
    const count = concepts.filter(c => claimed(c.id)).length;
    document.getElementById('journal-progress').textContent = `Навыки в журнале: ${count} из ${concepts.length} · ${history.length} ${plural(history.length, ['шаг', 'шага', 'шагов'])}`;
    const meter = document.getElementById('journal-progress-bar'); meter.max = events.length; meter.value = history.length;
    journal.replaceChildren();
    if (!count) {
      const empty = node('li', 'journal-empty');
      empty.append(node('h3', '', 'Первый навык впереди'), node('p', '', 'Сохраняйте открытия по ходу переписки. Здесь сохранятся действия, примеры и следующие шаги.'));
      journal.append(empty);
    }
    let unknown = 0;
    for (const c of concepts) {
      if (!claimed(c.id)) { unknown++; if (unknown <= 2) appendUnknown(); continue; }
      const saved = records(c), total = (c.updates || [c]).length;
      const row = node('li', 'journal-entry journal-skill'); row.dataset.concept = c.id;
      row.dataset.latest = String(c.id === latest());
      const disclosure = node('details', 'skill-disclosure');
      disclosure.open = expanded.has(c.id);
      const summary = node('summary', 'skill-summary');
      const number = node('span', 'skill-number', String(concepts.indexOf(c) + 1).padStart(2, '0'));
      number.setAttribute('aria-hidden', 'true');
      const copy = node('span', 'skill-summary-copy');
      copy.append(node('span', 'skill-name', c.name), node('span', 'skill-progress', `Шаги: ${saved.length} из ${total}${c.id === latest() ? ' · Последнее обновление' : ''}`));
      const chevron = node('span', 'skill-chevron', '+'); chevron.setAttribute('aria-hidden', 'true');
      summary.append(number, copy, chevron);
      const body = node('div', 'skill-inline-detail');
      body.id = 'skill-content-' + c.id;
      summary.setAttribute('aria-controls', body.id);
      let filled = false;
      const fill = () => { if (!filled) { body.append(node('p', 'skill-ability', c.short)); fillDetail(body, c); filled = true; } };
      if (disclosure.open) fill();
      disclosure.addEventListener('toggle', () => {
        if (disclosure.open) { fill(); expanded.add(c.id); } else expanded.delete(c.id);
        rememberExpanded();
      });
      disclosure.append(summary, body); row.append(disclosure);
      journal.append(row);
    }
    if (unknown > 2) {
      const rest = node('li', 'journal-upcoming', `Ещё ${unknown - 2} ${plural(unknown - 2, ['навык', 'навыка', 'навыков'])} ${unknown - 2 === 1 ? 'появится' : 'появятся'} по ходу истории.`);
      journal.append(rest);
    }
  }
  function appendUnknown() {
    const row = node('li', 'journal-entry journal-skill skill-upcoming');
    row.append(node('span', 'skill-number', '·'), node('p', '', 'Следующий навык появится по ходу истории'));
    journal.append(row);
  }
  function plural(n, words) { return n % 100 >= 11 && n % 100 <= 14 ? words[2] : n % 10 === 1 ? words[0] : n % 10 >= 2 && n % 10 <= 4 ? words[1] : words[2]; }
  function select(id, { route = true } = {}) {
    if (!claimed(id)) return;
    selected = id; const c = byId.get(id);
    if (route && c) {
      expanded.add(id); rememberExpanded();
      openView('skills-journal'); render();
      const summary = journal.querySelector(`[data-concept="${id}"] summary`);
      summary?.scrollIntoView({ block: 'start', behavior: 'instant' });
      summary?.focus({ preventScroll: true });
      return;
    }
    if (!c) return;
    document.getElementById('term-detail-title').textContent = c.name;
    document.getElementById('term-detail-progress').textContent = `Шаги урока: ${records(c).length} из ${(c.updates || [c]).length}`;
    const body = document.getElementById('term-detail-body'); body.replaceChildren(); fillDetail(body, c);
  }
  function sourcesFor(chapterIds) {
    const unique = new Map();
    for (const chapter of data.chapters.filter(c => chapterIds.includes(c.id)))
      for (const source of [...chapter.sources, ...chapter.threads.flatMap(t => t.sources || [])])
        unique.set(source.url, source);
    return [...unique.values()];
  }
  function sourceList(sources) {
    const list = node('ul', 'skill-sources');
    for (const source of sources) {
      const item = node('li'), link = node('a', '', source.label);
      link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link); list.append(item);
    }
    return list;
  }
  function renderResources() {
    const body = document.getElementById('skill-resources-body');
    for (const group of data.chapterGroups) {
      const sources = sourcesFor(group.chapters); if (!sources.length) continue;
      const section = node('details', 'skill-source-group');
      section.append(node('summary', '', group.title), sourceList(sources)); body.append(section);
    }
  }
  renderResources();
  document.getElementById('skill-resources-jump').addEventListener('click', () => {
    document.getElementById('skill-resources').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  function fillDetail(body, c, { includeCard = true } = {}) {
    if (includeCard) body.append(createKnowledgeCard(c, { badge: 'Открытие из переписки' }).element);
    const disclosure = (title, ...children) => {
      const details = node('details', 'skill-reading');
      const content = node('div', 'skill-reading-body'); content.append(...children);
      details.append(node('summary', '', title), content);
      return details;
    };
    const saved = records(c);
    saved.forEach((record, index) => {
      const section = node('section', 'term-record');
      if ((c.updates || [c]).length > 1) section.append(node('p', 'term-record-number', `ШАГ ${index + 1}`));
      section.append(node('h3', '', record.isUpdate ? record.title : record.stepsTitle || 'Как действовать'));
      if (record.steps?.length) {
        const actions = node('ol', 'skill-actions');
        for (const text of record.steps) actions.append(node('li', '', text));
        section.append(actions);
      }
      if (record.workedExample) section.append(disclosure('Полный пример: сравнение наушников', createWorkedExample(record.workedExample)));
      if (record.examples?.length) {
        const list = node('ul', 'term-examples');
        for (const text of record.examples) { const item = node('li'); for (const paragraph of text.split('\n\n')) item.append(node('p', '', paragraph)); list.append(item); }
        section.append(disclosure('Разобранные примеры', list));
      }
      const explanation = record.detail.split('\n\n').map(text => node('p', '', text));
      if (index === 0 && c.role) explanation.push(node('h4', '', 'В этой истории'), node('p', '', c.role));
      section.append(disclosure(record.detailTitle || 'Почему это работает', ...explanation));
      const source = node('a', 'term-fragment', 'К фрагменту переписки →'); source.href = '#' + record.after;
      source.addEventListener('click', e => { e.preventDefault(); onFragment(record.after); });
      const group = data.chapterGroups.find(g => g.chapters.includes(record.chapter));
      const sources = sourcesFor(group?.chapters || [record.chapter]);
      if (sources.length) section.append(disclosure('Источники', sourceList(sources)));
      section.append(source);
      body.append(section);
    });
    const remaining = (c.updates || [c]).length - saved.length;
    if (remaining) body.append(node('p', 'term-future', `${remaining === 1 ? 'Следующий шаг появится' : `Ещё ${remaining} ${plural(remaining, ['шаг', 'шага', 'шагов'])} появятся`} дальше по ходу урока.`));
    const links = related(c.id);
    if (links.length) {
      body.append(node('h4', 'term-section-label', 'Связанные навыки'));
      for (const [a, b, label] of links) {
        const other = byId.get(a === c.id ? b : a);
        const link = action('', () => select(other.id), 'term-relation');
        link.append(node('span', '', label), node('strong', '', `${other.name} ↗`)); body.append(link);
      }
    }
  }
  function reset(chapters) {
    mergeHistory();
    const affected = chapters && new Set(chapters);
    history = affected ? history.filter(c => !affected.has(byEvent.get(c.id)?.chapter)) : [];
    persistHistory();
    if (selected && !claimed(selected)) selected = null;
    for (const id of cards.keys()) updateCard(id);
    if (!dialog.hidden) render();
  }
  addEventListener('storage', e => {
    if (e.key !== key) return;
    const saved = readHistory(); if (saved === null) return; history = saved; localOnly = false; for (const id of cards.keys()) updateCard(id);
    if (!dialog.hidden) render(); if (!sheet.hidden && selected) select(selected, { route: false }); onClaim();
  });
  return { claimed, card, open, select, reset, restoreProgress, render: () => { if (!dialog.hidden) render(); }, clear: () => { history = []; localStorage.removeItem(key); } };
}
