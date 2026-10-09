import { useState, useEffect } from 'react'
import { Sliders, Type, Mic, Info } from 'lucide-react'
import type { AppSettings } from '../App'
import { useElectronOpacity } from '../hooks/useStorage'
import { AudioCaptureManager } from '../lib/audioCapture'
import type { AudioDevice } from '../lib/audioCapture'
import { BackendClient } from '../lib/backend'
import type { BackendHealth } from '../lib/backend'

interface SettingsPanelProps {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
}

export default function SettingsPanel({ settings, updateSettings }: SettingsPanelProps) {
  const [opacity, setOpacity] = useElectronOpacity()
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [backendHealth, setBackendHealth] = useState<BackendHealth>({ status: 'offline' })

  useEffect(() => {
    BackendClient.checkHealth().then(setBackendHealth)
  }, [])

  const handleOpacityChange = (v: number) => {
    setOpacity(v)
    updateSettings({ opacity: v })
  }

  // Load audio devices
  const loadDevices = async () => {
    setLoadingDevices(true)
    try {
      const devices = await AudioCaptureManager.listDevices()
      setAudioDevices(devices)
    } catch {
      setAudioDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [])

  const CHUNK_OPTIONS = [
    { value: 2000, label: '2s (low latency)' },
    { value: 4000, label: '4s (balanced)' },
    { value: 6000, label: '6s (fewer API calls)' },
  ]

  const VAD_OPTIONS: { value: AppSettings['vadSensitivity']; label: string }[] = [
    { value: 'low',    label: 'Low (quiet rooms)' },
    { value: 'medium', label: 'Medium (default)' },
    { value: 'high',   label: 'High (noisy)' },
  ]

  return (
    <div className="no-drag flex-1 overflow-y-auto p-4 space-y-6">
      <div>
        <h2 className="text-text-primary text-sm font-semibold">Settings</h2>
        <p className="text-text-muted text-xs mt-0.5">Configure your AI Interview Copilot</p>
      </div>

      {/* ── Audio Device ─────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Mic size={11} className="text-accent/70" />
            <span className="section-label">Audio Input Device</span>
          </div>
          <button onClick={loadDevices} className="text-[10px] text-accent hover:underline">
            {loadingDevices ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <select
          value={settings.audioDeviceId || ''}
          onChange={(e) => updateSettings({ audioDeviceId: e.target.value })}
          className="glass-input text-[12px]"
        >
          <option value="">Default Microphone</option>
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.isMonitor ? '📻 ' : '🎙 '}{d.label}
            </option>
          ))}
        </select>

        {/* Linux tip */}
        <div className="flex gap-2 p-2.5 rounded-lg bg-gem-blue/8 border border-gem-blue/20">
          <Info size={12} className="text-gem-blue flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-gem-blue font-medium mb-0.5">Linux System Audio Tip</p>
            <p className="text-[10px] text-text-muted leading-relaxed">
              Select a <span className="text-text-secondary">📻 Monitor</span> source to capture system audio (e.g. the interviewer's voice from Zoom/Meet).
              If no monitor appears, open <code className="text-[10px] bg-white/5 px-1 rounded">pavucontrol</code> and check PulseAudio sources.
            </p>
          </div>
        </div>
      </section>

      {/* ── Chunk Interval ───────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-accent/70 text-[11px]">⏱</span>
          <span className="section-label">Recording Chunk Size</span>
        </div>
        <div className="flex gap-1.5">
          {CHUNK_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateSettings({ chunkIntervalMs: value })}
              className={`
                flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all duration-150
                ${settings.chunkIntervalMs === value
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-white/5 text-text-muted border-border hover:text-text-secondary'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-muted">Each chunk = one Gemini API call for STT + suggestions.</p>
      </section>

      {/* ── VAD Sensitivity ──────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-accent/70 text-[11px]">🔊</span>
          <span className="section-label">Silence Sensitivity</span>
        </div>
        <div className="flex gap-1.5">
          {VAD_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => updateSettings({ vadSensitivity: value })}
              className={`
                flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all duration-150
                ${settings.vadSensitivity === value
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-white/5 text-text-muted border-border hover:text-text-secondary'
                }
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Opacity ─────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders size={11} className="text-accent/70" />
            <span className="section-label">Overlay Opacity</span>
          </div>
          <span className="text-[11px] text-accent font-medium">{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={1.0}
          step={0.05}
          value={opacity}
          onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
          className="w-full accent-[#7C6BFF] cursor-pointer h-1 rounded-full"
        />
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Ghost (20%)</span>
          <span>Solid (100%)</span>
        </div>
      </section>

      {/* ── Font Size ────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Type size={11} className="text-accent/70" />
          <span className="section-label">Font Size</span>
        </div>
        <div className="flex gap-2">
          {(['sm', 'base', 'lg'] as const).map((size) => (
            <button
              key={size}
              onClick={() => updateSettings({ fontSize: size })}
              className={`
                flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150
                ${settings.fontSize === size
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-white/5 text-text-muted border-border hover:text-text-secondary hover:bg-white/10'
                }
              `}
            >
              {size === 'sm' ? 'Small' : size === 'base' ? 'Medium' : 'Large'}
            </button>
          ))}
        </div>
      </section>

      {/* ── Django Backend Status ──────────────────────────────────── */}
      <section className="space-y-2 p-3 rounded-xl bg-white/5 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-accent/70 text-[11px]">🌐</span>
            <span className="section-label">Django Backend Proxy</span>
          </div>
          <span className={`text-[10px] font-semibold ${backendHealth.status === 'ok' ? 'text-green-400' : 'text-text-muted'}`}>
            {backendHealth.status === 'ok' ? '● Connected' : '○ Local Standalone'}
          </span>
        </div>
        <p className="text-[10px] text-text-muted leading-relaxed">
          {backendHealth.status === 'ok'
            ? `Connected to Django server at http://127.0.0.1:8000 (${backendHealth.service} v${backendHealth.version}). Resume/JD context and session logs are synchronized.`
            : 'Backend offline. App is operating in local direct-client mode.'
          }
        </p>
      </section>

      {/* ── Hotkey info ──────────────────────────────────────────── */}
      <section className="space-y-2 p-3 rounded-xl bg-white/5 border border-border">
        <p className="section-label">Global Hotkey</p>
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-1 rounded bg-white/10 font-mono text-text-primary text-xs border border-border">
            Ctrl + Shift + H
          </kbd>
          <span className="text-text-muted text-xs">— Toggle overlay visibility instantly</span>
        </div>
        <p className="text-[10px] text-text-muted">
          Works even when another app has focus. Use this to hide the overlay before screen-sharing.
        </p>
      </section>

      <div className="text-center text-[10px] text-text-muted pt-2 border-t border-border">
        TUDLOIKO v1.0 · AI Interview Copilot
      </div>
    </div>
  )
}
