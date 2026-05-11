import { Kbd, KbdGroup } from '@pilog/ui/kbd'

type Shortcut = {
  keys: string[]
  verb: string
}

const shortcuts: Shortcut[] = [
  { keys: ['⌘/Ctrl', '⇧', 'Space'], verb: 'open the scratchpad' },
  { keys: ['⌘/Ctrl', '1'], verb: 'open Inbox' },
  { keys: ['⌘/Ctrl', '2'], verb: 'open Drafts' },
  { keys: ['G', 'D'], verb: 'generate drafts' },
  { keys: ['⌘/Ctrl', '↵'], verb: 'publish the draft you’re reading' },
  { keys: ['J', 'K'], verb: 'move through notes and drafts' },
  { keys: ['Esc'], verb: 'step back or clear context' }
]

/**
 * Keyboard-first row. PRODUCT.md commits the product to "Keyboard-first,
 * mouse-welcome"; the landing page makes that visible up-front. Single
 * horizontal flow on desktop, two-column wrap on small viewports — no card
 * grid, no decorative icons. Kbd + verb is the whole pattern.
 */
export function KeyboardFirst() {
  return (
    <section
      aria-labelledby="keyboard-title"
      className="border-border/60 border-t"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
          <header className="md:col-span-4">
            <p className="text-muted-foreground mb-3 font-mono text-xs">04 — keyboard-first</p>
            <h2
              id="keyboard-title"
              className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight md:text-4xl"
            >
              Every action has a key.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-[40ch] text-base leading-relaxed">
              The hotkey-driven scratchpad is the product&#8217;s defining gesture. The rest of
              the app honors it. The few you&#8217;ll learn first:
            </p>
          </header>

          <ul className="md:col-span-8 grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
            {shortcuts.map((s, i) => (
              <li
                key={s.verb}
                className="flex items-center gap-4 border-b border-dashed border-border/60 py-3"
              >
                <span className="text-muted-foreground tabular w-6 shrink-0 font-mono text-[0.7rem]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <KbdGroup className="shrink-0">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
                <span className="text-foreground/85 text-sm">{s.verb}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
