import { Input } from '@renderer/components/ui/input'
import {
  acceleratorFromKeyEvent,
  getShortcutDisplayPlatform,
  type ShortcutDisplayPlatform
} from '@shared/shortcuts'
import type { ComponentProps } from 'react'

type HotkeyInputProps = Omit<ComponentProps<typeof Input>, 'onChange'> & {
  onHotkeyChange: (value: string) => void
  platform?: ShortcutDisplayPlatform
}

export function HotkeyInput({
  onHotkeyChange,
  platform = getShortcutDisplayPlatform(window.navigator.platform),
  onKeyDown,
  onFocus,
  ...props
}: HotkeyInputProps): React.JSX.Element {
  return (
    <Input
      {...props}
      readOnly
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return

        const accelerator = acceleratorFromKeyEvent(event, platform)
        if (accelerator === null) return

        event.preventDefault()
        onHotkeyChange(accelerator)
      }}
    />
  )
}
