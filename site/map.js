(() => {
  const data = JSON.parse(document.getElementById("story-data").textContent);
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const sceneContainer = document.getElementById("scenes");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const svgNS = "http://www.w3.org/2000/svg";
  const entries = new Map();
  let index = Math.max(
    0,
    data.scenes.findIndex((s) => s.id === location.hash.slice(1)),
  );
  let scale = 1,
    tx = 0,
    ty = 0,
    overview = false,
    animation = 0;
  const byId = new Map(data.scenes.map((scene, i) => [scene.id, i]));
  let trail = [data.scenes[index].id],
    trailIndex = 0;
  if (
    history.state?.trail?.every((id) => byId.has(id)) &&
    history.state.trail[history.state.trailIndex] === data.scenes[index].id
  ) {
    trail = history.state.trail;
    trailIndex = history.state.trailIndex;
  }
  const visited = new Set(trail);
  const miniNodes = new Map();
  const termsById = new Map(data.glossary.map((term) => [term.id, term]));
  const progressKey = "unknowntalks:init-ru:lesson-01:completed:v1";
  let completed = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || "[]");
    if (Array.isArray(saved))
      completed = new Set(saved.filter((id) => byId.has(id)));
  } catch {}
  const descendants = new Map();
  function subtree(id) {
    if (!descendants.has(id))
      descendants.set(id, [
        id,
        ...data.scenes
          .filter((scene) => scene.parent === id)
          .flatMap((scene) => subtree(scene.id)),
      ]);
    return descendants.get(id);
  }
  function progress(id) {
    const ids = subtree(id),
      done = ids.filter((id) => completed.has(id)).length;
    return {
      done,
      total: ids.length,
      status:
        done === 0 ? "unstarted" : done === ids.length ? "done" : "partial",
    };
  }
  function renderProgress() {
    for (const scene of data.scenes) {
      const value = progress(scene.id),
        entry = entries.get(scene.id);
      if (entry) {
        entry.card.dataset.progress = value.status;
        entry.card.querySelector(".study-check").checked = completed.has(
          scene.id,
        );
        entry.card.querySelector(".study-branch").textContent =
          ` · Ветка ${value.done}/${value.total}`;
      }
      const mini = miniNodes.get(scene.id);
      if (mini) {
        mini.dataset.progress = value.status;
        mini.setAttribute(
          "aria-label",
          `${scene.shortTitle}: изучено ${value.done} из ${value.total}`,
        );
      }
    }
    for (const link of document.querySelectorAll(".card-links [data-target]")) {
      const value = progress(link.dataset.target);
      link.dataset.progress = value.status;
      link.dataset.count = `${value.done}/${value.total}`;
      link.title =
        {
          unstarted: "Не начато",
          partial: "Изучено частично",
          done: "Ветка изучена",
        }[value.status] + `: ${value.done} из ${value.total} карточек`;
      link.setAttribute("aria-label", link.textContent + ". " + link.title);
    }
    for (const button of document.querySelectorAll("[data-chapter]")) {
      const root = data.scenes.find(
          (scene) =>
            scene.chapter === button.dataset.chapter && scene.level === 1,
        ),
        value = progress(root.id);
      button.dataset.progress = value.status;
      button.dataset.count = `${value.done}/${value.total}`;
      button.title = `${root.shortTitle}: изучено ${value.done} из ${value.total}`;
    }
    const scene = data.scenes[index],
      value = progress(scene.id);
    document.getElementById("position-caption").textContent =
      scene.shortTitle + ` · ${value.done}/${value.total}`;
    document.getElementById("chapter-label").textContent =
      data.chapters.find((c) => c.id === scene.chapter).title +
      ` · Ветка ${value.done}/${value.total} · Всего изучено ${completed.size}/${data.scenes.length}`;
  }
  function setCompleted(id, checked) {
    checked ? completed.add(id) : completed.delete(id);
    try {
      localStorage.setItem(progressKey, JSON.stringify([...completed]));
    } catch {
      document.getElementById("study-storage-status").textContent =
        "Браузер не разрешает сохранить отметки. До закрытия страницы они останутся здесь.";
    }
    renderProgress();
  }
  addEventListener("storage", (event) => {
    if (event.key === progressKey) {
      try {
        const value = JSON.parse(event.newValue || "[]");
        completed = new Set(
          Array.isArray(value) ? value.filter((id) => byId.has(id)) : [],
        );
        renderProgress();
      } catch {}
    }
  });

  const termDialog = document.getElementById("term-dialog");
  function openTerm(id) {
    const term = termsById.get(id);
    document.getElementById("term-title").textContent = term.title;
    document.getElementById("term-definition").textContent = term.definition;
    document.getElementById("term-example").textContent =
      "Пример: " + term.example;
    const actions = document.getElementById("term-actions");
    actions.replaceChildren();
    const source = document.createElement("a");
    source.href = "../../glossary.html#" + term.id;
    source.target = "_blank";
    source.textContent = "В общем словаре ↗";
    actions.append(source);
    if (!termDialog.open) termDialog.showModal();
  }
  document
    .getElementById("term-close")
    .addEventListener("click", () => termDialog.close());
  document.addEventListener("click", (event) => {
    const term = event.target.closest("[data-term]");
    if (term) {
      event.preventDefault();
      event.stopPropagation();
      openTerm(term.dataset.term);
    }
  });
  termDialog.addEventListener("click", (event) => {
    if (event.target === termDialog) {
      const r = termDialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        termDialog.close();
    }
  });

  const chapterColors = [
    "#6de4d2",
    "#f6ce77",
    "#bbabff",
    "#a0e39b",
    "#ffb27c",
    "#ffa5c8",
  ];
  for (const [i, chapter] of data.chapters.entries()) {
    const button = document.createElement("button");
    button.textContent = chapter.title.slice(5);
    button.title = chapter.title;
    button.dataset.chapter = chapter.id;
    button.addEventListener("click", () =>
      focus(data.scenes.findIndex((s) => s.chapter === chapter.id)),
    );
    document.getElementById("chapters").append(button);
    const group = data.groups.find((g) => g.id === "group-" + chapter.id);
    const label = document.createElement("div");
    label.className = "map-label";
    label.style.cssText = `left:${group.x + 35}px;top:${group.y - 45}px;color:${chapterColors[i]}`;
    const title = document.createElement("span");
    title.textContent = chapter.title;
    const sub = document.createElement("small");
    sub.textContent = "Нажмите на сцену, чтобы приблизить";
    label.append(title, sub);
    sceneContainer.append(label);
  }
  for (const scene of data.scenes) {
    const card = document.createElement("article");
    card.className = "scene";
    card.dataset.scene = scene.id;
    card.setAttribute("aria-label", `${scene.number}. ${scene.title}`);
    card.setAttribute("aria-description", scene.walkthrough.join(" "));
    card.style.cssText = `left:${scene.x}px;top:${scene.y}px;width:${scene.width}px;height:${scene.height}px`;
    const kicker = document.createElement("div");
    kicker.className = "card-kicker";
    kicker.textContent = data.chapters.find(
      (chapter) => chapter.id === scene.chapter,
    ).title;
    const heading = document.createElement("h2");
    heading.className = "card-title";
    heading.textContent = scene.title;
    const branch = document.createElement("span");
    branch.className = "study-branch";
    kicker.append(branch);
    const studied = document.createElement("label");
    studied.className = "study-toggle";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "study-check";
    check.setAttribute("aria-label", "Эта карточка изучена");
    check.addEventListener("change", () =>
      setCompleted(scene.id, check.checked),
    );
    studied.append(check, document.createTextNode("Эта карточка изучена"));
    studied.addEventListener("click", (event) => event.stopPropagation());
    card.append(kicker, heading, studied);
    const tabList = document.createElement("div");
    tabList.className = "card-tabs";
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "Разделы темы");
    const views = [
      ["problem", "Задача и пример"],
      ["mechanism", "Как работает"],
      ["example", "Пример"],
      ["facts", "Факты и источники"],
      ["terms", "Термины"],
    ];
    const panels = new Map(),
      tabs = new Map();
    function addText(parent, value, className = "") {
      const paragraph = document.createElement("p");
      paragraph.textContent = value;
      paragraph.className = className;
      parent.append(paragraph);
      return paragraph;
    }
    function exampleSteps(parent) {
      for (const step of scene.example.steps) {
        const block = document.createElement("section");
        block.className = "example-step";
        addText(block, step.label, "example-label");
        addText(
          block,
          step.text,
          step.mono
            ? "example-value mono"
            : step.large
              ? "example-value large"
              : "example-value",
        );
        parent.append(block);
      }
    }
    function activateTab(id, keyboard = false) {
      for (const [key, tab] of tabs) {
        const selected = key === id;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels.get(key).hidden = !selected;
      }
      if (keyboard) tabs.get(id).focus();
    }
    for (const [id, title] of views) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.id = scene.id + "-tab-" + id;
      tab.dataset.tab = id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", scene.id + "-panel-" + id);
      tab.textContent = title;
      const panel = document.createElement("div");
      panel.className = "card-panel view-" + id;
      panel.id = scene.id + "-panel-" + id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      if (id === "problem") {
        const prose = document.createElement("div");
        prose.className =
          "card-prose" +
          (scene.walkthrough.join(" ").length > 680 ? " dense" : "");
        for (const paragraph of scene.walkthrough) addText(prose, paragraph);
        const example = document.createElement("aside");
        example.className = "card-example";
        addText(example, scene.example.title, "example-title");
        exampleSteps(example);
        addText(example, scene.fact.kind + ": " + scene.fact.text, "card-fact");
        panel.append(prose, example);
      } else if (id === "mechanism") {
        addText(panel, scene.explanation, "section-prose");
      } else if (id === "example") {
        addText(panel, scene.example.title, "example-title");
        exampleSteps(panel);
      } else if (id === "terms") {
        for (const termId of scene.terms) {
          const term = data.glossary.find((item) => item.id === termId);
          const block = document.createElement("section");
          block.className = "term-card";
          const name = document.createElement("button");
          name.className = "term-link";
          name.dataset.term = term.id;
          name.textContent = term.title;
          block.append(name);
          addText(block, term.definition);
          panel.append(block);
        }
      } else {
        addText(panel, scene.fact.kind, "fact-kind");
        addText(panel, scene.fact.text, "fact-statement");
        addText(panel, scene.factExplanation, "fact-context");
        const sources = document.createElement("div");
        sources.className = "fact-sources";
        for (const source of scene.sources) {
          const link = document.createElement("a");
          link.href = source.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = source.label + " ↗";
          sources.append(link);
        }
        panel.append(sources);
      }
      tab.addEventListener("click", (event) => {
        event.stopPropagation();
        activateTab(id);
      });
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const position = views.findIndex(([key]) => key === id);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? views.length - 1
              : (position +
                  (event.key === "ArrowRight" ? 1 : -1) +
                  views.length) %
                views.length;
        activateTab(views[next][0], true);
      });
      tabs.set(id, tab);
      panels.set(id, panel);
      tabList.append(tab);
      card.append(panel);
    }
    card.append(tabList);
    activateTab("problem");
    if (scene.navigation.back) {
      const back = document.createElement("a");
      back.className = "card-back";
      back.textContent = "← " + scene.navigation.back.title;
      back.href = "#" + scene.navigation.back.id;
      back.dataset.target = scene.navigation.back.id;
      back.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        focus(byId.get(scene.navigation.back.id));
      });
      card.append(back);
    }
    const navigation = document.createElement("nav");
    navigation.className = "card-links";
    navigation.setAttribute("aria-label", "Вложенные карточки темы");
    for (const target of scene.navigation.targets) {
      const link = document.createElement("a");
      link.href = "#" + target.id;
      link.dataset.target = target.id;
      link.textContent = target.title;
      link.dataset.kind = target.kind;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        focus(byId.get(target.id));
      });
      navigation.append(link);
    }
    const navLabel = document.createElement("div");
    navLabel.className = "card-navigation-label";
    navLabel.textContent = scene.navigation.targets.length
      ? "Карточки этой темы · серый: не начато · жёлтый: частично · зелёный: изучено"
      : "Это последняя карточка в этой ветке. Отметьте изучение и вернитесь к родительской теме.";
    card.append(navLabel, navigation);
    card.addEventListener("click", (event) => {
      if (!dragged && overview) focus(scene.number - 1);
    });
    sceneContainer.append(card);
    entries.set(scene.id, { scene, card });
  }

  const aliases = new Map();
  for (const term of data.glossary)
    for (const alias of term.aliases)
      if (!aliases.has(alias.toLowerCase()))
        aliases.set(alias.toLowerCase(), term);
  const escaped = [...aliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const termPattern = new RegExp(
    "(?<![\\p{L}\\p{N}_])(?:" + escaped.join("|") + ")(?![\\p{L}\\p{N}_])",
    "giu",
  );
  for (const paragraph of document.querySelectorAll(
    ".card-prose p,.view-mechanism p,.view-facts .fact-context,.card-example .example-value:not(.mono)",
  )) {
    const value = paragraph.textContent,
      fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of value.matchAll(termPattern)) {
      fragment.append(document.createTextNode(value.slice(end, match.index)));
      const term = aliases.get(match[0].toLowerCase());
      const button = document.createElement("button");
      button.className = "term-link";
      button.dataset.term = term.id;
      button.textContent = match[0];
      button.title = term.definition;
      fragment.append(button);
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(value.slice(end)));
    paragraph.replaceChildren(fragment);
  }
  function svgElement(tag, attributes) {
    const node = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes))
      node.setAttribute(key, String(value));
    return node;
  }
  const mini = document.getElementById("minimap");
  const bounds = {
    x: -100,
    y: -200,
    width: Math.max(...data.groups.map((g) => g.x + g.width)) + 200,
    height: Math.max(...data.groups.map((g) => g.y + g.height)) + 400,
  };
  mini.setAttribute(
    "viewBox",
    `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
  );
  for (const edge of data.edges) {
    const a = data.scenes[byId.get(edge.fromNode)],
      b = data.scenes[byId.get(edge.toNode)];
    mini.append(
      svgElement("line", {
        x1: a.x + a.width / 2,
        y1: a.y + a.height / 2,
        x2: b.x + b.width / 2,
        y2: b.y + b.height / 2,
        stroke: "#58657c",
        "stroke-width": 22,
      }),
    );
  }
  for (const scene of data.scenes) {
    const node = svgElement("rect", {
      x: scene.x,
      y: scene.y,
      width: scene.width,
      height: scene.height,
      rx: 130,
      fill: "#39465c",
      role: "button",
      tabindex: 0,
      "aria-label": scene.shortTitle,
    });
    const title = svgElement("title", {});
    title.textContent = scene.shortTitle;
    node.append(title);
    node.addEventListener("click", () => focus(byId.get(scene.id)));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        focus(byId.get(scene.id));
      }
    });
    mini.append(node);
    miniNodes.set(scene.id, node);
  }
  const connections = document.getElementById("connections");
  const definitions = svgElement("defs", {});
  const marker = svgElement("marker", {
    id: "connection-arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 5,
    markerHeight: 5,
    orient: "auto-start-reverse",
  });
  marker.append(
    svgElement("path", { d: "M0 0 L10 5 L0 10z", fill: "context-stroke" }),
  );
  definitions.append(marker);
  connections.append(definitions);
  for (const edge of data.edges) {
    const a = entries.get(edge.fromNode)?.scene,
      b = entries.get(edge.toNode)?.scene;
    if (!a || !b) continue;
    const horizontal = edge.fromSide === "right";
    const x1 = a.x + (horizontal ? a.width : a.width / 2),
      y1 = a.y + (horizontal ? a.height / 2 : a.height);
    const x2 = b.x + (horizontal ? 0 : b.width / 2),
      y2 = b.y + (horizontal ? b.height / 2 : 0);
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute(
      "d",
      horizontal
        ? `M${x1},${y1} C${x1 + 180},${y1} ${x2 - 180},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1},${y1 + 180} ${x2},${y2 - 180} ${x2},${y2}`,
    );
    p.dataset.from = a.id;
    p.dataset.to = b.id;
    p.classList.add("connection", "connection-" + edge.kind);
    p.setAttribute("marker-end", "url(#connection-arrow)");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "#47566f");
    p.setAttribute("stroke-width", "5");
    connections.append(p);
    const label = svgElement("text", {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2 - 20,
      fill: "#a7b7cc",
      "font-size": 27,
      "text-anchor": "middle",
      class: "edge-label",
    });
    label.textContent =
      { route: "Путь", detail: "Разбор", related: "Связь" }[edge.kind] +
      ": " +
      edge.label;
    connections.append(label);
  }
  function transform() {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }
  function camera(rect, pad = innerWidth < 760 ? 14 : 36) {
    const available = stage.getBoundingClientRect();
    const s = Math.min(
      (available.width - pad * 2) / rect.width,
      (available.height - pad * 2) / rect.height,
    );
    return {
      scale: s,
      tx: (available.width - rect.width * s) / 2 - rect.x * s,
      ty: (available.height - rect.height * s) / 2 - rect.y * s,
    };
  }
  function setCamera(value) {
    ({ scale, tx, ty } = value);
    transform();
  }
  function mix(a, b, p) {
    const e = p * p * (3 - 2 * p);
    return {
      scale: a.scale + (b.scale - a.scale) * e,
      tx: a.tx + (b.tx - a.tx) * e,
      ty: a.ty + (b.ty - a.ty) * e,
    };
  }
  function finishTravel() {
    document.body.classList.remove("travelling");
    document.getElementById("travel-status").hidden = true;
    for (const entry of entries.values()) entry.card.classList.remove("origin");
  }
  function fit(rect, animate = true, origin = null) {
    cancelAnimationFrame(animation);
    finishTravel();
    const destination = camera(rect),
      startCamera = { scale, tx, ty };
    if (!animate || reduced) {
      setCamera(destination);
      return;
    }
    const travelling = origin && origin.id !== rect.id;
    const duration = travelling ? 1150 : 320;
    let wide;
    if (travelling) {
      const x = Math.min(origin.x, rect.x) - 120,
        y = Math.min(origin.y, rect.y) - 120;
      wide = camera({
        x,
        y,
        width: Math.max(origin.x + origin.width, rect.x + rect.width) - x + 120,
        height:
          Math.max(origin.y + origin.height, rect.y + rect.height) - y + 120,
      });
      document.body.classList.add("travelling");
      entries.get(origin.id).card.classList.add("origin");
      const status = document.getElementById("travel-status");
      status.textContent = origin.shortTitle + " → " + rect.shortTitle;
      status.hidden = false;
    }
    const started = performance.now();
    function frame(time) {
      const p = Math.min(1, (time - started) / duration);
      const value = !travelling
        ? mix(startCamera, destination, p)
        : p < 0.35
          ? mix(startCamera, wide, p / 0.35)
          : p < 0.57
            ? wide
            : mix(wide, destination, (p - 0.57) / 0.43);
      setCamera(value);
      if (p < 1) animation = requestAnimationFrame(frame);
      else finishTravel();
    }
    animation = requestAnimationFrame(frame);
  }
  function updateLocation(scene) {
    const chain = [];
    let item = scene;
    while (item) {
      chain.unshift(item);
      item = item.parent ? data.scenes[byId.get(item.parent)] : null;
    }
    const breadcrumbs = document.getElementById("breadcrumbs");
    breadcrumbs.replaceChildren();
    const home = document.createElement("button");
    home.textContent = "Темы встречи";
    home.addEventListener("click", () => showOverview());
    breadcrumbs.append(home);
    for (const item of chain) {
      const divider = document.createElement("span");
      divider.textContent = "›";
      const link = document.createElement("button");
      link.textContent = item.shortTitle;
      link.title = item.title;
      if (item.id === scene.id) link.setAttribute("aria-current", "page");
      link.addEventListener("click", () => focus(byId.get(item.id)));
      breadcrumbs.append(divider, link);
    }
    breadcrumbs.scrollLeft = breadcrumbs.scrollWidth;
    const back = document.getElementById("history-back");
    back.disabled = trailIndex === 0;
    back.textContent = trailIndex
      ? "← " + data.scenes[byId.get(trail[trailIndex - 1])].shortTitle
      : "← Назад по переходам";
    document.getElementById("chapter-label").textContent =
      data.chapters.find((c) => c.id === scene.chapter).title +
      " · " +
      (scene.level === 1 ? "основная линия" : "разбор темы");
    document.getElementById("scene-title").textContent = scene.title;
    document.getElementById("position-caption").textContent = scene.shortTitle;
    for (const [id, node] of miniNodes) {
      node.classList.toggle("current", id === scene.id);
      node.classList.toggle("visited", visited.has(id));
      node.setAttribute("aria-current", String(id === scene.id));
    }
  }
  function focus(next, animate = true, record = true) {
    const origin = data.scenes[index],
      changed = next !== index;
    index = Math.max(0, Math.min(data.scenes.length - 1, next));
    overview = false;
    document.body.classList.remove("overview");
    const scene = data.scenes[index];
    visited.add(scene.id);
    for (const [id, entry] of entries) {
      entry.card.classList.toggle("active", id === scene.id);
      entry.card.setAttribute("aria-current", String(id === scene.id));
      entry.card.inert = id !== scene.id;
      entry.card.setAttribute("aria-hidden", String(id !== scene.id));
    }
    if (record && changed) {
      trail = trail.slice(0, trailIndex + 1);
      trail.push(scene.id);
      trailIndex++;
      history.pushState({ trail: [...trail], trailIndex }, "", "#" + scene.id);
    } else if (!history.state?.trail)
      history.replaceState(
        { trail: [...trail], trailIndex },
        "",
        "#" + scene.id,
      );
    for (const path of connections.querySelectorAll(".connection"))
      path.classList.toggle(
        "route-active",
        changed &&
          ((path.dataset.from === origin.id && path.dataset.to === scene.id) ||
            (path.dataset.to === origin.id && path.dataset.from === scene.id)),
      );
    for (const button of document.querySelectorAll("[data-chapter]"))
      button.setAttribute(
        "aria-current",
        String(button.dataset.chapter === scene.chapter),
      );
    updateLocation(scene);
    renderProgress();
    fit(scene, animate, changed ? origin : null);
  }
  document.getElementById("history-back").addEventListener("click", () => {
    if (trailIndex > 0) history.back();
  });
  document
    .getElementById("route-start")
    .addEventListener("click", () => showOverview());
  addEventListener("popstate", (event) => {
    if (event.state?.trail) {
      trail = event.state.trail;
      trailIndex = event.state.trailIndex;
    }
    const i = byId.get(location.hash.slice(1));
    if (i !== undefined) focus(i, true, false);
  });
  function showOverview(animate = true) {
    overview = true;
    document.body.classList.add("overview");
    for (const entry of entries.values()) {
      entry.card.inert = false;
      entry.card.setAttribute("aria-hidden", "false");
    }
    const minX = Math.min(...data.groups.map((g) => g.x)) - 40,
      minY = Math.min(...data.groups.map((g) => g.y)) - 70;
    const maxX = Math.max(...data.groups.map((g) => g.x + g.width)) + 40,
      maxY = Math.max(...data.groups.map((g) => g.y + g.height)) + 40;
    fit({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, animate);
  }
  function zoom(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    cancelAnimationFrame(animation);
    finishTravel();
    const next = Math.max(0.025, Math.min(3.5, scale * factor));
    tx = x - ((x - tx) * next) / scale;
    ty = y - ((y - ty) * next) / scale;
    scale = next;
    transform();
  }
  document
    .getElementById("overview")
    .addEventListener("click", () =>
      overview ? focus(index) : showOverview(),
    );
  document.getElementById("zoom-in").addEventListener("click", () => zoom(1.3));
  document
    .getElementById("zoom-out")
    .addEventListener("click", () => zoom(1 / 1.3));
  document.getElementById("fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  document.addEventListener("keydown", (event) => {
    if (
      termDialog.open ||
      event.target.closest("input,textarea,select,.card-tabs")
    )
      return;
    if (["Enter", " "].includes(event.key) && event.target.closest("a,button"))
      return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      entries
        .get(data.scenes[index].id)
        .card.querySelector(".card-links a")
        ?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const parent = data.scenes[index].parent;
      if (parent) focus(byId.get(parent));
    }
    if (["ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      entries
        .get(data.scenes[index].id)
        .card.querySelector(".card-links a")
        ?.focus();
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      const parent = data.scenes[index].parent;
      if (parent) focus(byId.get(parent));
    }
    if (event.key === "Home") {
      event.preventDefault();
      let root = data.scenes[index];
      while (root.parent) root = data.scenes[byId.get(root.parent)];
      focus(byId.get(root.id));
    }
    if (event.key === "End") {
      event.preventDefault();
      entries
        .get(data.scenes[index].id)
        .card.querySelector(".card-links a:last-child")
        ?.focus();
    }
    if (event.key.toLowerCase() === "o" || event.key === "щ") {
      event.preventDefault();
      overview ? focus(index) : showOverview();
    }
    if (event.key === "Escape") {
      focus(index);
    }
  });
  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const r = stage.getBoundingClientRect();
      zoom(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - r.left,
        event.clientY - r.top,
      );
    },
    { passive: false },
  );
  let dragged = false,
    startX = 0,
    startY = 0,
    startTX = 0,
    startTY = 0;
  const pointers = new Map();
  let pinchDistance = 0;
  stage.addEventListener("pointerdown", (event) => {
    if (
      event.target.closest(
        ".card-links,.card-back,.card-tabs,.card-panel a,.term-link,.study-toggle,input,button",
      )
    )
      return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragged = false;
      startX = event.clientX;
      startY = event.clientY;
      startTX = tx;
      startTY = ty;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      dragged = true;
    }
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        distance = Math.hypot(a.x - b.x, a.y - b.y),
        r = stage.getBoundingClientRect();
      if (pinchDistance)
        zoom(
          distance / pinchDistance,
          (a.x + b.x) / 2 - r.left,
          (a.y + b.y) / 2 - r.top,
        );
      pinchDistance = distance;
      return;
    }
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5)
      dragged = true;
    if (dragged) {
      cancelAnimationFrame(animation);
      finishTravel();
      tx = startTX + event.clientX - startX;
      ty = startTY + event.clientY - startY;
      transform();
    }
  });
  function release(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    stage.classList.remove("dragging");
    if (!dragged) {
      const r = stage.getBoundingClientRect(),
        x = (event.clientX - r.left - tx) / scale,
        y = (event.clientY - r.top - ty) / scale;
      const hit = data.scenes.find(
        (s) =>
          x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height,
      );
      if (hit && (overview || hit.id !== data.scenes[index].id))
        focus(hit.number - 1);
    }
    if (pointers.size === 1) {
      const point = [...pointers.values()][0];
      startX = point.x;
      startY = point.y;
      startTX = tx;
      startTY = ty;
    }
  }
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  addEventListener("resize", () =>
    overview ? showOverview(false) : focus(index, false),
  );
  addEventListener("hashchange", () => {
    const i = data.scenes.findIndex((s) => s.id === location.hash.slice(1));
    if (i >= 0 && i !== index) focus(i);
  });
  focus(index, false);
})();
