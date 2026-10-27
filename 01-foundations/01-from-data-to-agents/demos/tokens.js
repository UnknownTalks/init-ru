/* All input stays in this browser. This is a tokenizer, not an LLM call. */
(() => {
  const input = document.getElementById("input"),
    output = document.getElementById("tokens"),
    error = document.getElementById("error");
  const colors = [
    "#bda8e8",
    "#7dcbb6",
    "#e0b676",
    "#8fb8e3",
    "#d99caf",
    "#a7c581",
  ];
  let tokenizer;
  try {
    const data = globalThis.UnknownTalksTokenizerData;
    tokenizer = new HuggingFaceTokenizers.Tokenizer(
      data.tokenizer,
      data.config,
    );
  } catch (cause) {
    error.hidden = false;
    error.textContent =
      "Не загрузился токенизатор. Откройте страницу вместе с её файлами.";
    input.disabled = true;
    return;
  }
  function render() {
    try {
      const result = tokenizer.encode(input.value, {
        add_special_tokens: false,
      });
      output.replaceChildren();
      for (const [index, id] of result.ids.entries()) {
        const piece = document.createElement("span");
        piece.className = "piece";
        piece.style.setProperty("--color", colors[index % colors.length]);
        piece.textContent = tokenizer
          .decode([id], { skip_special_tokens: false })
          .replaceAll(" ", "␠")
          .replaceAll("\n", "↵");
        output.append(piece);
      }
      document.getElementById("reconstructed").textContent = tokenizer.decode(
        result.ids,
        { skip_special_tokens: false },
      );
      error.hidden = true;
    } catch (cause) {
      error.hidden = false;
      error.textContent = "Не удалось разобрать текст: " + cause.message;
    }
  }
  input.addEventListener("input", render);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-text]");
    if (button) {
      input.value = button.dataset.text;
      render();
    }
  });
  render();
})();
