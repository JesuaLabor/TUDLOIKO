import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { Send, Loader2, AlertCircle } from 'lucide-react'
import { getGeminiClient, GeminiClient } from '../lib/gemini'
import type { GeminiContext } from '../lib/gemini'

interface ManualPromptProps {
  apiKey: string
  context: GeminiContext
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  onStartStreamingSuggestion: (questionText?: string) => string
  onUpdateStreamingSuggestion: (id: string, text: string, done: boolean) => void
  noApiKey: boolean
  onGoToSettings: () => void
}

export default function ManualPrompt({
  apiKey,
  context,
  isStreaming,
  setIsStreaming,
  onStartStreamingSuggestion,
  onUpdateStreamingSuggestion,
  noApiKey,
  onGoToSettings,
}: ManualPromptProps) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isStreaming) return
    if (!apiKey) {
      onGoToSettings()
      return
    }

    if (!GeminiClient.validateApiKey(apiKey)) {
      setError('API key looks invalid. Check Settings.')
      return
    }

    setError(null)
    setPrompt('')
    setIsStreaming(true)

    const id = onStartStreamingSuggestion(trimmed)
    let accumulated = ''

    const client = getGeminiClient(apiKey, context)
    await client.streamSuggestion(
      trimmed,
      (chunk) => {
        accumulated += chunk
        onUpdateStreamingSuggestion(id, accumulated, false)
      },
      (_full) => {
        onUpdateStreamingSuggestion(id, accumulated, true)
        setIsStreaming(false)
        textareaRef.current?.focus()
      },
      (err) => {
        setError(err.message)
        onUpdateStreamingSuggestion(id, '⚠ Error: ' + err.message, true)
        setIsStreaming(false)
      }
    )
  }, [prompt, isStreaming, apiKey, context, onStartStreamingSuggestion, onUpdateStreamingSuggestion, setIsStreaming, onGoToSettings])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const charCount = prompt.length

  return (
    <div className="no-drag p-3 space-y-2">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-fade-in">
          <AlertCircle size={12} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-1 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || noApiKey}
          rows={3}
          maxLength={2000}
          placeholder={
            noApiKey
              ? 'Add your Gemini API key in Settings…'
              : 'What did the interviewer just ask? (Enter to send)'
          }
          className={`
            glass-input
            ${noApiKey ? 'opacity-40 cursor-not-allowed' : ''}
          `}
        />

        {/* Character count */}
        {charCount > 100 && (
          <span className="absolute bottom-2 right-2 text-[10px] text-text-muted pointer-events-none">
            {charCount}/2000
          </span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-2">
        {noApiKey ? (
          <button
            onClick={onGoToSettings}
            className="btn-primary flex-1 justify-center"
          >
            Add API Key in Settings
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isStreaming}
            className={`
              btn-primary flex-1 justify-center
              ${(!prompt.trim() || isStreaming) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isStreaming ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Send size={14} />
                Ask Gemini
              </>
            )}
          </button>
        )}
      </div>

      {/* Hotkey hint */}
      <p className="text-center text-[10px] text-text-muted">
        Press <kbd className="px-1 py-0.5 rounded bg-white/5 font-mono text-text-secondary">Ctrl+Shift+H</kbd> to hide instantly
      </p>
    </div>
  )
}
