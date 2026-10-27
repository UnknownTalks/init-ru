/* UnknownTalks token demonstration. All text stays in this browser. */
(() => {
  const examples = [
    ["Русский", "Привет, мир!"],
    ["English", "Hello, world!"],
    ["Код", 'def greet(name):\n    return f"Привет, {name}!"'],
    ["Пробел", " привет  мир"],
    ["Emoji", "Агент 👩🏽‍💻 проверяет тесты ✅"],
  ];
  const input = document.getElementById("input");
  const output = document.getElementById("tokens");
  const error = document.getElementById("error");
  const buttons = document.getElementById("examples");
  const palette = [
    "#9a8bea",
    "#67bdaa",
    "#d3a46b",
    "#719fd9",
    "#d58daf",
    "#a7be72",
  ];
  let tokenizer;
  try {
    const data = globalThis.UnknownTalksTokenizerData;
    tokenizer = new HuggingFaceTokenizers.Tokenizer(
      data.tokenizer,
      data.config,
    );
    document.getElementById("status").textContent =
      "Готово · работает без сети · специальные токены не добавляются";
  } catch (cause) {
    error.hidden = false;
    error.textContent =
      "Не удалось загрузить токенизатор. Откройте страницу вместе с файлами tokenizers.js и qwen-tokenizer.js из той же папки.";
    document.getElementById("status").textContent = "Токенизатор недоступен";
    input.disabled = true;
    return;
  }
  const visible = (text) =>
    text
      .replaceAll(" ", "␠")
      .replaceAll("\n", "↵")
      .replaceAll("\t", "⇥")
      .replaceAll("\r", "␍");
  function render() {
    try {
      const encoded = tokenizer.encode(input.value, {
        add_special_tokens: false,
      });
      output.replaceChildren();
      encoded.ids.forEach((id, index) => {
        const chip = document.createElement("span");
        chip.className = "token";
        chip.style.setProperty("--chip", palette[index % palette.length]);
        chip.style.setProperty(
          "--chipbg",
          palette[index % palette.length] + "20",
        );
        const text = tokenizer.decode([id], { skip_special_tokens: false });
        chip.title = `ID ${id} · внутреннее обозначение: ${encoded.tokens[index]}`;
        const code = document.createElement("code");
        code.textContent = visible(text) || "∅";
        const label = document.createElement("small");
        label.textContent = `ID ${id}`;
        chip.append(code, label);
        output.append(chip);
      });
      document.getElementById("count").textContent = String(encoded.ids.length);
      document.getElementById("chars").textContent = String(
        Array.from(input.value).length,
      );
      document.getElementById("ids").textContent = JSON.stringify(encoded.ids);
      document.getElementById("raw").textContent = JSON.stringify(
        encoded.tokens,
        null,
        2,
      );
      for (const button of buttons.children)
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.text === input.value),
        );
      error.hidden = true;
    } catch (cause) {
      error.hidden = false;
      error.textContent = "Ошибка токенизации: " + cause.message;
    }
  }
  for (const [title, text] of examples) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = title;
    button.dataset.text = text;
    button.addEventListener("click", () => {
      input.value = text;
      render();
    });
    buttons.append(button);
  }
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  });
  // The source file is README.md; Quartz exposes the generated directory index.
  if (location.protocol === "file:")
    document.getElementById("back-link").setAttribute("href", "../README.md");
  render();
})();
