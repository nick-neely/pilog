import { describe, it, expect } from 'vitest'
import { shouldSave } from '@shared/scratchpad'

describe('shouldSave', () => {
  it('returns true when buffer has content and has changed', () => {
    expect(shouldSave('fix the spacing bug', true)).toBe(true)
  })

  it('returns false when buffer is empty', () => {
    expect(shouldSave('', true)).toBe(false)
  })

  it('returns false when buffer is only whitespace', () => {
    expect(shouldSave('   \n\t  ', true)).toBe(false)
  })

  it('returns false when buffer has not changed since open', () => {
    expect(shouldSave('some content', false)).toBe(false)
  })

  it('returns false when buffer is empty and unchanged', () => {
    expect(shouldSave('', false)).toBe(false)
  })
})
