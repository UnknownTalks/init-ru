// Shared by shadcn's React primitives and the static player's DOM factories.
import { cva } from 'class-variance-authority';
export const buttonVariants = cva('ui-button', {
  variants: {
    variant: { default: '', ghost: 'ui-button-ghost', link: 'text-button', action: 'reply-send', knowledge: 'knowledge-card-action' },
    size: { default: '', icon: 'ui-button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export const inputClass = 'ui-input';
export const textareaClass = 'ui-textarea';
export const primitiveAttributes = tag => tag === 'button'
  ? { 'data-slot': 'button', 'data-variant': 'default', 'data-size': 'default', class: buttonVariants() }
  : tag === 'input' ? { 'data-slot': 'input', class: inputClass }
  : tag === 'textarea' ? { 'data-slot': 'textarea', class: textareaClass }
  : tag === 'select' ? { 'data-slot': 'native-select', class: 'ui-native-select' }
  : {};
