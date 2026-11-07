import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './components/button'
import { Input } from './components/input'
import { Textarea } from './components/textarea'
import { NativeSelect } from './components/native-select'
// Statically render the same shadcn components used by the player factories.
// No hydration/runtime is needed for these native, stateless primitives.
export function componentAttributes(): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries({
    button: <Button />, input: <Input />, textarea: <Textarea />, select: <NativeSelect />,
  }).map(([tag, component]) => {
    const opening = renderToStaticMarkup(component).split('>')[0]
    return [tag, Object.fromEntries([...opening.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]))]
  }))
}
