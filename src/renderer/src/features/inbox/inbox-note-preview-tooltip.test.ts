import { describe, expect, it } from 'vitest'
import { INBOX_NOTE_PREVIEW_TOOLTIP_CLASS } from './Inbox'

describe('inbox note preview tooltip', () => {
  it('constrains long multi-line note previews without native title fallback', () => {
    const className = INBOX_NOTE_PREVIEW_TOOLTIP_CLASS

    expect(className).toContain('max-w-[min(34rem,calc(100vw-2rem))]')
    expect(className).toContain('max-h-64')
    expect(className).toContain('overflow-y-auto')
    expect(className).toContain('whitespace-pre-wrap')
    expect(className).toContain('break-words')
    expect(className).toContain('text-left')
  })
})
