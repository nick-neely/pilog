export const MAIN_WINDOW_CHROME_HEIGHT_PX = 48
export const MAIN_WINDOW_CONTROL_REGION_WIDTH_PX = 144
export const MAIN_WINDOW_CONTROL_REGION_INSET = `${MAIN_WINDOW_CONTROL_REGION_WIDTH_PX}px`

export const MAIN_WINDOW_TITLE_BAR_OVERLAY = {
  // Keep the native control strip transparent so renderer scrims can visually
  // cover the whole top chrome in Windows-style titlebarOverlay mode.
  color: '#00000000',
  symbolColor: '#38322b',
  height: MAIN_WINDOW_CHROME_HEIGHT_PX
} as const

export const ELECTRON_DRAG_REGION_CLASS = 'electron-window-drag-region'
export const ELECTRON_NO_DRAG_REGION_CLASS = 'electron-window-no-drag-region'

export const MODAL_CHROME_SCRIM_CLASS =
  'fixed inset-0 z-50 bg-foreground/40 duration-100 dark:bg-background/70'
