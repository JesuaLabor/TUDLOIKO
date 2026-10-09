import { useEffect, useRef, useState } from 'react'
import type { Suggestion } from '../App'
import {
  Sparkles,
  KeyRound,
  Bot,
  User,
  Copy,
  Check,
  BookMarked,
  HelpCircle,
  ArrowRight,
  Loader2,
  Mic,
  Volume2,
} from 'lucide-react'

interface SuggestionFeedProps {
  suggestions: Suggestion[]
  isStreaming: boolean
  isListening?: boolean
  isProcessingAudio?: boolean
  audioLevel?: number
  liveInterimText?: string
  hasApiKey: boolean
  onSelectPracticeQuestion?: (question: string) => void
}

// Parse bullet lines from Gemini output
function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

// Highlight STAR tokens in coach lines
function formatLine(line: string) {
  // Check for STAR headers or bullets
  const starMatch = line.match(/^(Situation|Task|Action|Result|S|T|A|R)\s*[:\-–]\s*(.+)/i)
  if (starMatch) {
    const label = starMatch[1].toUpperCase()
    const rest = starMatch[2]
    return (
      <span className="leading-relaxed">
        <span className="inline-block px-1.5 py-0.2 mr-1.5 text-[10px] font-bold rounded bg-accent/20 text-accent border border-accent/30">
          {label}
        </span>
        <span className="text-text-primary">{rest}</span>
      </span>
    )
  }

  // Normal bullet point or text
  const cleanLine = line.replace(/^[•\-\*]\s*/, '')
  return <span className="text-text-primary">{cleanLine}</span>
}

function InterviewerMessageCard({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div className="suggestion-enter mb-3 px-3 py-2.5 rounded-xl bg-gem-blue/8 border border-gem-blue/20 transition-all hover:border-gem-blue/35">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-lg bg-gem-blue/20 border border-gem-blue/30 flex items-center justify-center">
            <User size={11} className="text-gem-blue" />
          </div>
          <span className="text-[10px] font-bold tracking-wider text-gem-blue uppercase">
            Interviewer Question
          </span>
        </div>
        <span className="text-[10px] text-text-muted">
          {new Date(suggestion.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>

      {/* Spoken / Transcribed Question */}
      <div className="pl-6 border-l-2 border-gem-blue/40 ml-2">
        <p className="text-[13px] font-medium text-text-primary leading-relaxed italic">
          "{suggestion.text}"
        </p>
      </div>
    </div>
  )
}

function CoachMessageCard({ suggestion }: { suggestion: Suggestion }) {
  const [copied, setCopied] = useState(false)
  const lines = parseBullets(suggestion.text)
  const isAnswer = !suggestion.isStreaming && lines.length > 0

  const handleCopy = () => {
    if (!suggestion.text) return
    navigator.clipboard.writeText(suggestion.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="suggestion-enter mb-4 px-3.5 py-3 rounded-xl bg-surface-card/90 border border-border/80 shadow-sm relative group hover:border-accent/40 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Bot size={12} className="text-accent" />
          </div>
          <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
            TUDLOIKO Coach
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-border/40 font-mono">
            STAR Talking Points
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            title="Copy answer talking points"
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors border border-border/30"
          >
            {copied ? (
              <>
                <Check size={10} className="text-green-400" />
                <span className="text-green-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span>Copy</span>
              </>
            )}
          </button>
          <span className="text-[10px] text-text-muted">
            {new Date(suggestion.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      {/* Surfaced Story Bank Match Banner if linked */}
      {suggestion.matchedStoryTitle && (
        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-1.5 text-[11px]">
          <BookMarked size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-amber-300">
              Matched Story: {suggestion.matchedStoryTitle}
            </span>
            {suggestion.starCue && (
              <p className="text-[10px] text-text-secondary mt-0.5">
                <span className="text-amber-400 font-medium">Cue:</span> {suggestion.starCue}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {suggestion.isStreaming && suggestion.text === '' ? (
        /* Skeleton waiting for stream */
        <div className="space-y-2 py-1">
          <div className="h-3 bg-white/5 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-white/5 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
        </div>
      ) : (
        <div className="space-y-2 text-[13px] leading-relaxed">
          {isAnswer ? (
            lines.map((line, i) => {
              const isFollowUp = line.startsWith('→')
              if (isFollowUp) {
                return (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 p-2 rounded-lg bg-gem-blue/10 border border-gem-blue/25 text-gem-blue text-[12px]"
                  >
                    <ArrowRight size={12} className="mt-0.5 flex-shrink-0" />
                    <span className="font-medium">{line.replace(/^→\s*/, '')}</span>
                  </div>
                )
              }
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/60 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">{formatLine(line)}</div>
                </div>
              )
            })
          ) : (
            <p className="text-text-primary whitespace-pre-wrap">{suggestion.text}</p>
          )}

          {suggestion.isStreaming && (
            <div className="flex items-center gap-1.5 pt-1 text-accent text-xs">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="text-[10px] text-text-muted ml-1">Streaming answer…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SAMPLE_PRACTICE_QUESTIONS = [
  'Tell me about yourself and your background.',
  'Describe a time you solved a high-pressure technical problem.',
  'Tell me about a disagreement you had with a team member and how you resolved it.',
]

export default function SuggestionFeed({
  suggestions,
  isStreaming,
  isListening,
  isProcessingAudio,
  audioLevel = 0,
  liveInterimText,
  hasApiKey,
  onSelectPracticeQuestion,
}: SuggestionFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when new message arrives or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [suggestions, isStreaming, isProcessingAudio, liveInterimText])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col">
      {suggestions.length === 0 && !isStreaming && !isListening && !isProcessingAudio ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 py-8 text-center my-auto">
          {!hasApiKey ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <KeyRound size={20} className="text-accent/70" />
              </div>
              <div>
                <p className="text-text-secondary text-sm font-medium mb-1">API Key Needed</p>
                <p className="text-text-muted text-xs leading-relaxed max-w-xs">
                  Go to <span className="text-accent font-semibold">Settings</span> and enter your Gemini API key to activate live interview assistance.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent/20 to-gem-blue/20 border border-accent/30 flex items-center justify-center">
                <Sparkles size={22} className="text-accent" />
              </div>
              <div className="max-w-xs">
                <p className="text-text-secondary text-sm font-semibold mb-1">
                  Interview Dialogue Ready
                </p>
                <p className="text-text-muted text-[11px] leading-relaxed">
                  When the interviewer asks a question, TUDLOIKO displays the question here and instantly generates structured STAR talking points.
                </p>
              </div>

              {/* Sample test buttons */}
              {onSelectPracticeQuestion && (
                <div className="w-full max-w-sm space-y-1.5 pt-2">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold text-left px-1">
                    Try a sample question:
                  </p>
                  {SAMPLE_PRACTICE_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => onSelectPracticeQuestion(q)}
                      className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-border/50 hover:border-accent/40 text-[11px] text-text-secondary hover:text-text-primary transition-all flex items-center justify-between group"
                    >
                      <span className="truncate flex-1">{q}</span>
                      <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 text-accent transition-opacity ml-1 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          {/* Conversation stream */}
          {suggestions.map((s) => {
            if (s.role === 'interviewer') {
              return <InterviewerMessageCard key={s.id} suggestion={s} />
            }
            return <CoachMessageCard key={s.id} suggestion={s} />
          })}

          {/* Live audio transcribing / listening indicator banner */}
          {isProcessingAudio && (
            <div className="suggestion-enter mb-3 p-3 rounded-xl bg-accent/15 border border-accent/30 flex items-center gap-2.5 animate-pulse text-xs text-accent">
              <Loader2 size={14} className="animate-spin flex-shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold">Transcribing question & crafting STAR talking points…</span>
                <p className="text-[10px] text-text-muted">Analyzing audio with Gemini 3.5 Flash</p>
              </div>
            </div>
          )}

          {isListening && !isProcessingAudio && (
            <div className="suggestion-enter mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                    <Mic size={11} /> Listening to Interviewer…
                  </span>
                </div>
                {/* Visual audio volume indicator */}
                <div className="flex items-center gap-0.5 h-3">
                  {[...Array(6)].map((_, idx) => (
                    <div
                      key={idx}
                      className="w-1 bg-red-400/80 rounded-full transition-all duration-75"
                      style={{
                        height: `${Math.max(3, Math.min(12, (audioLevel / 100) * 16 * ((idx % 3) + 1)))}px`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {liveInterimText ? (
                <div className="pl-4 border-l-2 border-red-400/50 py-0.5">
                  <p className="text-[12px] text-text-primary italic animate-pulse">
                    "{liveInterimText}…"
                  </p>
                </div>
              ) : (
                <p className="text-[10px] text-text-muted">
                  Listening to audio. Click <span className="text-red-400 font-semibold">Stop</span> when the interviewer finishes to generate answer instantly.
                </p>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
