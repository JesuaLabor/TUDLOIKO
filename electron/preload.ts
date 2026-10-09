import { contextBridge, ipcRenderer } from 'electron'

// ─── Type-safe IPC API exposed to the renderer ───────────────────────────────
const electronAPI = {
  // Window controls
  toggleClickThrough: (): Promise<boolean> => ipcRenderer.invoke('toggle-click-through'),
  getClickThrough: (): Promise<boolean> => ipcRenderer.invoke('get-click-through'),
  setOpacity: (value: number): Promise<void> => ipcRenderer.invoke('set-opacity', value),
  getOpacity: (): Promise<number> => ipcRenderer.invoke('get-opacity'),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('minimize-window'),
  closeApp: (): Promise<void> => ipcRenderer.invoke('close-app'),
  getEnvApiKey: (): Promise<string> => ipcRenderer.invoke('get-env-api-key'),

  // Audio device listing (calls back into renderer via navigator.mediaDevices)
  // Note: device enumeration happens in the renderer — this is just a marker
  // for the type declaration so components can check for Electron context
  isElectron: true as const,
}

contextBridge.exposeInMainWorld('electron', electronAPI)

// ─── TypeScript declaration (used by renderer) ────────────────────────────────
export type ElectronAPI = typeof electronAPI
