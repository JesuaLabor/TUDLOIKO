import { useState, useCallback, useEffect, useRef } from 'react'
import OverlayWidget from './components/OverlayWidget'
import { useLocalStorage } from './hooks/useStorage'
import type { GeminiContext } from './lib/gemini'
import { AudioCaptureManager } from './lib/audioCapture'
import { GeminiAudioProcessor, buildContextSummary } from './lib/stt'
import type { TranscriptEntry } from './lib/stt'

export interface Suggestion {
  id: string
  text: string
  timestamp: number
  isStreaming?: boolean
}

export interface AppSettings {
  apiKey: string
  fontSize: 'sm' | 'base' | 'lg'
  opacity: number
  hotkey: string
  audioDeviceId: string
  chunkIntervalMs: number
  captureMode: 'manual' | 'auto'
  vadSensitivity: 'low' | 'medium' | 'high'
}

const VAD_THRESHOLDS = { low: 6, medium: 12, high: 20 } as const

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  fontSize: 'sm',
  opacity: 0.92,
  hotkey: 'Ctrl+Shift+H',
  audioDeviceId: '',
  chunkIntervalMs: 5000,
  captureMode: 'manual',
  vadSensitivity: 'medium',
}

export default function App() {
  // ── Phase 1 state ───────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [settings, setSettings] = useLocalStorage<AppSettings>('tudloiko-settings', DEFAULT_SETTINGS)
  const [context, setContext] = useLocalStorage<GeminiContext>('tudloiko-context', {})
  const [activeTab, setActiveTab] = useState<'chat' | 'transcript' | 'context' | 'settings'>('chat')
  const [isMinimized, setIsMinimized] = useState(false)
  const [isClickThrough, setIsClickThrough] = useState(false)

  // ── Phase 2 state ───────────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [captureMode, setCaptureMode] = useState<'manual' | 'auto'>(settings.captureMode ?? 'manual')
  const [audioDeviceLabel, setAudioDeviceLabel] = useState('')

  const captureRef = useRef<AudioCaptureManager | null>(null)
  const processorRef = useRef<GeminiAudioProcessor | null>(null)
  const transcriptBufferRef = useRef<string[]>([])

  // ── Sync initial click-through state & load API key from .env ─────────────
  useEffect(() => {
    window.electron?.getClickThrough().then(setIsClickThrough).catch(() => {})

    // Check .env for GEMINI_API_KEY
    const envKey = (import.meta.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '') as string
    if (envKey) {
      setSettings((prev) => ({ ...prev, apiKey: envKey }))
    } else if (window.electron?.getEnvApiKey) {
      window.electron.getEnvApiKey().then((key) => {
        if (key) setSettings((prev) => ({ ...prev, apiKey: key }))
      })
    }
  }, [])

  // ── Build/update Gemini audio processor when API key changes ─────────────────
  useEffect(() => {
    if (!settings.apiKey) return
    if (!processorRef.current) {
      processorRef.current = new GeminiAudioProcessor(settings.apiKey)
    } else {
      processorRef.current.updateApiKey(settings.apiKey)
    }
  }, [settings.apiKey])

  // ── Audio chunk handler ──────────────────────────────────────────────────────
  const handleAudioChunk = useCallback(async (blob: Blob, mimeType: string) => {
    if (!processorRef.current || !settings.apiKey) return
    setIsProcessingAudio(true)

    const contextSummary = buildContextSummary(context)
    const prevTranscript = transcriptBufferRef.current.slice(-6).join('\n')

    await processorRef.current.processChunk(
      blob,
      mimeType,
      contextSummary,
      prevTranscript,
      (result) => {
        setIsProcessingAudio(false)
        const isNoSpeech = result.transcript.toLowerCase().includes('(no speech)')

        // Add to transcript
        if (!isNoSpeech && result.transcript.trim()) {
          const entry: TranscriptEntry = {
            id: `${Date.now()}-${Math.random()}`,
            text: result.transcript,
            timestamp: Date.now(),
            speaker: 'unknown', // can be refined with diarization later
          }
          setTranscriptEntries((prev) => [...prev, entry])
          transcriptBufferRef.current = [...transcriptBufferRef.current, result.transcript].slice(-20)
        }

        // Add suggestions if we got any
        if (result.suggestions.trim()) {
          const id = `${Date.now()}-${Math.random()}`
          setSuggestions((prev) => [
            ...prev,
            { id, text: result.suggestions, timestamp: Date.now(), isStreaming: false },
          ])
        }
      },
      (err) => {
        setIsProcessingAudio(false)
        console.error('[STT error]', err)
        const id = `${Date.now()}-error`
        const errorMsg = err.message.startsWith('⚠') ? err.message : `⚠ Audio processing error: ${err.message}`
        setSuggestions((prev) => [
          ...prev,
          { id, text: errorMsg, timestamp: Date.now() },
        ])
      }
    )
  }, [settings.apiKey, context])

  // ── Start / Stop recording ───────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!captureRef.current) {
      captureRef.current = new AudioCaptureManager()
    }
    const manager = captureRef.current
    manager
      .onChunk(handleAudioChunk)
      .onLevel(setAudioLevel)
      .onSilence(() => {
        // In auto mode, silence means we've heard a complete utterance — nothing extra needed
        // (chunks are already being sent on the interval timer)
      })
      .onError((err) => {
        console.error('[AudioCapture]', err)
        setIsListening(false)
        setAudioLevel(0)
      })

    await manager.start({
      deviceId: settings.audioDeviceId || undefined,
      chunkIntervalMs: settings.chunkIntervalMs,
      silenceThreshold: VAD_THRESHOLDS[settings.vadSensitivity ?? 'medium'],
    })
    setIsListening(true)

    // Switch to transcript tab so user sees the live feed
    setActiveTab('transcript')
  }, [handleAudioChunk, settings])

  const stopListening = useCallback(() => {
    captureRef.current?.stop()
    setIsListening(false)
    setAudioLevel(0)
  }, [])

  const toggleRecord = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  const toggleCaptureMode = useCallback(() => {
    setCaptureMode((m) => {
      const next = m === 'manual' ? 'auto' : 'manual'
      updateSettings({ captureMode: next })
      return next
    })
  }, [])

  // Auto mode: start listening automatically when mode switches to auto
  useEffect(() => {
    if (captureMode === 'auto' && !isListening && settings.apiKey) {
      startListening()
    }
  }, [captureMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { captureRef.current?.stop() }
  }, [])

  // ── Update audio device label when deviceId changes ──────────────────────────
  useEffect(() => {
    if (!settings.audioDeviceId) { setAudioDeviceLabel('Default Mic'); return }
    AudioCaptureManager.listDevices().then((devices) => {
      const found = devices.find((d) => d.deviceId === settings.audioDeviceId)
      setAudioDeviceLabel(found?.label ?? 'Selected Device')
    }).catch(() => {})
  }, [settings.audioDeviceId])

  // ── Suggestion helpers ───────────────────────────────────────────────────────
  const addSuggestion = useCallback((text: string) => {
    setSuggestions((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, text, timestamp: Date.now() },
    ])
  }, [])

  const startStreamingSuggestion = useCallback((): string => {
    const id = `${Date.now()}-${Math.random()}`
    setSuggestions((prev) => [
      ...prev,
      { id, text: '', timestamp: Date.now(), isStreaming: true },
    ])
    return id
  }, [])

  const updateStreamingSuggestion = useCallback((id: string, text: string, done: boolean) => {
    setSuggestions((prev) =>
      prev.map((s) => s.id === id ? { ...s, text, isStreaming: !done } : s)
    )
  }, [])

  const clearSuggestions = useCallback(() => setSuggestions([]), [])
  const clearTranscript = useCallback(() => {
    setTranscriptEntries([])
    transcriptBufferRef.current = []
  }, [])

  // ── Settings helpers ─────────────────────────────────────────────────────────
  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings]
  )
  const updateContext = useCallback(
    (patch: Partial<GeminiContext>) => setContext((prev) => ({ ...prev, ...patch })),
    [setContext]
  )

  const handleToggleClickThrough = useCallback(async () => {
    const next = await window.electron?.toggleClickThrough()
    if (next !== undefined) setIsClickThrough(next)
  }, [])

  return (
    <div className="w-full h-screen bg-transparent">
      <OverlayWidget
        suggestions={suggestions}
        isStreaming={isStreaming}
        setIsStreaming={setIsStreaming}
        settings={settings}
        updateSettings={updateSettings}
        context={context}
        updateContext={updateContext}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isMinimized={isMinimized}
        setIsMinimized={setIsMinimized}
        isClickThrough={isClickThrough}
        onToggleClickThrough={handleToggleClickThrough}
        onAddSuggestion={addSuggestion}
        onStartStreamingSuggestion={startStreamingSuggestion}
        onUpdateStreamingSuggestion={updateStreamingSuggestion}
        onClearSuggestions={clearSuggestions}
        // Phase 2 props
        isListening={isListening}
        audioLevel={audioLevel}
        captureMode={captureMode}
        transcriptEntries={transcriptEntries}
        isProcessingAudio={isProcessingAudio}
        audioDeviceLabel={audioDeviceLabel}
        onToggleRecord={toggleRecord}
        onToggleCaptureMode={toggleCaptureMode}
        onClearTranscript={clearTranscript}
      />
    </div>
  )
}
