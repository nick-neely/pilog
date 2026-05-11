import { describe, expect, it } from 'vitest'
import { getListNavigationIndex, shouldHandleListNavigationShortcut } from './list-navigation'

describe('list navigation shortcuts', () => {
  it('moves within list boundaries', () => {
    expect(getListNavigationIndex({ currentIndex: -1, itemCount: 3, direction: 'next' })).toBe(0)
    expect(getListNavigationIndex({ currentIndex: -1, itemCount: 3, direction: 'previous' })).toBe(
      2
    )
    expect(getListNavigationIndex({ currentIndex: 1, itemCount: 3, direction: 'next' })).toBe(2)
    expect(getListNavigationIndex({ currentIndex: 1, itemCount: 3, direction: 'previous' })).toBe(0)
    expect(getListNavigationIndex({ currentIndex: 2, itemCount: 3, direction: 'next' })).toBe(2)
    expect(getListNavigationIndex({ currentIndex: 0, itemCount: 3, direction: 'previous' })).toBe(0)
    expect(getListNavigationIndex({ currentIndex: -1, itemCount: 0, direction: 'next' })).toBe(-1)
  })

  it('suppresses list movement inside editable and transient keyboard-owning UI', () => {
    const OriginalHTMLElement = globalThis.HTMLElement
    const originalDocument = globalThis.document

    class FakeHTMLElement extends EventTarget {
      constructor(private readonly editable: boolean) {
        super()
      }

      closest(): FakeHTMLElement | null {
        return this.editable ? this : null
      }
    }

    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: FakeHTMLElement
    })

    const textarea = new FakeHTMLElement(true)
    const event = new Event('keydown') as KeyboardEvent
    Object.defineProperty(event, 'target', { value: textarea })

    const bodyEvent = new Event('keydown') as KeyboardEvent
    Object.defineProperty(bodyEvent, 'target', { value: new FakeHTMLElement(false) })

    try {
      expect(shouldHandleListNavigationShortcut(event)).toBe(false)

      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { querySelector: () => ({}) }
      })
      expect(shouldHandleListNavigationShortcut(bodyEvent)).toBe(false)

      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { querySelector: () => null }
      })
      expect(shouldHandleListNavigationShortcut(bodyEvent)).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: OriginalHTMLElement
      })
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument
      })
    }
  })
})
