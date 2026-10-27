(() => {
  const data = JSON.parse(document.getElementById("story-data").textContent);
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const sceneContainer = document.getElementById("scenes");
  const sourceBox = document.getElementById("sources");
  const sourceToggle = document.getElementById("sources-toggle");
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
  let explaining = false;
  const depthNames = {
    1: "Основы",
    2: "Принцип",
    3: "Реализация",
    4: "Разбор вычисления",
  };
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
  function children() {
    return data.scenes
      .map((scene, i) => ({ scene, i }))
      .filter(({ scene }) => scene.parent === data.scenes[index].id);
  }
  function move(delta) {
    const list = route(),
      position = list.indexOf(index),
      next = list[position + delta];
    if (next !== undefined) focus(next);
  }
  function closeBranches() {
    document.getElementById("branches").hidden = true;
    document.getElementById("deeper").setAttribute("aria-expanded", "false");
  }
  function showBranches() {
    const branch = children();
    if (!branch.length) return;
    if (branch.length === 1) {
      focus(branch[0].i);
      return;
    }
    const panel = document.getElementById("branches");
    const open = panel.hidden;
    closeBranches();
    if (!open) return;
    panel.replaceChildren();
    for (const { scene, i } of branch) {
      const button = document.createElement("button");
      button.textContent = scene.title;
      button.dataset.target = scene.id;
      button.addEventListener("click", () => focus(i));
      panel.append(button);
    }
    panel.hidden = false;
    document.getElementById("deeper").setAttribute("aria-expanded", "true");
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
    const card = document.createElement("button");
    card.type = "button";
    card.className = "scene";
    card.dataset.scene = scene.id;
    card.setAttribute("aria-label", `${scene.number}. ${scene.title}`);
    card.setAttribute(
      "aria-description",
      [scene.question, scene.idea, scene.result, scene.before].join(" "),
    );
    card.style.cssText = `left:${scene.x}px;top:${scene.y}px;width:${scene.width}px;height:${scene.height}px`;
    const image = document.createElement("img");
    image.src = scene.image;
    image.alt = scene.title;
    image.draggable = false;
    card.append(image);
    card.addEventListener("click", (event) => {
      if (!dragged) focus(scene.number - 1);
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
      (available.height - pad * 2 - (overview ? 0 : 58)) / rect.height,
    );
    const targetX =
      (available.width - rect.width * targetScale) / 2 - rect.x * targetScale;
    const targetY =
      (available.height - (overview ? 0 : 58) - rect.height * targetScale) / 2 -
      rect.y * targetScale;
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
  function closeSources() {
    sourceBox.hidden = true;
    sourceToggle.setAttribute("aria-expanded", "false");
  }
  function focus(next, animate = true) {
    const previous = data.scenes[index];
    entries
      .get(previous.id)
      ?.card.querySelector("img")
      .setAttribute("src", previous.image);
    explaining = false;
    document.getElementById("explain").textContent = "Пояснение";
    document.getElementById("explain").setAttribute("aria-pressed", "false");
    closeBranches();
    index = Math.max(0, Math.min(data.scenes.length - 1, next));
    overview = false;
    document.body.classList.remove("overview");
    const scene = data.scenes[index];
    for (const [id, entry] of entries) {
      entry.card.classList.toggle("active", id === scene.id);
      entry.card.setAttribute("aria-current", String(id === scene.id));
    }
    document.getElementById("scene-title").textContent = scene.title;
    const parent = scene.parent ? data.scenes[byId.get(scene.parent)] : null;
    const list = route(),
      position = list.indexOf(index);
    document.getElementById("chapter-label").textContent =
      depthNames[scene.level] +
      " · " +
      data.chapters.find((c) => c.id === scene.chapter).title +
      (parent ? " / " + parent.title : "");
    document.getElementById("scene-number").textContent = String(
      position + 1,
    ).padStart(2, "0");
    document.getElementById("route-total").textContent = String(list.length);
    document.getElementById("previous").disabled = position === 0;
    document.getElementById("next").disabled = position === list.length - 1;
    document.getElementById("up").disabled = !scene.parent;
    document.getElementById("deeper").disabled = !children().length;
    for (const button of document.querySelectorAll("[data-chapter]"))
      button.setAttribute(
        "aria-current",
        String(button.dataset.chapter === scene.chapter),
      );
    history.replaceState(null, "", "#" + scene.id);
    closeSources();
    fit(scene, animate);
  }
  function showOverview(animate = true) {
    overview = true;
    document.body.classList.add("overview");
    closeSources();
    closeBranches();
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
  document.getElementById("previous").addEventListener("click", () => move(-1));
  document.getElementById("next").addEventListener("click", () => move(1));
  document
    .getElementById("overview")
    .addEventListener("click", () =>
      overview ? focus(index) : showOverview(),
    );
  document.getElementById("zoom-in").addEventListener("click", () => zoom(1.3));
  document
    .getElementById("zoom-out")
    .addEventListener("click", () => zoom(1 / 1.3));
  document.getElementById("up").addEventListener("click", () => {
    const parent = data.scenes[index].parent;
    if (parent) focus(byId.get(parent));
  });
  document.getElementById("deeper").addEventListener("click", showBranches);
  document
    .getElementById("basics-route")
    .addEventListener("click", () =>
      focus(
        byId.get(
          data.basics.find(
            (id) =>
              data.scenes[byId.get(id)].chapter === data.scenes[index].chapter,
          ),
        ),
      ),
    );
  document.getElementById("explain").addEventListener("click", () => {
    explaining = !explaining;
    const scene = data.scenes[index];
    entries.get(scene.id).card.querySelector("img").src = explaining
      ? scene.explanationImage
      : scene.image;
    document.getElementById("explain").textContent = explaining
      ? "Показать схему"
      : "Пояснение";
    document
      .getElementById("explain")
      .setAttribute("aria-pressed", String(explaining));
    fit(scene, false);
  });
  document.getElementById("fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  sourceToggle.addEventListener("click", () => {
    const open = sourceBox.hidden;
    closeSources();
    if (!open) return;
    sourceBox.replaceChildren();
    const intro = document.createElement("p");
    intro.textContent =
      "Первоисточники и исторические свидетельства этой сцены";
    sourceBox.append(intro);
    for (const source of data.scenes[index].sources) {
      const a = document.createElement("a");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = source.label + " ↗";
      sourceBox.append(a);
    }
    sourceBox.hidden = false;
    sourceToggle.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input,textarea,select,#branches")) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      showBranches();
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
      closeSources();
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
