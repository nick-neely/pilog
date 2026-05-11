import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { HOTKEY_CONFLICT_BEHAVIOR } from './pilog-hotkeys'
import type { ReactNode } from 'react'

export function PilogHotkeysProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <HotkeysProvider
      defaultOptions={{
        hotkey: {
          conflictBehavior: HOTKEY_CONFLICT_BEHAVIOR,
          ignoreInputs: true,
          preventDefault: true,
          stopPropagation: true
        },
        hotkeySequence: {
          conflictBehavior: HOTKEY_CONFLICT_BEHAVIOR,
          ignoreInputs: true,
          preventDefault: true,
          stopPropagation: true,
          timeout: 1500
        }
      }}
    >
      {children}
    </HotkeysProvider>
  )
}
