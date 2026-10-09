/// <reference types="vite/client" />

// Global window.electron type declaration
import type { ElectronAPI } from '../../electron/preload'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

interface ImportMetaEnv {
  readonly GEMINI_API_KEY?: string
  readonly VITE_GEMINI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
