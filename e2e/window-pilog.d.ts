import type { PilogApi } from '../src/preload/index'

declare global {
  interface Window {
    pilog: PilogApi
  }
}

export {}
