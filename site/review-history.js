(() => {
  const $ = (id) => document.getElementById(id);
  let comments = [];
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  async function load() {
    try {
      const response = await fetch("/__review/api", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось прочитать историю.");
      comments = (await response.json()).comments;
      render();
    } catch (error) {
      $("status").textContent = error.message;
    }
  }
  function render() {
    $("items").replaceChildren();
    const items = comments
      .filter((c) => c.status === $("filter").value)
      .toReversed();
    if (!items.length)
      $("items").append(el("p", "Здесь пока нет правок.", "muted"));
    for (const c of items) {
      const article = el("article");
      article.id = c.id;
      article.append(
        el(
          "p",
          c.id + " · " + (c.status === "resolved" ? "Выполнено" : "Удалено"),
          "muted small",
        ),
        el("h2", c.body),
      );
      if (c.resolution && c.status === "resolved")
        article.append(el("p", c.resolution, "result"));
      const detail = el("details");
      detail.append(el("summary", "Исходное место"));
      detail.append(el("p", c.anchor.chapterTitle || c.anchor.title, "muted"));
      const quote =
        c.anchor.quote?.exact || c.anchor.blockText || c.anchor.label;
      if (quote) detail.append(el("blockquote", quote));
      article.append(detail);
      const restore = el(
        "button",
        c.status === "resolved" ? "Открыть снова" : "Восстановить",
      );
      restore.addEventListener("click", async () => {
        restore.disabled = true;
        try {
          const response = await fetch("/__review/api/comments/" + c.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "open",
              baseUpdatedAt: c.updatedAt,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          $("status").textContent = "Правка возвращена в рабочий список.";
          await load();
        } catch (error) {
          $("status").textContent = error.message;
          restore.disabled = false;
        }
      });
      article.append(restore);
      $("items").append(article);
    }
  }
  $("filter").addEventListener("change", render);
  $("refresh").addEventListener("click", load);
  load().then(() => {
    const id = new URL(location.href).searchParams.get("comment"),
      comment = comments.find((c) => c.id === id);
    if (comment && ["resolved", "deleted"].includes(comment.status)) {
      $("filter").value = comment.status;
      render();
      document.getElementById(id)?.scrollIntoView({ block: "center" });
    }
  });
})();
