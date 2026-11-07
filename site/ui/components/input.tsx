import * as React from 'react'
import { cn } from '@/ui/lib/utils'
import { inputClass } from '../variants.js'
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />
}
export { Input }
