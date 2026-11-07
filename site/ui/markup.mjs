import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Only authored control opening tags are changed. JSON lesson payloads and all
// educational text stay byte-for-byte intact, including both reading variants.
export async function decorateControls(html, root) {
  const { componentAttributes } = await import(pathToFileURL(path.join(root, '.cache/ui/render.mjs')));
  const primitives = componentAttributes();
  return html.replace(/<(button|input|textarea|select)\b([^>]*?)>/g, (opening, tag, attributes) => {
    const attrs = { ...primitives[tag] };
    const classes = attrs.class; delete attrs.class;
    let result = attributes.replace(/\sclass="([^"]*)"/, (_, current) => ` class="${current} ${classes}"`);
    if (result === attributes) result += ` class="${classes}"`;
    for (const [name, value] of Object.entries(attrs)) if (!result.includes(name + '=')) result += ` ${name}="${value}"`;
    return `<${tag}${result}>`;
  });
}
