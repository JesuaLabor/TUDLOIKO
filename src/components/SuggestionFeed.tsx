import { useEffect, useRef } from 'react'
import type { Suggestion } from '../App'
import { Sparkles, KeyRound, Bot } from 'lucide-react'

interface SuggestionFeedProps {
  suggestions: Suggestion[]
  isStreaming: boolean
  hasApiKey: boolean
}

// Parse bullet lines from Gemini output
function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function SuggestionItem({ suggestion }: { suggestion: Suggestion }) {
  const lines = parseBullets(suggestion.text)
  const isAnswer = !suggestion.isStreaming && lines.length > 0

  return (
    <div className="suggestion-enter px-4 py-3 border-b border-border/50 last:border-0">
      {/* Timestamp */}
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles size={10} className="text-accent/60" />
        <span className="text-[10px] text-text-muted">
          {new Date(suggestion.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
        {suggestion.isStreaming && (
          <span className="flex gap-1 ml-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
        )}
      </div>

      {/* Content */}
      {suggestion.isStreaming && suggestion.text === '' ? (
        /* Skeleton while waiting for first token */
        <div className="space-y-2">
          <div className="h-3 bg-white/5 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {isAnswer ? (
            lines.map((line, i) => {
              const isFollowUp = line.startsWith('→')
              return (
                <p
                  key={i}
                  className={`
                    leading-relaxed text-[13px]
                    ${isFollowUp
                      ? 'text-gem-blue pl-2 border-l-2 border-gem-blue/40'
                      : 'text-text-primary'
                    }
                  `}
                >
                  {line}
                </p>
              )
            })
          ) : (
            <p className="text-text-primary text-[13px] leading-relaxed">
              {suggestion.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SuggestionFeed({ suggestions, isStreaming, hasApiKey }: SuggestionFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [suggestions])

  return (
    <div className="flex-1 overflow-y-auto">
      {suggestions.length === 0 && !isStreaming ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-full gap-4 px-6 py-10 text-center">
          {!hasApiKey ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <KeyRound size={20} className="text-accent/70" />
              </div>
              <div>
                <p className="text-text-secondary text-sm font-medium mb-1">No API Key</p>
                <p className="text-text-muted text-xs leading-relaxed">
                  Go to <span className="text-accent">Settings</span> and enter your Gemini API key to get started.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Bot size={20} className="text-accent/70" />
              </div>
              <div>
                <p className="text-text-secondary text-sm font-medium mb-1">Ready</p>
                <p className="text-text-muted text-xs leading-relaxed">
                  Type or paste the interviewer's question below.<br />
                  Gemini will stream live answer hints.
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {suggestions.map((s) => (
            <SuggestionItem key={s.id} suggestion={s} />
          ))}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
