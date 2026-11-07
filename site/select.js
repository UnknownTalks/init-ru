// Shared shadcn control runtime. Imported lazily so Node's content/check modules
// never need a browser or a JSX loader. The production bundler includes it locally.
let runtime;
export function enhanceSelects(root = document) {
  runtime ||= import('./ui/controls.tsx');
  return runtime.then(ui => ui.enhanceControls(root));
}
export function refreshControls(root = document) {
  return runtime?.then(ui => ui.refreshControls(root));
}
