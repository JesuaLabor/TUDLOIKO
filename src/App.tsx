import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, LayoutDashboard, Smartphone, KeyRound } from 'lucide-react'
import OverlayWidget from './components/OverlayWidget'
import { useLocalStorage } from './hooks/useStorage'
import type { GeminiContext } from './lib/gemini'
import { getGeminiClient, matchStoryWithGemini, cleanJsonText } from './lib/gemini'
import { AudioCaptureManager } from './lib/audioCapture'
import type { AudioDevice } from './lib/audioCapture'
import { GeminiAudioProcessor, buildContextSummary } from './lib/stt'
import type { TranscriptEntry } from './lib/stt'
import type { Tab } from './components/TabNav'
import type {
  StoryBankItem,
  InterviewDebrief,
  SpeechAnalyticsResult,
} from './types/copilot'
import { SpeechAnalyticsTracker } from './lib/speechAnalytics'
import { BackendClient } from './lib/backend'

export interface Suggestion {
  id: string
  role?: 'interviewer' | 'coach'
  text: string
  timestamp: number
  isStreaming?: boolean
  matchedStoryTitle?: string
  starCue?: string
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
  depthPreference?: 'simple' | 'medium' | 'technical'
  interviewLanguage?: 'English' | 'Filipino' | 'Taglish'
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
  depthPreference: 'technical',
  interviewLanguage: 'English',
}

const DEFAULT_SPEECH_STATS: SpeechAnalyticsResult = {
  totalFillers: 0,
  fillerCounts: {},
  wpm: 0,
  paceStatus: 'optimal',
  totalWords: 0,
}

export default function App() {
  // ── Core Copilot State ──────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [settings, setSettings] = useLocalStorage<AppSettings>('tudloiko-settings', DEFAULT_SETTINGS)
  const [context, setContext] = useLocalStorage<GeminiContext>('tudloiko-context', {})

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings]
  )
  const updateContext = useCallback(
    (patch: Partial<GeminiContext>) => setContext((prev) => ({ ...prev, ...patch })),
    [setContext]
  )

  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [isMinimized, setIsMinimized] = useState(false)
  const [isClickThrough, setIsClickThrough] = useState(false)
  const [webLayoutMode, setWebLayoutMode] = useLocalStorage<'dashboard' | 'compact'>('tudloiko-web-layout', 'dashboard')

  // ── Lifecycle & Analytics State ─────────────────────────────────────────────
  const [stories, setStories] = useLocalStorage<StoryBankItem[]>('tudloiko-stories', [])
  const [matchedStory, setMatchedStory] = useState<{
    matchedStory: StoryBankItem | null
    starCue: string
    reason: string
  } | null>(null)
  const [liveNotes, setLiveNotes] = useLocalStorage<string>('tudloiko-live-notes', '')
  const [debrief, setDebrief] = useLocalStorage<InterviewDebrief | null>('tudloiko-debrief', null)
  const [speechStats, setSpeechStats] = useState<SpeechAnalyticsResult>(DEFAULT_SPEECH_STATS)
  const speechTrackerRef = useRef(new SpeechAnalyticsTracker())

  // ── Audio & STT State ───────────────────────────────────────────────────────
  const [isListening, setIsListening] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([])
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [liveInterimText, setLiveInterimText] = useState('')
  const [captureMode, setCaptureMode] = useState<'manual' | 'auto'>(settings.captureMode ?? 'manual')
  const [audioDeviceLabel, setAudioDeviceLabel] = useState('')

  const captureRef = useRef<AudioCaptureManager | null>(null)
  const processorRef = useRef<GeminiAudioProcessor | null>(null)
  const transcriptBufferRef = useRef<string[]>([])
  const speechRecRef = useRef<any>(null)

  // ── Initial setup & backend sync ────────────────────────────────────────────
  useEffect(() => {
    window.electron?.getClickThrough().then(setIsClickThrough).catch(() => {})

    // Check .env for GEMINI_API_KEY
    const envKey = (import.meta.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '') as string
    if (envKey) {
      setSettings((prev) => ({ ...prev, apiKey: envKey }))
    }
    if (window.electron?.getEnvApiKey) {
      window.electron.getEnvApiKey().then((key) => {
        if (key && key.trim()) {
          setSettings((prev) => ({ ...prev, apiKey: key.trim() }))
        }
      })
    }

    // Try fetching stories from backend DB if any
    BackendClient.getStories().then((backendStories) => {
      if (backendStories && backendStories.length > 0) {
        setStories((prev) => {
          const ids = new Set(prev.map((s) => s.id))
          const merged = [...prev]
          backendStories.forEach((bs) => {
            if (!ids.has(bs.id)) merged.push(bs)
          })
          return merged
        })
      }
    }).catch(() => {})
  }, [])

  // Keep Gemini context stories up to date
  useEffect(() => {
    setContext((prev) => ({ ...prev, stories }))
  }, [stories])

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

    try {
      await processorRef.current.processChunk(
        blob,
        mimeType,
        contextSummary,
        prevTranscript,
        (result) => {
          setIsProcessingAudio(false)
          const lower = result.transcript.toLowerCase()
          const isNoSpeech = lower.includes('(no speech)') || lower.includes('<noise>') || lower.includes('[noise]') || !result.transcript.trim()

          // Add to transcript & track speech analytics
          if (!isNoSpeech) {
            const questionText = result.transcript.trim()
            setLiveInterimText('')

            const entry: TranscriptEntry = {
              id: `${Date.now()}-${Math.random()}`,
              text: questionText,
              timestamp: Date.now(),
              speaker: 'them',
            }
            setTranscriptEntries((prev) => [...prev, entry])
            transcriptBufferRef.current = [...transcriptBufferRef.current, questionText].slice(-20)

            // Update real-time pacing & filler counts
            const stats = speechTrackerRef.current.processUtterance(questionText, settings.chunkIntervalMs)
            setSpeechStats(stats)

            // Immediately switch to Coach tab so the user sees the generated chat answer
            setActiveTab('chat')

            const qId = `q-${Date.now()}-${Math.random()}`
            const aId = `a-${Date.now()}-${Math.random()}`

            // Stream full real-time coach structured suggestions for the transcribed question
            const effectiveContext: GeminiContext = {
              ...context,
              depthPreference: settings.depthPreference,
              interviewLanguage: settings.interviewLanguage,
            }
            const client = getGeminiClient(settings.apiKey, effectiveContext)
            setSuggestions((prev) => [
              ...prev,
              {
                id: qId,
                role: 'interviewer',
                text: questionText,
                timestamp: Date.now(),
              },
              {
                id: aId,
                role: 'coach',
                text: '',
                timestamp: Date.now(),
                isStreaming: true,
              },
            ])
            setIsStreaming(true)
            client.streamSuggestion(
              questionText,
              (acc) => {
                setSuggestions((prev) =>
                  prev.map((s) => (s.id === aId ? { ...s, text: acc } : s))
                )
              },
              (final) => {
                setSuggestions((prev) =>
                  prev.map((s) => (s.id === aId ? { ...s, text: final, isStreaming: false } : s))
                )
                setIsStreaming(false)

                // If story was chosen in the coach card, surface matched story without extra API call
                try {
                  const parsed = JSON.parse(cleanJsonText(final))
                  if (parsed?.source?.story_id && stories.length > 0) {
                    const matched = stories.find(
                      (s, idx) =>
                        s.id?.toString() === parsed.source.story_id?.replace(/^story-/, '') ||
                        `story-${s.id}` === parsed.source.story_id ||
                        `story-${idx + 1}` === parsed.source.story_id ||
                        (s.title && parsed.source.story_title && s.title.toLowerCase() === parsed.source.story_title.toLowerCase())
                    )
                    if (matched) {
                      setMatchedStory({
                        matchedStory: matched,
                        starCue: parsed.body?.situation || parsed.intent || 'Story match from profile',
                        reason: parsed.intent || 'Relevant story from Story Bank',
                      })
                    }
                  }
                } catch {
                  // Ignore JSON parse errors
                }
              },
              (err) => {
                setIsStreaming(false)
                setSuggestions((prev) =>
                  prev.map((s) => (s.id === aId ? { ...s, text: `⚠ Error: ${err.message}`, isStreaming: false } : s))
                )
                console.error('[Gemini suggestion error]', err)
              }
            )
          }
        },
        (err) => {
          setIsProcessingAudio(false)
          console.error('[STT error]', err)
          const errorMsg = err.message.startsWith('⚠') ? err.message : `⚠ Audio processing error: ${err.message}`
          setSuggestions((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.text.includes('429 Rate Limit') && errorMsg.includes('429 Rate Limit')) {
              return prev // Don't duplicate rate limit error cards
            }
            return [
              ...prev,
              { id: `${Date.now()}-error`, role: 'coach', text: errorMsg, timestamp: Date.now() },
            ]
          })
        }
      )
    } finally {
      setIsProcessingAudio(false)
    }
  }, [settings.apiKey, settings.chunkIntervalMs, context, stories])

  // ── Start / Stop recording ───────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (!captureRef.current) {
      captureRef.current = new AudioCaptureManager()
    }
    const manager = captureRef.current
    manager
      .onChunk(handleAudioChunk)
      .onLevel(setAudioLevel)
      .onSilence(() => {})
      .onError((err) => {
        console.error('[AudioCapture]', err)
        setIsListening(false)
        setAudioLevel(0)
      })

    await manager.start({
      deviceId: settings.audioDeviceId || undefined,
      chunkIntervalMs: settings.chunkIntervalMs,
      silenceThreshold: VAD_THRESHOLDS[settings.vadSensitivity ?? 'medium'],
      mode: captureMode,
    })
    setIsListening(true)

    // Optional Web Speech API for real-time live interim word preview
    // Skipped on iOS: Safari's SpeechRecognition grabs the mic and makes MediaRecorder capture silence
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const SpeechRec = isIOS ? null : ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition)
    if (SpeechRec) {
      try {
        const rec = new SpeechRec()
        rec.continuous = true
        rec.interimResults = true
        rec.lang = 'en-US'
        rec.onresult = (evt: any) => {
          let interim = ''
          for (let i = evt.resultIndex; i < evt.results.length; ++i) {
            if (!evt.results[i].isFinal) {
              interim += evt.results[i][0].transcript
            }
          }
          if (interim) {
            setLiveInterimText(interim.trim())
          }
        }
        rec.onerror = () => {}
        rec.start()
        speechRecRef.current = rec
      } catch {
        // quiet fallback to Gemini direct audio processor
      }
    }
  }, [handleAudioChunk, settings])

  const stopListening = useCallback(async () => {
    setIsListening(false)
    setAudioLevel(0)
    if (speechRecRef.current) {
      try { speechRecRef.current.stop() } catch {}
      speechRecRef.current = null
    }
    setLiveInterimText('')
    // Switch to Coach tab so user immediately sees the generated answer!
    setActiveTab('chat')
    if (captureRef.current) {
      await captureRef.current.stop(true)
    }
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

  // Auto mode trigger
  useEffect(() => {
    if (captureMode === 'auto' && !isListening && settings.apiKey) {
      startListening()
    }
  }, [captureMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { captureRef.current?.stop() }
  }, [])

  // ── Audio devices enumeration & source switching ────────────────────────────
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])

  const loadAudioDevices = useCallback(async () => {
    try {
      const devices = await AudioCaptureManager.listDevices()
      setAudioDevices(devices)
    } catch {
      setAudioDevices([])
    }
  }, [])

  useEffect(() => {
    loadAudioDevices()
  }, [loadAudioDevices])

  // Audio device label
  useEffect(() => {
    if (!settings.audioDeviceId) {
      setAudioDeviceLabel('Default Mic')
      return
    }
    const found = audioDevices.find((d) => d.deviceId === settings.audioDeviceId)
    setAudioDeviceLabel(found?.label ?? 'Selected Device')
  }, [settings.audioDeviceId, audioDevices])

  const currentDevice = audioDevices.find((d) => d.deviceId === settings.audioDeviceId)
  const isMonitorSource = !!currentDevice?.isMonitor || audioDeviceLabel.toLowerCase().includes('monitor')

  const handleSwitchToMonitor = useCallback(() => {
    const monitorDevice = audioDevices.find((d) => d.isMonitor)
    if (monitorDevice) {
      updateSettings({ audioDeviceId: monitorDevice.deviceId })
    } else {
      AudioCaptureManager.listDevices().then((devices) => {
        setAudioDevices(devices)
        const found = devices.find((d) => d.isMonitor)
        if (found) updateSettings({ audioDeviceId: found.deviceId })
      })
    }
  }, [audioDevices, updateSettings])

  const handleSwitchToMic = useCallback(() => {
    const micDevice = audioDevices.find((d) => !d.isMonitor)
    updateSettings({ audioDeviceId: micDevice ? micDevice.deviceId : '' })
  }, [audioDevices, updateSettings])

  const handleToggleAudioSource = useCallback(() => {
    if (isMonitorSource) {
      handleSwitchToMic()
    } else {
      handleSwitchToMonitor()
    }
  }, [isMonitorSource, handleSwitchToMic, handleSwitchToMonitor])

  // Restart capture if user switches device while active
  useEffect(() => {
    if (isListening) {
      captureRef.current?.stop()
      const t = setTimeout(() => {
        startListening()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [settings.audioDeviceId])

  // ── Story Bank helpers ───────────────────────────────────────────────────────
  const handleSaveStory = useCallback((story: StoryBankItem) => {
    setStories((prev) => [story, ...prev])
  }, [setStories])

  const handleDeleteStory = useCallback((id: number | string) => {
    setStories((prev) => prev.filter((s) => s.id !== id))
    if (typeof id === 'number') {
      BackendClient.deleteStory(id).catch(() => {})
    }
  }, [setStories])

  // ── Question practice helper from Prep tab ──────────────────────────────────
  const handleSelectQuestionForPractice = useCallback((question: string) => {
    setActiveTab('chat')
    // Stream suggestions immediately for this question
    if (settings.apiKey) {
      const time = Date.now()
      const qId = `q-${time}-${Math.random()}`
      const aId = `a-${time}-${Math.random()}`
      setSuggestions((prev) => [
        ...prev,
        { id: qId, role: 'interviewer', text: question, timestamp: time },
        { id: aId, role: 'coach', text: '', timestamp: time, isStreaming: true },
      ])
      setIsStreaming(true)
      const effectiveContext: GeminiContext = {
        ...context,
        depthPreference: settings.depthPreference,
        interviewLanguage: settings.interviewLanguage,
      }
      const client = getGeminiClient(settings.apiKey, effectiveContext)
      client.streamSuggestion(
        question,
        (acc) => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === aId ? { ...s, text: acc } : s))
          )
        },
        (final) => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === aId ? { ...s, text: final, isStreaming: false } : s))
          )
          setIsStreaming(false)

          // If story was chosen in the coach card, surface matched story
          try {
            const parsed = JSON.parse(cleanJsonText(final))
            if (parsed?.source?.story_id && stories.length > 0) {
              const matched = stories.find(
                (s, idx) =>
                  s.id?.toString() === parsed.source.story_id?.replace(/^story-/, '') ||
                  `story-${s.id}` === parsed.source.story_id ||
                  `story-${idx + 1}` === parsed.source.story_id ||
                  (s.title && parsed.source.story_title && s.title.toLowerCase() === parsed.source.story_title.toLowerCase())
              )
              if (matched) {
                setMatchedStory({
                  matchedStory: matched,
                  starCue: parsed.body?.situation || parsed.intent || 'Story match from profile',
                  reason: parsed.intent || 'Relevant story from Story Bank',
                })
              }
            }
          } catch {
            // Ignore parse errors
          }
        },
        (err) => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === aId ? { ...s, text: `⚠ Error: ${err.message}`, isStreaming: false } : s))
          )
          setIsStreaming(false)
        }
      )
    }
  }, [settings.apiKey, settings.depthPreference, settings.interviewLanguage, context, stories])

  // ── Suggestion helpers ───────────────────────────────────────────────────────
  const addSuggestion = useCallback((text: string, role: 'interviewer' | 'coach' = 'coach') => {
    setSuggestions((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, role, text, timestamp: Date.now() },
    ])
  }, [])

  const startStreamingSuggestion = useCallback((questionText?: string): string => {
    const time = Date.now()
    const aId = `a-${time}-${Math.random()}`
    setSuggestions((prev) => {
      const items: Suggestion[] = [...prev]
      if (questionText && questionText.trim()) {
        const qId = `q-${time}-${Math.random()}`
        items.push({
          id: qId,
          role: 'interviewer',
          text: questionText.trim(),
          timestamp: time,
        })
      }
      items.push({
        id: aId,
        role: 'coach',
        text: '',
        timestamp: time,
        isStreaming: true,
      })
      return items
    })
    return aId
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
    speechTrackerRef.current.reset()
    setSpeechStats(DEFAULT_SPEECH_STATS)
  }, [])

  const handleToggleClickThrough = useCallback(async () => {
    const next = await window.electron?.toggleClickThrough()
    if (next !== undefined) setIsClickThrough(next)
  }, [])

  const isElectron = typeof window !== 'undefined' && Boolean(window.electron?.isElectron)

  const widget = (
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
      // Live Audio & STT
      isListening={isListening}
      audioLevel={audioLevel}
      captureMode={captureMode}
      transcriptEntries={transcriptEntries}
      isProcessingAudio={isProcessingAudio}
      liveInterimText={liveInterimText}
      audioDeviceLabel={audioDeviceLabel}
      onToggleRecord={toggleRecord}
      onToggleCaptureMode={toggleCaptureMode}
      onClearTranscript={clearTranscript}
      // Lifecycle & Analytics props
      stories={stories}
      onSaveStory={handleSaveStory}
      onDeleteStory={handleDeleteStory}
      matchedStory={matchedStory}
      onDismissMatchedStory={() => setMatchedStory(null)}
      liveNotes={liveNotes}
      setLiveNotes={setLiveNotes}
      speechStats={speechStats}
      debrief={debrief}
      onDebriefGenerated={setDebrief}
      onSelectQuestionForPractice={handleSelectQuestionForPractice}
      isMonitorSource={isMonitorSource}
      onToggleAudioSource={handleToggleAudioSource}
      onSwitchToMonitor={handleSwitchToMonitor}
      onSwitchToMic={handleSwitchToMic}
    />
  )

  if (isElectron) {
    return <div className="w-full h-screen bg-transparent">{widget}</div>
  }

  return (
    <div className="relative h-screen h-[100dvh] w-full bg-[#070814] text-text-primary flex flex-col items-center p-2 sm:p-4 overflow-hidden">
      {/* Background ambient mesh lighting */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[340px] bg-accent/20 blur-[130px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-32 right-10 w-[500px] h-[320px] bg-blue-600/15 blur-[140px] rounded-full" />

      {/* Top Header Bar on web */}
      <header className={`w-full ${webLayoutMode === 'dashboard' ? 'max-w-5xl xl:max-w-6xl' : 'max-w-md sm:max-w-lg'} shrink-0 mb-2 flex items-center justify-between px-1 text-xs text-text-muted z-10 transition-all duration-300`}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Sparkles size={11} className="text-accent" />
          </div>
          <span className="font-bold text-text-primary tracking-wide text-xs sm:text-sm">TUDLOIKO</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 border border-accent/25 text-accent font-medium hidden xs:inline-block">
            Web Edition
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Gemini API Key status chip */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
              settings.apiKey
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/20 animate-pulse'
            }`}
            title={settings.apiKey ? 'Gemini API Key connected. Click to edit in Settings.' : 'API Key missing. Click to configure in Settings.'}
          >
            <KeyRound size={10} />
            <span>{settings.apiKey ? 'API Connected' : 'Setup API Key'}</span>
          </button>

          {/* Web View Mode Toggle: Dashboard (Wide) vs Compact (Overlay) */}
          <div className="flex items-center p-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px]">
            <button
              onClick={() => setWebLayoutMode('dashboard')}
              title="Wide Dashboard View (roomy layout for desktop practice)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all ${
                webLayoutMode === 'dashboard'
                  ? 'bg-accent/30 text-white font-semibold shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <LayoutDashboard size={11} />
              <span className="hidden sm:inline">Wide</span>
            </button>
            <button
              onClick={() => setWebLayoutMode('compact')}
              title="Compact Copilot View (narrow overlay style)"
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all ${
                webLayoutMode === 'compact'
                  ? 'bg-accent/30 text-white font-semibold shadow-xs'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Smartphone size={11} />
              <span className="hidden sm:inline">Compact</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Copilot Card container */}
      <main
        className={`
          w-full flex-1 min-h-0 flex flex-col rounded-2xl shadow-2xl shadow-black/80
          border border-white/10 overflow-hidden backdrop-blur-xl relative z-10 transition-all duration-300
          ${webLayoutMode === 'dashboard' ? 'max-w-5xl xl:max-w-6xl' : 'max-w-md sm:max-w-lg'}
        `}
      >
        {widget}
      </main>
    </div>
  )
}
