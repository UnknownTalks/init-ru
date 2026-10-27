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
  function route() {
    const current = data.scenes[index];
    return current.level === 1
      ? data.basics.map((id) => byId.get(id))
      : data.scenes
          .map((scene, i) => ({ scene, i }))
          .filter(({ scene }) => scene.parent === current.parent)
          .map(({ i }) => i);
  }
  function move(delta) {
    const list = route(),
      position = list.indexOf(index),
      next = list[position + delta];
    if (next !== undefined) focus(next);
  }
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
    card.setAttribute("aria-description", scene.narrative.join(" "));
    card.style.cssText = `left:${scene.x}px;top:${scene.y}px;width:${scene.width}px;height:${scene.height}px`;
    const kicker = document.createElement("div");
    kicker.className = "card-kicker";
    kicker.textContent = data.chapters.find(
      (chapter) => chapter.id === scene.chapter,
    ).title;
    const heading = document.createElement("h2");
    heading.className = "card-title";
    heading.textContent = scene.title;
    card.append(kicker, heading);
    const tabList = document.createElement("div");
    tabList.className = "card-tabs";
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "Разделы темы");
    const views = [
      ["story", "Рассказ"],
      ["problem", "Проблема"],
      ["mechanism", "Как работает"],
      ["example", "Пример"],
      ["facts", "Факты и источники"],
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
      if (id === "story") {
        const prose = document.createElement("div");
        prose.className = "card-prose";
        for (const paragraph of scene.narrative) addText(prose, paragraph);
        const example = document.createElement("aside");
        example.className = "card-example";
        addText(example, scene.example.title, "example-title");
        exampleSteps(example);
        addText(example, scene.fact.kind + ": " + scene.fact.text, "card-fact");
        panel.append(prose, example);
      } else if (id === "problem") {
        addText(panel, scene.problem, "section-prose");
        addText(panel, scene.bridge, "section-question");
      } else if (id === "mechanism") {
        addText(panel, scene.explanation, "section-prose");
      } else if (id === "example") {
        addText(panel, scene.example.title, "example-title");
        exampleSteps(panel);
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
    activateTab("story");
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
    navigation.setAttribute("aria-label", "Связанные темы");
    for (const target of scene.navigation.targets) {
      const link = document.createElement("a");
      link.href = "#" + target.id;
      link.dataset.target = target.id;
      link.textContent = target.title + " →";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        focus(byId.get(target.id));
      });
      navigation.append(link);
    }
    card.append(navigation);
    card.addEventListener("click", (event) => {
      if (!dragged && overview) focus(scene.number - 1);
    });
    sceneContainer.append(card);
    entries.set(scene.id, { scene, card });
  }
  const connections = document.getElementById("connections");
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
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "#47566f");
    p.setAttribute("stroke-width", "5");
    connections.append(p);
  }
  function transform() {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }
  function fit(rect, animate = true) {
    cancelAnimationFrame(animation);
    const pad = innerWidth < 760 ? 13 : 36;
    const available = stage.getBoundingClientRect();
    const targetScale = Math.min(
      (available.width - pad * 2) / rect.width,
      (available.height - pad * 2) / rect.height,
    );
    const targetX =
      (available.width - rect.width * targetScale) / 2 - rect.x * targetScale;
    const targetY =
      (available.height - rect.height * targetScale) / 2 - rect.y * targetScale;
    if (!animate || reduced) {
      scale = targetScale;
      tx = targetX;
      ty = targetY;
      transform();
      return;
    }
    const from = { scale, tx, ty },
      start = performance.now();
    function frame(time) {
      const p = Math.min(1, (time - start) / 420),
        eased = 1 - Math.pow(1 - p, 3);
      scale = from.scale + (targetScale - from.scale) * eased;
      tx = from.tx + (targetX - from.tx) * eased;
      ty = from.ty + (targetY - from.ty) * eased;
      transform();
      if (p < 1) animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }
  function focus(next, animate = true) {
    index = Math.max(0, Math.min(data.scenes.length - 1, next));
    overview = false;
    document.body.classList.remove("overview");
    const scene = data.scenes[index];
    for (const [id, entry] of entries) {
      entry.card.classList.toggle("active", id === scene.id);
      entry.card.setAttribute("aria-current", String(id === scene.id));
    }
    document.getElementById("scene-title").textContent = scene.title;
    const ancestors = [];
    let parent = scene.parent ? data.scenes[byId.get(scene.parent)] : null;
    while (parent) {
      ancestors.unshift(parent.title);
      parent = parent.parent ? data.scenes[byId.get(parent.parent)] : null;
    }
    const label = [
      data.chapters.find((c) => c.id === scene.chapter).title,
      ...ancestors,
    ].join(" › ");
    document.getElementById("chapter-label").textContent = label;
    document.getElementById("chapter-label").title = label;
    for (const button of document.querySelectorAll("[data-chapter]"))
      button.setAttribute(
        "aria-current",
        String(button.dataset.chapter === scene.chapter),
      );
    history.replaceState(null, "", "#" + scene.id);
    fit(scene, animate);
  }
  function showOverview(animate = true) {
    overview = true;
    document.body.classList.add("overview");
    const minX = Math.min(...data.groups.map((g) => g.x)) - 40,
      minY = Math.min(...data.groups.map((g) => g.y)) - 70;
    const maxX = Math.max(...data.groups.map((g) => g.x + g.width)) + 40,
      maxY = Math.max(...data.groups.map((g) => g.y + g.height)) + 40;
    fit({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, animate);
  }
  function zoom(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    cancelAnimationFrame(animation);
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
    if (event.target.closest("input,textarea,select,.card-tabs")) return;
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
      move(1);
    }
    if (["ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      move(-1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focus(byId.get(data.basics[0]));
    }
    if (event.key === "End") {
      event.preventDefault();
      focus(byId.get(data.basics.at(-1)));
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
    if (event.target.closest(".card-links,.card-back,.card-tabs,.card-panel a"))
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
      tx = startTX + event.clientX - startX;
      ty = startTY + event.clientY - startY;
      transform();
    }
  });
  function release(event) {
    pointers.delete(event.pointerId);
    stage.classList.remove("dragging");
    if (!dragged && overview) {
      const r = stage.getBoundingClientRect(),
        x = (event.clientX - r.left - tx) / scale,
        y = (event.clientY - r.top - ty) / scale;
      const hit = data.scenes.find(
        (s) =>
          x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height,
      );
      if (hit) focus(hit.number - 1);
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
    if (i >= 0) focus(i);
  });
  focus(index, false);
})();
