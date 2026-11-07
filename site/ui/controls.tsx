import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/select'
import { RadioGroup, RadioGroupItem } from './components/radio-group'
import { Checkbox } from './components/checkbox'
import { Separator } from './components/separator'

// The original native fields remain the form/state boundary. React owns only the
// interactive control, so existing event handlers, drafts and storage stay intact.
type Control = { host: HTMLElement, source: HTMLElement, root: Root, refresh: () => void, dispose?: () => void, connected: boolean }
const controls = new Map<HTMLElement, Control>()
let cleanup: MutationObserver | undefined
let serial = 0
function register(source: HTMLElement, host: HTMLElement, render: () => React.ReactNode, dispose?: () => void) {
  const root = createRoot(host)
  const refresh = () => flushSync(() => root.render(render()))
  const control = { source, host, root, refresh, dispose, connected: host.isConnected }
  controls.set(source, control)
  refresh()
  cleanup ||= new MutationObserver(() => {
    for (const [source, control] of controls) {
      if (control.host.isConnected) control.connected = true
      else if (control.connected) {
        control.dispose?.(); control.root.unmount(); controls.delete(source)
      }
    }
  })
  cleanup.observe(document.body, { childList: true, subtree: true })
  return control
}
function notify(input: HTMLInputElement | HTMLSelectElement) {
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
function mountSelect(select: HTMLSelectElement) {
  if (controls.has(select)) return
  const host = document.createElement('div'); host.className = 'choice-select'
  if (select.dataset.uiSize) host.dataset.size = select.dataset.uiSize
  select.before(host); select.hidden = true; select.tabIndex = -1
  const label = select.labels?.[0]
  const id = select.id || 'ui-select-' + ++serial
  select.id = id
  if (label) { label.id ||= id + '--label'; label.htmlFor = id + '--trigger' }
  const empty = '__unknowntalks_empty__'
  const name = () => select.getAttribute('aria-label') || label?.textContent || 'Выберите вариант'
  const control = register(select, host, () => (
    <Select value={select.value || empty} disabled={select.disabled} onValueChange={value => {
      select.value = value === empty ? '' : value; notify(select); controls.get(select)?.refresh()
    }}>
      <SelectTrigger id={id + '--trigger'} className="choice-trigger" aria-label={name()} aria-labelledby={label?.id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" sideOffset={6} className="choice-list" aria-label={name()}>
        {[...select.options].map((option, index) => <SelectItem key={index} value={option.value || empty}
          disabled={option.disabled} className="choice-option">{option.textContent}</SelectItem>)}
      </SelectContent>
    </Select>
  ), () => { observer.disconnect(); select.removeEventListener('change', refresh) })
  const refresh = () => control.refresh()
  const observer = new MutationObserver(refresh)
  observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected'] })
  select.addEventListener('change', refresh)
}
function mountRadios(container: HTMLElement) {
  if (controls.has(container)) return
  const inputs = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"][name]')]
  if (!inputs.length) return
  const labels = inputs.map(input => input.closest('label')!)
  if (labels.some(label => !label)) return
  const copies = labels.map(label => {
    const copy = label.cloneNode(true) as HTMLLabelElement
    copy.querySelector('input')?.remove()
    return { className: label.className, html: copy.innerHTML }
  })
  const source = document.createElement('span'); source.hidden = true; source.dataset.uiSources = ''
  const host = document.createElement('div'); host.className = 'ui-radio-host'
  // Keep native fields first, including their names and original listeners. The
  // player's input:checked lookup must never read Radix's unnamed form proxy.
  for (const input of inputs) { source.append(input); input.tabIndex = -1 }
  const separators = container.classList.contains('reply-fieldset')
  labels.forEach(label => label.remove())
  container.querySelectorAll('.reply-separator').forEach(node => node.remove())
  container.append(source, host)
  const refresh = () => controls.get(container)?.refresh()
  const control = register(container, host, () => (
    <RadioGroup className="ui-radio-group" value={inputs.find(input => input.checked)?.value || ''}
      aria-label={container.closest('fieldset')?.querySelector('legend')?.textContent || container.querySelector('legend')?.textContent || undefined}
      onValueChange={value => {
        for (const input of inputs) input.checked = input.value === value
        const selected = inputs.find(input => input.checked)!
        notify(selected); refresh()
      }} onKeyDown={event => {
        if (event.key === 'Enter' && container.classList.contains('reply-fieldset')) {
          event.preventDefault(); container.closest('form')?.requestSubmit()
        }
      }}>
      {inputs.map((input, index) => <React.Fragment key={input.value}>
        {separators && index > 0 && <Separator asChild decorative={false} className="ui-reply-separator" aria-label="или">
          <div className="reply-separator">ИЛИ</div>
        </Separator>}
        <label className={copies[index].className}>
          <RadioGroupItem value={input.value} className="ui-radio" disabled={input.disabled}
            aria-label={input.getAttribute('aria-label') || labels[index].textContent || undefined} />
          <span className="ui-radio-copy" dangerouslySetInnerHTML={{ __html: copies[index].html }} />
        </label>
      </React.Fragment>)}
    </RadioGroup>
  ), () => inputs.forEach(input => input.removeEventListener('change', refresh)))
  inputs.forEach(input => input.addEventListener('change', refresh))
  return control
}
function mountCheckbox(input: HTMLInputElement) {
  if (controls.has(input)) return
  const host = document.createElement('span'); host.className = 'ui-checkbox-host'
  input.after(host); input.hidden = true; input.tabIndex = -1
  const refresh = () => controls.get(input)?.refresh()
  register(input, host, () => <Checkbox className="ui-checkbox" checked={input.checked} disabled={input.disabled}
    aria-label={input.getAttribute('aria-label') || input.closest('label')?.textContent || undefined}
    onCheckedChange={checked => { input.checked = checked === true; notify(input); refresh() }} />,
    () => input.removeEventListener('change', refresh))
  input.addEventListener('change', refresh)
}
export function enhanceControls(root: ParentNode = document) {
  root.querySelectorAll<HTMLSelectElement>('select').forEach(mountSelect)
  root.querySelectorAll<HTMLElement>('.reading-options, .reply-fieldset').forEach(mountRadios)
  root.querySelectorAll<HTMLInputElement>('.exercise-check input[type="checkbox"]').forEach(mountCheckbox)
}
export function refreshControls(root: ParentNode = document) {
  for (const control of controls.values()) if (root === document || root === control.source || root.contains(control.source)) control.refresh()
}
