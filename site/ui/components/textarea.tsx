import * as React from 'react'
import { cn } from '@/ui/lib/utils'
import { textareaClass } from '../variants.js'
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(textareaClass, className)} {...props} />
}
export { Textarea }
