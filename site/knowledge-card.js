import { uiElement as node } from './ui/dom.js';
import { buttonVariants } from './ui/variants.js';

// Knowledge-discovery presentation used by the lesson and skill details.
// The renderer owns no progress or navigation: callers supply the card action.
const drawings = {
  chat: '<path d="M61 30h168a16 16 0 0 1 16 16v78a16 16 0 0 1-16 16H93l-28 16v-16h-4a16 16 0 0 1-16-16V46a16 16 0 0 1 16-16Z"/><path d="M75 63h126M75 83h98M75 103h64" class="knowledge-icon-lines"/><circle cx="211" cy="111" r="10" class="knowledge-icon-dot"/>',
  calendar: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="M45 59h200M89 18v23M201 18v23"/><path d="m131 86 28 28m0-28-28 28" class="knowledge-icon-warning"/>',
  document: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="M75 58h126M75 83h100M75 108h116" class="knowledge-icon-lines"/>',
  checklist: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="m68 61 8 8 14-17m-22 39 8 8 14-17M108 61h108M108 91h108M108 118h76" class="knowledge-icon-lines"/>',
  weights: '<rect x="45" y="30" width="200" height="110" rx="12"/><g class="knowledge-icon-lines"><path d="m89 66 56 38 56-38M89 104l56-38 56 38M89 66h112M89 104h112"/></g><g class="knowledge-icon-dot"><circle cx="89" cy="66" r="7"/><circle cx="145" cy="66" r="7"/><circle cx="201" cy="66" r="7"/><circle cx="89" cy="104" r="7"/><circle cx="145" cy="104" r="7"/><circle cx="201" cy="104" r="7"/></g>',
  models: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="M145 30v110M65 111V75h23v36m20 0V59h17v52m40 0V61h23v50m20 0V46h17v65" class="knowledge-icon-lines"/>',
  context: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="M45 60h200M109 60v80M67 84h20M67 104h20M132 84h87M132 104h68M132 124h80" class="knowledge-icon-lines"/>',
  trace: '<rect x="45" y="30" width="200" height="110" rx="12"/><path d="M74 61h93M74 85h74M74 109h55" class="knowledge-icon-lines"/><circle cx="189" cy="94" r="20" class="knowledge-icon-lines"/><path d="m204 109 19 19" class="knowledge-icon-lines"/>',
};

export function createWorkedExample(example) {
  const figure = node('figure', 'knowledge-request-example');
  figure.setAttribute('aria-label', 'Пример задания, отзывов и ответа модели');
  figure.append(node('p', 'knowledge-card-situation', example.situation));
  const inputs = node('div', 'knowledge-request-inputs');
  const instruction = node('section', 'knowledge-request-panel knowledge-request-instruction');
  instruction.append(node('h4', '', '1. Что нужно сделать'));
  const prompt = node('blockquote', 'knowledge-request-prompt');
  prompt.append(node('p', '', example.instruction.text));
  const rules = node('ul');
  for (const point of example.instruction.points) rules.append(node('li', '', point));
  prompt.append(rules); instruction.append(prompt);
  const plus = node('span', 'knowledge-request-plus', '+'); plus.setAttribute('aria-hidden', 'true');
  const data = node('section', 'knowledge-request-panel knowledge-request-data');
  data.append(node('h4', '', '2. На что опираться'));
  for (const review of example.reviews) {
    const item = node('article', 'knowledge-request-review');
    const source = node('a', 'knowledge-request-source', review.sourceLabel); source.href = review.source;
    item.append(node('h5', '', review.title), node('blockquote', '', review.quote), source);
    data.append(item);
  }
  inputs.append(instruction, plus, data);
  const model = node('div', 'knowledge-request-model');
  const down = () => { const arrow = node('span', 'knowledge-request-arrow', '↓'); arrow.setAttribute('aria-hidden', 'true'); return arrow; };
  model.append(down(), node('p', '', example.modelAction), down());
  const output = node('section', 'knowledge-request-panel knowledge-request-output');
  output.append(node('h4', '', '3. Как выглядит ответ'));
  const results = node('div', 'knowledge-request-results');
  for (const review of example.reviews) {
    const item = node('article', 'knowledge-request-result');
    const source = node('a', 'knowledge-request-source', review.sourceLabel); source.href = review.source;
    item.append(node('h5', '', review.title), node('p', '', review.result), source);
    results.append(item);
  }
  output.append(results); figure.append(inputs, model, output);
  if (example.explanation) figure.append(node('p', 'knowledge-worked-explanation', example.explanation));
  return figure;
}

function illustration(example) {
  const figure = node('figure', 'knowledge-card-figure');
  figure.append(node('p', 'knowledge-card-situation', example.situation));
  const graphic = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  graphic.setAttribute('viewBox', '0 0 580 166');
  graphic.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  graphic.setAttribute('role', 'img');
  graphic.setAttribute('aria-label', `${example.left.label}: ${example.left.detail}. ${example.right.label}: ${example.right.detail}.`);
  const connection = example.connection === 'plus'
    ? '<path d="M276 84h28M290 70v28"/>'
    : document.documentElement.dataset.material === 'embossed'
    ? '<path d="M250 84c20-5 47 7 79 0m-8-6 9 6-8 7"/><path d="M253 87q35-3 67 1" opacity=".22"/>'
    : '<path d="M249 85h82"/><path d="m323 79 8 6-8 6"/>';
  graphic.innerHTML = '<g class="knowledge-card-wires" data-connection="' + (example.connection === 'plus' ? 'plus' : 'arrow') + '" fill="none">' + connection + '</g>' +
    `<g class="knowledge-card-icon knowledge-card-icon-left">${drawings[example.left.icon] || drawings.chat}</g>` +
    `<g class="knowledge-card-icon knowledge-card-icon-right" transform="translate(290 0)">${drawings[example.right.icon] || drawings.document}</g>`;
  const caption = node('figcaption', 'knowledge-card-captions');
  for (const side of [example.left, example.right]) {
    const item = node('span', 'knowledge-card-caption');
    item.append(node('span', 'knowledge-card-role', side.label), node('small', '', side.detail));
    caption.append(item);
  }
  figure.append(graphic, caption);
  return figure;
}

export function createKnowledgeCard(concept, { badge = 'Новое открытие', actionLabel, onAction, className = '', title } = {}) {
  const element = node('article', 'knowledge-card ' + className);
  const heading = title || concept.discoveryTitle || concept.name;
  element.setAttribute('aria-label', heading);
  const byline = node('header', 'knowledge-card-byline');
  const mark = node('span', 'knowledge-card-mark', 'u.'); mark.setAttribute('aria-hidden', 'true');
  const badgeNode = node('span', 'knowledge-card-badge', badge);
  byline.append(mark, node('span', 'knowledge-card-brand', 'UnknownTalks'), badgeNode);
  element.append(byline, node('h3', 'knowledge-card-title', heading));
  if (concept.cardExample) element.append(illustration(concept.cardExample));
  const description = concept.cardExample?.explanation || concept.discoveryDescription || concept.short;
  for (const paragraph of (description || '').split('\n\n').filter(Boolean))
    element.append(node('p', 'knowledge-card-description', paragraph));
  let button = null;
  if (onAction) {
    const footer = node('footer', 'knowledge-card-footer');
    button = node('button', buttonVariants({ variant: 'knowledge' }), actionLabel || 'Добавить навык и продолжить');
    button.type = 'button'; button.dataset.variant = 'knowledge';
    button.addEventListener('click', onAction);
    footer.append(button); element.append(footer);
  }
  return { element, button, badge: badgeNode };
}
