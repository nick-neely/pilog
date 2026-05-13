import { describe, expect, it } from 'vitest'

import {
  ELECTRON_DRAG_REGION_CLASS,
  ELECTRON_NO_DRAG_REGION_CLASS,
  MAIN_WINDOW_CHROME_HEIGHT_PX,
  MAIN_WINDOW_CONTROL_REGION_INSET,
  MAIN_WINDOW_CONTROL_REGION_WIDTH_PX,
  MAIN_WINDOW_TITLE_BAR_OVERLAY,
  MODAL_CHROME_SCRIM_CLASS
} from './window-chrome'

describe('window chrome contract', () => {
  it('keeps Windows-style custom titlebar dimensions aligned with renderer chrome', () => {
    expect(MAIN_WINDOW_CHROME_HEIGHT_PX).toBe(48)
    expect(MAIN_WINDOW_CONTROL_REGION_WIDTH_PX).toBe(144)
    expect(MAIN_WINDOW_CONTROL_REGION_INSET).toBe(`${MAIN_WINDOW_CONTROL_REGION_WIDTH_PX}px`)
    expect(MAIN_WINDOW_TITLE_BAR_OVERLAY).toEqual({
      color: '#00000000',
      symbolColor: '#38322b',
      height: MAIN_WINDOW_CHROME_HEIGHT_PX
    })
  })

  it('names drag and no-drag regions explicitly for Electron hit testing', () => {
    expect(ELECTRON_DRAG_REGION_CLASS).toContain('app-region:drag')
    expect(ELECTRON_NO_DRAG_REGION_CLASS).toContain('app-region:no-drag')
  })

  it('uses a full-surface tonal scrim for modal overlays', () => {
    expect(MODAL_CHROME_SCRIM_CLASS).toContain('fixed')
    expect(MODAL_CHROME_SCRIM_CLASS).toContain('inset-0')
    expect(MODAL_CHROME_SCRIM_CLASS).toContain('bg-foreground/40')
    expect(MODAL_CHROME_SCRIM_CLASS).toContain('dark:bg-background/70')
    expect(MODAL_CHROME_SCRIM_CLASS).not.toContain('backdrop')
  })
})
