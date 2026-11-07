import * as React from 'react'
import { cn } from '@/ui/lib/utils'
// shadcn Native Select keeps the browser's existing picker and arrow here.
// Removing the decorative wrapper preserves the settings' inline layout.
function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn('ui-native-select', className)} {...props} />
}
export { NativeSelect }
