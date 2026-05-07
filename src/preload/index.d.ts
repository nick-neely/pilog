import { ElectronAPI } from '@electron-toolkit/preload'
import type { PilogApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    pilog: PilogApi
  }
}
