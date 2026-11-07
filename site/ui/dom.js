import { primitiveAttributes } from './variants.js';
// Stateless primitives share exactly the attributes/classes used by the React
// components. Preserve the element itself: the player owns its native listeners,
// disabled state, focus, draft values and references.
export function uiElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  applyPrimitive(element);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function applyPrimitive(element) {
  const attrs = primitiveAttributes(element.localName);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') element.classList.add(...value.split(/\s+/).filter(Boolean));
    else element.setAttribute(name, value);
  }
  return element;
}
