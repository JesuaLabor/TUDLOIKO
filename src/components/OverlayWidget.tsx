import { useState } from 'react'
import type { AppSettings, Suggestion } from '../App'
import type { GeminiContext } from '../lib/gemini'
import type { TranscriptEntry } from '../lib/stt'
import type {
  StoryBankItem,
  InterviewDebrief,
  SpeechAnalyticsResult,
} from '../types/copilot'
import TitleBar from './TitleBar'
import TabNav, { type Tab } from './TabNav'
import SuggestionFeed from './SuggestionFeed'
import ManualPrompt from './ManualPrompt'
import SettingsPanel from './SettingsPanel'
import TranscriptPanel from './TranscriptPanel'
import AudioControls from './AudioControls'
import StoryBankPanel from './StoryBankPanel'
import PrepPanel from './PrepPanel'
import DebriefPanel from './DebriefPanel'
import { BookMarked, StickyNote, X, ChevronRight } from 'lucide-react'

interface OverlayWidgetProps {
  suggestions: Suggestion[]
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  context: GeminiContext
  updateContext: (patch: Partial<GeminiContext>) => void
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  isMinimized: boolean
  setIsMinimized: (v: boolean) => void
  isClickThrough: boolean
  onToggleClickThrough: () => void
  onAddSuggestion: (text: string) => void
  onStartStreamingSuggestion: () => string
  onUpdateStreamingSuggestion: (id: string, text: string, done: boolean) => void
  onClearSuggestions: () => void
  // Live Audio & STT
  isListening: boolean
  audioLevel: number
  captureMode: 'manual' | 'auto'
  transcriptEntries: TranscriptEntry[]
  isProcessingAudio: boolean
  audioDeviceLabel: string
  onToggleRecord: () => void
  onToggleCaptureMode: () => void
  onClearTranscript: () => void
  // Lifecycle & Speech Analytics props
  stories: StoryBankItem[]
  onSaveStory: (story: StoryBankItem) => void
  onDeleteStory: (id: number | string) => void
  matchedStory: { matchedStory: StoryBankItem | null; starCue: string; reason: string } | null
  onDismissMatchedStory: () => void
  liveNotes: string
  setLiveNotes: (notes: string) => void
  speechStats: SpeechAnalyticsResult
  debrief: InterviewDebrief | null
  onDebriefGenerated: (debrief: InterviewDebrief) => void
  onSelectQuestionForPractice: (q: string) => void
  isMonitorSource?: boolean
  onToggleAudioSource?: () => void
  onSwitchToMonitor?: () => void
  onSwitchToMic?: () => void
}

export default function OverlayWidget({
  suggestions,
  isStreaming,
  setIsStreaming,
  settings,
  updateSettings,
  context,
  updateContext,
  activeTab,
  setActiveTab,
  isMinimized,
  setIsMinimized,
  isClickThrough,
  onToggleClickThrough,
  onAddSuggestion,
  onStartStreamingSuggestion,
  onUpdateStreamingSuggestion,
  onClearSuggestions,
  isListening,
  audioLevel,
  captureMode,
  transcriptEntries,
  isProcessingAudio,
  audioDeviceLabel,
  onToggleRecord,
  onToggleCaptureMode,
  onClearTranscript,
  stories,
  onSaveStory,
  onDeleteStory,
  matchedStory,
  onDismissMatchedStory,
  liveNotes,
  setLiveNotes,
  speechStats,
  debrief,
  onDebriefGenerated,
  onSelectQuestionForPractice,
  isMonitorSource,
  onToggleAudioSource,
  onSwitchToMonitor,
  onSwitchToMic,
}: OverlayWidgetProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showNotesDrawer, setShowNotesDrawer] = useState(false)

  const fontSizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
  }[settings.fontSize]

  const handleClear = () => {
    if (suggestions.length === 0) return
    setShowClearConfirm(true)
    setTimeout(() => {
      onClearSuggestions()
      setShowClearConfirm(false)
    }, 800)
  }

  return (
    <div
      className={`
        glass-card flex flex-col w-full rounded-2xl overflow-hidden
        transition-all duration-300
        ${isMinimized ? 'h-12' : 'h-screen'}
        ${fontSizeClass}
      `}
      style={{ opacity: settings.opacity }}
    >
      {/* ── Title Bar ──────────────────────────────────────────────── */}
      <TitleBar
        isMinimized={isMinimized}
        setIsMinimized={setIsMinimized}
        isClickThrough={isClickThrough}
        onToggleClickThrough={onToggleClickThrough}
        isStreaming={isStreaming || isProcessingAudio}
        isListening={isListening}
        suggestionCount={suggestions.length}
        onClear={handleClear}
        showClearConfirm={showClearConfirm}
      />

      {!isMinimized && (
        <>
          {/* ── Audio Controls Strip with Speech Telemetry & Source Toggle ── */}
          <AudioControls
            isListening={isListening}
            captureMode={captureMode}
            audioLevel={audioLevel}
            deviceLabel={audioDeviceLabel}
            onToggleRecord={onToggleRecord}
            onToggleMode={onToggleCaptureMode}
            isProcessing={isProcessingAudio}
            speechStats={speechStats}
            isMonitorSource={isMonitorSource}
            onToggleSource={onToggleAudioSource}
          />

          {/* ── Tab Navigation ──────────────────────────────────────── */}
          <TabNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            storyCount={stories.length}
            fillerCount={speechStats.totalFillers}
          />

          {/* ── Tab Content ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* 1. COACH TAB */}
            {activeTab === 'chat' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Matched Story Banner (if surfaced by live STT) */}
                {matchedStory?.matchedStory && (
                  <div className="mx-3 mt-2 p-2 rounded-xl bg-accent/15 border border-accent/35 flex items-start justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-accent text-[10px] font-bold uppercase tracking-wider">
                        <BookMarked size={11} /> Matched From Story Bank
                      </div>
                      <p className="text-xs font-semibold text-text-primary truncate">
                        {matchedStory.matchedStory.title}
                      </p>
                      {matchedStory.starCue && (
                        <p className="text-[10px] text-text-secondary leading-snug line-clamp-2">
                          💡 <span className="text-accent font-medium">STAR Cue:</span> {matchedStory.starCue}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={onDismissMatchedStory}
                      className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-white/5"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}

                {/* Live Scratchpad Quick Toggle */}
                <div className="px-3 pt-1.5 flex items-center justify-between text-[10px] text-text-muted">
                  <button
                    onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                    className="flex items-center gap-1 text-text-muted hover:text-text-secondary font-medium transition-colors"
                  >
                    <StickyNote size={10} className="text-amber-400" />
                    <span>Live Notes / Scratchpad</span>
                    <ChevronRight size={10} className={`transform transition-transform ${showNotesDrawer ? 'rotate-90' : ''}`} />
                  </button>
                  {liveNotes && <span className="text-[9px] text-amber-400/80">Draft saved</span>}
                </div>

                {showNotesDrawer && (
                  <div className="px-3 pt-1 pb-2">
                    <textarea
                      value={liveNotes}
                      onChange={(e) => setLiveNotes(e.target.value)}
                      placeholder="Jot interviewer names, company stack, or questions to ask back at the end…"
                      rows={2}
                      className="glass-input text-[11px] w-full resize-none bg-surface-base/90"
                    />
                  </div>
                )}

                {/* Suggestion Feed */}
                <SuggestionFeed
                  suggestions={suggestions}
                  isStreaming={isStreaming || isProcessingAudio}
                  hasApiKey={!!settings.apiKey}
                />
                <div className="h-px bg-border mx-4" />
                <ManualPrompt
                  apiKey={settings.apiKey}
                  context={context}
                  isStreaming={isStreaming}
                  setIsStreaming={setIsStreaming}
                  onStartStreamingSuggestion={onStartStreamingSuggestion}
                  onUpdateStreamingSuggestion={onUpdateStreamingSuggestion}
                  noApiKey={!settings.apiKey}
                  onGoToSettings={() => setActiveTab('settings')}
                />
              </div>
            )}

            {/* 2. LIVE TRANSCRIPT TAB */}
            {activeTab === 'transcript' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <TranscriptPanel
                  entries={transcriptEntries}
                  isListening={isListening}
                  isMonitorSource={isMonitorSource}
                  onSwitchToMonitor={onSwitchToMonitor}
                  onSwitchToMic={onSwitchToMic}
                />
                {transcriptEntries.length > 0 && (
                  <div className="p-2 border-t border-border flex gap-2">
                    <button
                      onClick={onClearTranscript}
                      className="btn-ghost flex-1 justify-center text-xs text-red-400/70 hover:text-red-400"
                    >
                      Clear transcript
                    </button>
                    <button
                      onClick={() => setActiveTab('debrief')}
                      className="px-3 py-1 rounded bg-accent/20 border border-accent/35 text-accent text-xs font-semibold hover:bg-accent/30"
                    >
                      Go to Debrief →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. STORIES TAB */}
            {activeTab === 'stories' && (
              <StoryBankPanel
                stories={stories}
                onSaveStory={onSaveStory}
                onDeleteStory={onDeleteStory}
                apiKey={settings.apiKey}
              />
            )}

            {/* 4. PREP TAB */}
            {activeTab === 'prep' && (
              <PrepPanel
                context={context}
                updateContext={updateContext}
                apiKey={settings.apiKey}
                onSelectQuestionForPractice={onSelectQuestionForPractice}
              />
            )}

            {/* 5. DEBRIEF TAB */}
            {activeTab === 'debrief' && (
              <DebriefPanel
                transcripts={transcriptEntries}
                liveNotes={liveNotes}
                speechStats={speechStats}
                apiKey={settings.apiKey}
                existingDebrief={debrief}
                onDebriefGenerated={onDebriefGenerated}
              />
            )}

            {/* 6. SETTINGS TAB */}
            {activeTab === 'settings' && (
              <SettingsPanel settings={settings} updateSettings={updateSettings} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
