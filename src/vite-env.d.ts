/// <reference types="vite/client" />

import type { TosuGuiApi } from '../electron/preload'

declare global {
  interface Window {
    tosuGui: TosuGuiApi
  }
}