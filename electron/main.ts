import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  nativeTheme,
  session,
} from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config({ path: join(__dirname, '../../.env') })

// ─── Persistent store for window bounds & settings ───────────────────────────
interface StoreSchema {
  windowBounds: { x: number; y: number; width: number; height: number }
  opacity: number
  clickThrough: boolean
}

const store = new Store<StoreSchema>({
  defaults: {
    windowBounds: { x: 100, y: 100, width: 420, height: 640 },
    opacity: 0.92,
    clickThrough: false,
  },
})

// ─── Globals ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let isClickThrough = false
let isVisible = true

// ─── Window factory ───────────────────────────────────────────────────────────
function createWindow(): void {
  nativeTheme.themeSource = 'dark'

  const bounds = store.get('windowBounds')
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: sw, height: sh } = primaryDisplay.workAreaSize

  // Clamp to screen
  const x = Math.min(Math.max(bounds.x, 0), sw - bounds.width)
  const y = Math.min(Math.max(bounds.y, 0), sh - bounds.height)

  mainWindow = new BrowserWindow({
    x,
    y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 300,
    minHeight: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Keep above fullscreen windows (level: 'screen-saver' is the highest)
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Load UI
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Persist bounds on close
  mainWindow.on('close', () => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    store.set('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // ── Auto-grant microphone permission (needed for getUserMedia audio capture) ──
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed: string[] = ['media', 'microphone', 'audioCapture']
    callback(allowed.includes(permission))
  })

  // Toggle overlay visibility
  const toggleShortcut = process.platform === 'darwin' ? 'Command+Shift+H' : 'Ctrl+Shift+H'
  globalShortcut.register(toggleShortcut, () => {
    if (!mainWindow) return
    if (isVisible) {
      mainWindow.hide()
      isVisible = false
    } else {
      mainWindow.show()
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
      isVisible = true
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Toggle click-through mode
ipcMain.handle('toggle-click-through', () => {
  if (!mainWindow) return
  isClickThrough = !isClickThrough
  mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true })
  return isClickThrough
})

// Get click-through state
ipcMain.handle('get-click-through', () => isClickThrough)

// Set window opacity
ipcMain.handle('set-opacity', (_event, value: number) => {
  if (!mainWindow) return
  const clamped = Math.max(0.1, Math.min(1.0, value))
  mainWindow.setOpacity(clamped)
  store.set('opacity', clamped)
})

// Get stored opacity
ipcMain.handle('get-opacity', () => store.get('opacity'))

// Minimize / restore
ipcMain.handle('minimize-window', () => {
  mainWindow?.minimize()
})

// Close app
ipcMain.handle('close-app', () => {
  app.quit()
})

// Get API Key from .env
ipcMain.handle('get-env-api-key', () => {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''
})
