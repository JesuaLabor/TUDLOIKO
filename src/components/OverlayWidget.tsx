import { useState } from 'react'
import type { AppSettings, Suggestion } from '../App'
import type { GeminiContext } from '../lib/gemini'
import type { TranscriptEntry } from '../lib/stt'
import TitleBar from './TitleBar'
import TabNav from './TabNav'
import SuggestionFeed from './SuggestionFeed'
import ManualPrompt from './ManualPrompt'
import ContextPanel from './ContextPanel'
import SettingsPanel from './SettingsPanel'
import TranscriptPanel from './TranscriptPanel'
import AudioControls from './AudioControls'

interface OverlayWidgetProps {
  suggestions: Suggestion[]
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  context: GeminiContext
  updateContext: (patch: Partial<GeminiContext>) => void
  activeTab: 'chat' | 'transcript' | 'context' | 'settings'
  setActiveTab: (tab: 'chat' | 'transcript' | 'context' | 'settings') => void
  isMinimized: boolean
  setIsMinimized: (v: boolean) => void
  isClickThrough: boolean
  onToggleClickThrough: () => void
  onAddSuggestion: (text: string) => void
  onStartStreamingSuggestion: () => string
  onUpdateStreamingSuggestion: (id: string, text: string, done: boolean) => void
  onClearSuggestions: () => void
  // Phase 2
  isListening: boolean
  audioLevel: number
  captureMode: 'manual' | 'auto'
  transcriptEntries: TranscriptEntry[]
  isProcessingAudio: boolean
  audioDeviceLabel: string
  onToggleRecord: () => void
  onToggleCaptureMode: () => void
  onClearTranscript: () => void
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
}: OverlayWidgetProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false)

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
          {/* ── Audio Controls strip (always visible when not minimized) ── */}
          <AudioControls
            isListening={isListening}
            captureMode={captureMode}
            audioLevel={audioLevel}
            deviceLabel={audioDeviceLabel}
            onToggleRecord={onToggleRecord}
            onToggleMode={onToggleCaptureMode}
            isProcessing={isProcessingAudio}
          />

          {/* ── Tab Navigation ──────────────────────────────────────── */}
          <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* ── Tab Content ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'chat' && (
              <div className="flex-1 overflow-hidden flex flex-col">
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

            {activeTab === 'transcript' && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <TranscriptPanel
                  entries={transcriptEntries}
                  isListening={isListening}
                />
                {transcriptEntries.length > 0 && (
                  <div className="p-2 border-t border-border">
                    <button
                      onClick={onClearTranscript}
                      className="btn-ghost w-full justify-center text-xs text-red-400/70 hover:text-red-400"
                    >
                      Clear transcript
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'context' && (
              <ContextPanel context={context} updateContext={updateContext} />
            )}

            {activeTab === 'settings' && (
              <SettingsPanel settings={settings} updateSettings={updateSettings} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
