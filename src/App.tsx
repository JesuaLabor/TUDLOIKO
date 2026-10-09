import { useState, useCallback, useEffect, useRef } from 'react'
import OverlayWidget from './components/OverlayWidget'
import { useLocalStorage } from './hooks/useStorage'
import type { GeminiContext } from './lib/gemini'
import { getGeminiClient, matchStoryWithGemini } from './lib/gemini'
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
    } else if (window.electron?.getEnvApiKey) {
      window.electron.getEnvApiKey().then((key) => {
        if (key) setSettings((prev) => ({ ...prev, apiKey: key }))
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

    await processorRef.current.processChunk(
      blob,
      mimeType,
      contextSummary,
      prevTranscript,
      (result) => {
        setIsProcessingAudio(false)
        const isNoSpeech = result.transcript.toLowerCase().includes('(no speech)')

        // Add to transcript & track speech analytics
        if (!isNoSpeech && result.transcript.trim()) {
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

          // If suggestions were already generated by STT audio call, display question + answer pair
          if (result.suggestions.trim()) {
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
                text: result.suggestions,
                timestamp: Date.now(),
                isStreaming: false,
              },
            ])
          } else {
            // Stream full STAR answer suggestions for the transcribed question
            const client = getGeminiClient(settings.apiKey, context)
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
              },
              (err) => {
                setIsStreaming(false)
                console.error('[Gemini suggestion error]', err)
              }
            )
          }

          // Auto-match against Story Bank and enrich the coach answer card
          if (stories.length > 0) {
            matchStoryWithGemini(questionText, stories, settings.apiKey).then((match) => {
              if (match.matchedStory) {
                setMatchedStory(match)
                setSuggestions((prev) =>
                  prev.map((s) =>
                    s.id === aId
                      ? {
                          ...s,
                          matchedStoryTitle: match.matchedStory?.title,
                          starCue: match.starCue,
                        }
                      : s
                  )
                )
              }
            }).catch(() => {})
          }
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
    const SpeechRec = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
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
      const client = getGeminiClient(settings.apiKey, context)
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
        },
        (err) => {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === aId ? { ...s, text: `⚠ Error: ${err.message}`, isStreaming: false } : s))
          )
          setIsStreaming(false)
        }
      )

      // Auto-match against Story Bank
      if (stories.length > 0) {
        matchStoryWithGemini(question, stories, settings.apiKey).then((match) => {
          if (match.matchedStory) {
            setMatchedStory(match)
            setSuggestions((prev) =>
              prev.map((s) =>
                s.id === aId
                  ? {
                      ...s,
                      matchedStoryTitle: match.matchedStory?.title,
                      starCue: match.starCue,
                    }
                  : s
              )
            )
          }
        }).catch(() => {})
      }
    }
  }, [settings.apiKey, context, stories])

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
    </div>
  )
}
