// Secondary lesson pages share the browser history and the document's scroll.
// Reading progress remains owned by the player, independently of the UI route.
const routes = {
  'timeline-dialog': 'chapters', 'skills-journal': 'skills', 'term-detail': 'skill',
  settings: 'settings', about: 'about',
  'mechanism-agent': 'agent',
  'person-info': 'person', 'material-info': 'materials', 'rollback-dialog': 'reset',
};
export function createLessonViews({ storageKey, rememberReading, restoreReading, pauseReading, resumeReading, onChange, motion }) {
  const sections = Object.fromEntries(Object.entries(routes).filter(([id]) => document.getElementById(id)).map(([id, route]) => [route, id]));
  const layout = document.getElementById('lesson-layout');
  const reader = document.getElementById('lesson-reader');
  const pages = document.getElementById('secondary-views');
  const positionKey = storageKey + ':view-positions:v1';
  let positions = {}, current = 'read', navigation = null, revision = 0;
  try {
    const saved = JSON.parse(sessionStorage.getItem(positionKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) positions = saved;
  } catch { /* In-memory navigation still works. */ }
  const persist = () => { try { sessionStorage.setItem(positionKey, JSON.stringify(positions)); } catch {} };
  history.scrollRestoration = 'manual';
  function routeFromURL() {
    const params = new URL(location.href).searchParams;
    const name = params.get('view') || 'read';
    return name === 'read' || sections[name] ? name : 'read';
  }
  function remember() {
    positions[current] = scrollY;
    if (current === 'read') rememberReading();
    persist();
  }
  function apply(name, { restore = true, resume = true } = {}) {
    current = name;
    layout.dataset.view = name;
    document.body.dataset.appView = name;
    reader.hidden = name !== 'read';
    pages.hidden = name === 'read';
    for (const [route, id] of Object.entries(sections)) document.getElementById(id).hidden = route !== name;
    for (const item of document.querySelectorAll('[data-view-nav]')) {
      const active = item.dataset.viewNav === name || name === 'skill' && item.dataset.viewNav === 'skills';
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    if (name === 'read') {
      if (restore) restoreReading();
      if (resume) resumeReading();
    } else {
      pauseReading();
      onChange(name, new URL(location.href).searchParams);
      if (restore) window.scrollTo({ top: Number(positions[name]) || 0, behavior: 'instant' });
      const heading = document.getElementById(sections[name]).querySelector('h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
    document.dispatchEvent(new CustomEvent('unknowntalks:view', { detail: { name } }));
  }
  function display(name, options = {}) {
    const token = ++revision;
    navigation?.cancel(); navigation = null;
    layout.removeAttribute('aria-busy');
    // Programmatic chapter navigation owns its own transition and anchors.
    if (!motion || options.resume === false) { apply(name, options); return; }
    pauseReading();
    layout.setAttribute('aria-busy', 'true');
    navigation = motion.transition({ from: current, to: name,
      valid: () => token === revision,
      commit: () => apply(name, { ...options, resume: false }),
      complete: () => { navigation = null; layout.removeAttribute('aria-busy'); if (name === 'read') resumeReading(); },
    });
  }
  function open(id, options = {}) {
    const name = routes[id] || (id === 'read' ? 'read' : null);
    if (!name || name !== 'read' && !sections[name]) return;
    const url = new URL(location.href);
    for (const param of ['view', 'skill', 'person', 'material', 'chat', 'chats']) url.searchParams.delete(param);
    if (name !== 'read') url.searchParams.set('view', name);
    for (const param of ['skill', 'person', 'material']) if (options[param]) url.searchParams.set(param, options[param]);
    url.hash = '';
    if (url.href === location.href && (name === current || navigation)) return;
    remember();
    history.pushState({ ...history.state, lessonPage: name }, '', url);
    display(name, options);
  }
  function read(options = {}) { open('read', options); }
  function close(id) {
    if (id === 'term-detail') open('skills-journal');
    else if (id === 'rollback-dialog') open('settings');
    else read();
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const back = event.target.closest('[data-read-return], [data-view-back]');
    if (!back) return;
    event.preventDefault();
    if (back.dataset.viewBack) open(back.dataset.viewBack); else read();
  });
  addEventListener('popstate', () => {
    remember();
    display(routeFromURL());
  });
  addEventListener('pagehide', remember);
  // Rendering the restored transcript precedes route restoration.
  const initial = routeFromURL();
  if (initial !== 'read') apply(initial);
  else apply('read', { restore: false, resume: false });
  return { open, read, close, isReading: () => current === 'read' && !navigation, current: () => current,
    clearPositions: () => { positions = {}; try { sessionStorage.removeItem(positionKey); } catch {} },
  };
}
