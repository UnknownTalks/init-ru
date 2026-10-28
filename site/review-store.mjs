import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const string = (value, max, name, required = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new ReviewError(400, `Invalid ${name}`);
  return value;
};
function anchor(input) {
  if (!input || !["text", "element", "page"].includes(input.kind))
    throw new ReviewError(400, "Invalid anchor");
  const result = { kind: input.kind };
  for (const field of [
    "page",
    "title",
    "hash",
    "selector",
    "elementId",
    "tag",
    "label",
    "chapterId",
    "chapterTitle",
    "threadId",
    "quizId",
    "speaker",
    "blockText",
  ]) {
    if (input[field] !== undefined)
      result[field] = string(
        input[field],
        field === "blockText" ? 12000 : 2000,
        field,
      );
  }
  if (!result.page?.startsWith("/init-ru/") || result.page.includes("\0"))
    throw new ReviewError(400, "Invalid page");
  if (input.quote) {
    result.quote = {};
    for (const field of ["exact", "prefix", "suffix"])
      result.quote[field] = string(
        input.quote[field] || "",
        field === "exact" ? 8000 : 300,
        field,
      );
    if (!result.quote.exact) throw new ReviewError(400, "Empty text quote");
  }
  if (input.kind === "text" && !result.quote)
    throw new ReviewError(400, "Missing text quote");
  return result;
}
function context(input = {}) {
  const result = {};
  for (const field of ["sourceRevision", "pageVersion", "url", "userAgent"])
    if (input[field] !== undefined)
      result[field] = string(input[field], 3000, field);
  if (input.viewport) {
    result.viewport = {};
    for (const field of [
      "width",
      "height",
      "pixelRatio",
      "scrollX",
      "scrollY",
    ]) {
      const value = input.viewport[field];
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) < 1e8
      )
        result.viewport[field] = value;
    }
  }
  // Only this app's reproduction state; no cookies or unrelated browser storage.
  if (input.lesson && typeof input.lesson === "object") {
    const data = JSON.stringify(input.lesson);
    if (data.length > 24000)
      throw new ReviewError(400, "Lesson context too large");
    result.lesson = JSON.parse(data);
  }
  return result;
}
export class ReviewStore {
  constructor(file) {
    this.file = path.resolve(file);
    this.queue = Promise.resolve();
  }
  async load() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (value.schemaVersion !== 1 || !Array.isArray(value.comments))
        throw new Error("Unsupported review file");
      return value;
    } catch (error) {
      if (error.code === "ENOENT")
        return {
          schemaVersion: 1,
          project: "UnknownTalks/init-ru",
          updatedAt: null,
          comments: [],
        };
      throw error; // Never overwrite a damaged review file with an empty one.
    }
  }
  async write(value) {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = this.file + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temp, this.file);
  }
  async initialize() {
    return this.mutate(() => null);
  }
  async read() {
    await this.queue;
    return this.load();
  }
  mutate(action) {
    const operation = this.queue.then(async () => {
      const value = await this.load();
      const result = action(value);
      value.updatedAt = new Date().toISOString();
      await this.write(value);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  create(input) {
    const clientId = string(input.clientId, 100, "request identifier", true);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(clientId))
      throw new ReviewError(400, "Invalid request identifier");
    const body = string(input.body, 20000, "comment", true).trim();
    if (!["content", "explanation", "ui", "other"].includes(input.category))
      throw new ReviewError(400, "Invalid category");
    const location = anchor(input.anchor),
      environment = context(input.context);
    return this.mutate((value) => {
      const previous = value.comments.find(
        (item) => item.clientId === clientId,
      );
      if (previous) {
        if (previous.body !== body || previous.category !== input.category)
          throw new ReviewError(
            409,
            `Этот черновик уже сохранён как ${previous.id}. Обновите список; текущий текст оставлен в черновике.`,
          );
        return previous; // Retrying after a lost response cannot duplicate a comment.
      }
      const sequence =
        Math.max(
          0,
          ...value.comments.map((item) => Number(item.id.slice(1)) || 0),
        ) + 1;
      const now = new Date().toISOString();
      const comment = {
        id: "R" + String(sequence).padStart(4, "0"),
        clientId,
        status: "open",
        category: input.category,
        body,
        anchor: location,
        context: environment,
        createdAt: now,
        updatedAt: now,
        resolution: null,
      };
      value.comments.push(comment);
      return comment;
    });
  }
  update(id, input) {
    if (!/^R\d{4,}$/.test(id)) throw new ReviewError(404, "Comment not found");
    if (input.body !== undefined) string(input.body, 20000, "comment", true);
    if (
      input.status !== undefined &&
      !["open", "resolved"].includes(input.status)
    )
      throw new ReviewError(400, "Invalid status");
    if (input.resolution !== undefined && input.resolution !== null)
      string(input.resolution, 12000, "resolution");
    if (
      input.category !== undefined &&
      !["content", "explanation", "ui", "other"].includes(input.category)
    )
      throw new ReviewError(400, "Invalid category");
    return this.mutate((value) => {
      const comment = value.comments.find((item) => item.id === id);
      if (!comment) throw new ReviewError(404, "Comment not found");
      if (input.baseUpdatedAt && input.baseUpdatedAt !== comment.updatedAt)
        throw new ReviewError(
          409,
          "Комментарий уже изменён. Обновите список перед редактированием.",
        );
      if (input.body !== undefined) comment.body = input.body.trim();
      if (input.category !== undefined) comment.category = input.category;
      if (input.status !== undefined) comment.status = input.status;
      if (input.resolution !== undefined) comment.resolution = input.resolution;
      comment.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(comment.updatedAt) + 1),
      ).toISOString();
      if (input.status === "resolved") comment.resolvedAt = comment.updatedAt;
      if (input.status === "open") {
        delete comment.resolvedAt;
        comment.resolution = null;
      }
      return comment;
    });
  }
}
export function reviewMarkdown(value) {
  const lines = [
    "# UnknownTalks — локальные замечания",
    "",
    `Открыто: ${value.comments.filter((c) => c.status === "open").length}. Всего: ${value.comments.length}.`,
    "",
    "Следующая итерация выполняется только по запросу автора. Сначала читать открытые замечания; отмечать выполненными только после изменения и проверки. Сохранять нерешённые и старые замечания. Не публиковать этот файл или данные замечаний.",
    "",
  ];
  for (const c of value.comments) {
    lines.push(
      `## ${c.id} · ${c.status === "open" ? "Открыто" : "Готово"} · ${c.category}`,
      "",
      c.body,
      "",
      `Страница: ${c.anchor.page}${c.anchor.hash || ""}`,
      `Место: ${c.anchor.chapterTitle || c.anchor.label || c.anchor.title}`,
      `Элемент: ${c.anchor.elementId || c.anchor.selector || "страница"}`,
    );
    if (c.anchor.quote)
      lines.push(
        "",
        "Цитата:",
        ...c.anchor.quote.exact.split("\n").map((line) => "> " + line),
      );
    if (c.anchor.blockText)
      lines.push("", "Контекст блока:", c.anchor.blockText);
    lines.push(
      "",
      `Версия: ${c.context.sourceRevision || "unknown"}; страница ${c.context.pageVersion || "unknown"}`,
      `Окно: ${c.context.viewport?.width || "?"} × ${c.context.viewport?.height || "?"}`,
      `Создано: ${c.createdAt}`,
    );
    if (c.resolution) lines.push("", "Результат: " + c.resolution);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
