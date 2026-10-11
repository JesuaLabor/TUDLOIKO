import { useEffect, useRef, useState } from 'react'
import type { Suggestion } from '../App'
import type { CoachCardData } from '../types/copilot'
import { cleanJsonText } from '../lib/gemini'
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
  Clock,
  Target,
  AlertTriangle,
  ShieldAlert,
  Zap,
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

function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[{}\[\]",]+$/.test(l))
}

// Render text with markdown bold support (**keyword**)
function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2)
      return (
        <strong key={index} className="font-semibold text-white/95">
          {boldText}
        </strong>
      )
    }
    return <span key={index}>{part}</span>
  })
}

// Render answer text with high-contrast glowing highlighted markdown bold (**phrase**)
export function renderHighlightedSayThis(text?: string) {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2)
      return (
        <span
          key={index}
          className="inline-block px-1.5 py-0.5 mx-0.5 rounded font-bold text-white bg-accent/25 border border-accent/40 shadow-xs shadow-accent/20 tracking-tight"
        >
          {boldText}
        </span>
      )
    }
    return <span key={index}>{part}</span>
  })
}

// Highlight STAR tokens in coach lines
function formatLine(line: string) {
  const cleanLine = line.replace(/^[•\-\*]\s*/, '')

  // Check for STAR headers or bullets
  const starMatch = cleanLine.match(/^(Situation|Task|Action|Result|S|T|A|R)\s*[:\-–]\s*(.+)/i)
  if (starMatch) {
    const label = starMatch[1].toUpperCase()
    const rest = starMatch[2]
    return (
      <span className="leading-relaxed">
        <span className="inline-block px-1.5 py-0.5 mr-1.5 text-[10px] font-bold rounded bg-accent/20 text-accent border border-accent/30 font-mono">
          {label}
        </span>
        <span className="text-text-primary">{renderFormattedText(rest)}</span>
      </span>
    )
  }

  // Normal bullet point or text
  return <span className="text-text-primary leading-relaxed">{renderFormattedText(cleanLine)}</span>
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

const TYPE_CONFIG: Record<string, { label: string; badge: string }> = {
  small_talk: { label: 'Small Talk / Greeting', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' },
  behavioral: { label: 'Behavioral', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/35' },
  technical_concept: { label: 'Technical Concept', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/35' },
  technical_problem: { label: 'Technical Problem', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/35' },
  situational: { label: 'Situational', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/35' },
  motivational: { label: 'Motivational', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/35' },
  self_intro: { label: 'Elevator Pitch', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' },
  strengths_weaknesses: { label: 'Strengths / Weaknesses', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35' },
  salary_logistics: { label: 'Salary & Logistics', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/35' },
  no_experience: { label: 'Honest Bridge', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/35' },
  clarification_needed: { label: 'Clarify Question', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/35' },
  inappropriate: { label: 'Polite Redirect', badge: 'bg-red-500/20 text-red-300 border-red-500/35' },
}

const CATEGORY_COLORS: Record<string, { badge: string }> = {
  'greeting / small talk': { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' },
  'greeting': { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' },
  'small talk': { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35' },
  'elevator pitch': { badge: 'bg-purple-500/20 text-purple-300 border-purple-500/35' },
  'behavioral': { badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35' },
  'technical': { badge: 'bg-blue-500/20 text-blue-300 border-blue-500/35' },
  'motivation': { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/35' },
  'salary': { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/35' },
  'unclear': { badge: 'bg-orange-500/20 text-orange-300 border-orange-500/35' },
}

export function recoverMalformedCoachJson(raw: string): CoachCardData | null {
  if (!raw) return null
  const qMatch = raw.match(/"question_clean"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
  const catMatch = raw.match(/"category"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
  const diffMatch = raw.match(/"difficulty"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
  const mainPointMatch = raw.match(/"main_point"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
  const stratMatch = raw.match(/"strategy_cue"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)

  const options: { label: string; say_this: string }[] = []

  const shortMatch = raw.match(
    /(?:"label"\s*:\s*"Short"[^}]*?"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?"label"\s*:\s*"Short"|"Short"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")/i
  )
  if (shortMatch) {
    const text = shortMatch[1] || shortMatch[2] || shortMatch[3]
    if (text) options.push({ label: 'Short', say_this: text.replace(/\\"/g, '"').trim() })
  }

  const balancedMatch = raw.match(
    /(?:"label"\s*:\s*"Balanced"[^}]*?"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?"label"\s*:\s*"Balanced"|"Balanced"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")/i
  )
  if (balancedMatch) {
    const text = balancedMatch[1] || balancedMatch[2] || balancedMatch[3]
    if (text) options.push({ label: 'Balanced', say_this: text.replace(/\\"/g, '"').trim() })
  }

  const detailedMatch = raw.match(
    /(?:"label"\s*:\s*"Detailed"[^}]*?"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"|"say_this"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?"label"\s*:\s*"Detailed"|"Detailed"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")/i
  )
  if (detailedMatch) {
    const text = detailedMatch[1] || detailedMatch[2] || detailedMatch[3]
    if (text) options.push({ label: 'Detailed', say_this: text.replace(/\\"/g, '"').trim() })
  }

  const keyPhrasesMatch = raw.match(/"key_phrases"\s*:\s*\[([^\]]*)\]/i)
  const key_phrases: string[] = []
  if (keyPhrasesMatch) {
    const rawItems = keyPhrasesMatch[1].match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)
    if (rawItems) {
      rawItems.forEach((item) => key_phrases.push(item.replace(/^"|"$/g, '').replace(/\\"/g, '"')))
    }
  }

  if (options.length > 0 || mainPointMatch) {
    return {
      question_clean: qMatch ? qMatch[1].replace(/\\"/g, '"') : '',
      category: catMatch ? catMatch[1].replace(/\\"/g, '"') : 'Behavioral',
      difficulty: diffMatch ? (diffMatch[1].toLowerCase() as any) : undefined,
      main_point: mainPointMatch ? mainPointMatch[1].replace(/\\"/g, '"') : undefined,
      strategy_cue: stratMatch ? stratMatch[1].replace(/\\"/g, '"') : undefined,
      key_phrases: key_phrases.length > 0 ? key_phrases : undefined,
      options,
    }
  }
  return null
}

export function tryParseCoachJson(raw: string): CoachCardData | null {
  if (!raw) return null
  const cleaned = cleanJsonText(raw)
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = cleaned.substring(firstBrace, lastBrace + 1)
      const parsed = JSON.parse(jsonStr)
      if (parsed && typeof parsed === 'object') {
        // If options is an object like { Short: "...", Balanced: "...", Detailed: "..." }
        if (parsed.options && !Array.isArray(parsed.options) && typeof parsed.options === 'object') {
          parsed.options = Object.entries(parsed.options).map(([label, val]: [string, any]) => ({
            label,
            say_this: typeof val === 'string' ? val : (val && typeof val === 'object' && val.say_this ? String(val.say_this) : JSON.stringify(val))
          }))
        }

        // If options is an array, normalize each item to { label, say_this }
        if (Array.isArray(parsed.options)) {
          parsed.options = parsed.options.map((opt: any, idx: number) => {
            const fallbackLabels = ['Short', 'Balanced', 'Detailed']
            if (typeof opt === 'string') {
              return { label: fallbackLabels[idx] || `Option ${idx + 1}`, say_this: opt }
            }
            if (opt && typeof opt === 'object') {
              const keys = Object.keys(opt)
              if (opt.say_this) {
                return {
                  label: opt.label || fallbackLabels[idx] || `Option ${idx + 1}`,
                  say_this: String(opt.say_this)
                }
              }
              const matchedKey = keys.find((k) => ['short', 'balanced', 'detailed'].includes(k.toLowerCase()))
              if (matchedKey) {
                return {
                  label: matchedKey.charAt(0).toUpperCase() + matchedKey.slice(1).toLowerCase(),
                  say_this: String(opt[matchedKey])
                }
              }
              return {
                label: opt.label || fallbackLabels[idx] || `Option ${idx + 1}`,
                say_this: String(Object.values(opt)[0] || '')
              }
            }
            return { label: fallbackLabels[idx] || `Option ${idx + 1}`, say_this: String(opt) }
          })
        }

        if (parsed.options || parsed.category || parsed.type || parsed.body || parsed.question_clean || parsed.reply) {
          return parsed as CoachCardData
        }
      }
    } catch {
      // Incomplete or malformed JSON - fallback to regex recovery
    }
  }

  // Regex recovery fallback for malformed JSON
  return recoverMalformedCoachJson(raw)
}

function formatCardForClipboard(data: CoachCardData): string {
  const parts: string[] = []
  if (data.question_clean) {
    parts.push(`[QUESTION] ${data.question_clean}`)
  }
  if (data.main_point) {
    parts.push(`[⚡ CORE MAIN POINT]\n"${data.main_point.replace(/\*\*/g, '')}"`)
  }
  if (data.strategy_cue) {
    parts.push(`[TACTICAL STRATEGY]\n${data.strategy_cue}`)
  }
  if (data.key_phrases && data.key_phrases.length > 0) {
    parts.push(`[KEY ANCHORS]\n${data.key_phrases.join(', ')}`)
  }
  if (data.options && data.options.length > 0) {
    parts.push(
      '--- READY-TO-SAY ANSWERS ---',
      ...data.options.map((opt) => `• ${opt.label.toUpperCase()}:\n"${opt.say_this.replace(/\*\*/g, '')}"`)
    )
    return parts.join('\n\n')
  }

  if (data.type === 'small_talk') {
    const reply = data.reply || data.body?.reply || ''
    return `[GREETING] ${data.question_clean || ''}\nReply: ${reply}`
  }

  parts.push(`[${(data.type || 'ANSWER').toUpperCase()}] ${data.question_clean || ''}`)
  if (data.intent) parts.push(`Intent: ${data.intent}`)
  if (data.body) {
    parts.push('--- TALKING POINTS ---')
    for (const [k, v] of Object.entries(data.body)) {
      const label = k.replace(/_/g, ' ').toUpperCase()
      if (Array.isArray(v)) {
        parts.push(`${label}:\n${v.map((item) => `• ${item}`).join('\n')}`)
      } else {
        parts.push(`${label}: ${v}`)
      }
    }
  }
  if (data.watch_outs?.length) {
    parts.push(`WATCH OUTS:\n${data.watch_outs.map((w) => `• ${w}`).join('\n')}`)
  }
  if (data.ask_them) {
    parts.push(`REVERSE QUESTION: ${data.ask_them}`)
  }
  return parts.join('\n\n')
}

function AnswerOptionsCard({ data, timestamp }: { data: CoachCardData; timestamp: number }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  const catKey = (data.category || '').toLowerCase().trim()
  const catColor = CATEGORY_COLORS[catKey] || {
    badge: 'bg-accent/20 text-accent border-accent/30',
  }

  const isTricky = data.difficulty === 'tricky'
  const isChallenging = data.difficulty === 'challenging'

  const handleCopyOption = (text: string, index: number) => {
    navigator.clipboard.writeText(text.replace(/\*\*/g, ''))
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 1600)
  }

  const handleCopyAll = () => {
    const textToCopy = formatCardForClipboard(data)
    navigator.clipboard.writeText(textToCopy)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1600)
  }

  return (
    <div className={`suggestion-enter mb-4 px-3.5 py-3 rounded-xl bg-surface-card/95 border shadow-md transition-all space-y-3 ${
      isTricky
        ? 'border-amber-500/40 hover:border-amber-500/60 shadow-amber-500/5'
        : isChallenging
        ? 'border-purple-500/40 hover:border-purple-500/60 shadow-purple-500/5'
        : 'border-border/80 hover:border-accent/40'
    }`}>
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="w-5 h-5 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <Bot size={12} className="text-accent" />
          </div>
          <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
            TUDLOIKO Coach
          </span>
          {data.category && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${catColor.badge}`}>
              {data.category}
            </span>
          )}
          {data.difficulty && data.difficulty !== 'standard' && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 ${
              isTricky
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
            }`}>
              <AlertTriangle size={10} className={isTricky ? 'text-amber-400' : 'text-purple-300'} />
              {isTricky ? 'Tricky Question' : 'Challenging Question'}
            </span>
          )}
          <span className="text-[10px] text-text-muted flex items-center gap-1 font-mono">
            <Sparkles size={10} className="text-accent/80" /> 3 Ready Options
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopyAll}
            title="Copy all 3 answer options and main point"
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors border border-border/30"
          >
            {copiedAll ? (
              <>
                <Check size={10} className="text-green-400" />
                <span className="text-green-400 font-medium">Copied All</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span>Copy All</span>
              </>
            )}
          </button>
          <span className="text-[10px] text-text-muted">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Cleaned Question */}
      {data.question_clean && (
        <div className="text-[12px] text-text-secondary font-medium pl-2.5 border-l-2 border-accent/60 py-0.5 italic">
          "{data.question_clean}"
        </div>
      )}

      {/* ── Core Main Point Hero Callout ─────────────────────────── */}
      {data.main_point && (
        <div className={`p-3 rounded-xl border transition-all ${
          isTricky
            ? 'bg-gradient-to-br from-amber-500/15 via-amber-950/20 to-black/30 border-amber-500/40 shadow-sm shadow-amber-500/10'
            : isChallenging
            ? 'bg-gradient-to-br from-purple-500/15 via-blue-950/20 to-black/30 border-purple-500/40 shadow-sm shadow-purple-500/10'
            : 'bg-gradient-to-br from-emerald-500/12 via-slate-900/40 to-black/30 border-emerald-500/35'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Zap size={13} className={isTricky ? 'text-amber-400' : isChallenging ? 'text-purple-400' : 'text-emerald-400'} />
              <span className={`text-[10px] font-extrabold tracking-wider uppercase ${
                isTricky ? 'text-amber-300' : isChallenging ? 'text-purple-300' : 'text-emerald-300'
              }`}>
                Core Main Point
              </span>
              <span className="text-[9px] text-text-muted font-mono">
                1-Sec Glance
              </span>
            </div>
            <button
              onClick={() => handleCopyOption(data.main_point!, 99)}
              className="text-[10px] text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1"
              title="Copy core main point"
            >
              {copiedIndex === 99 ? (
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
          </div>

          {/* Main Point Text with Glowing Highlights */}
          <p className="text-[13px] font-semibold text-white/95 leading-relaxed">
            {renderHighlightedSayThis(data.main_point)}
          </p>

          {/* Strategy Cue for Difficult / Tricky Questions */}
          {data.strategy_cue && (
            <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-1.5 text-[11px] text-amber-200/90 font-medium">
              <ShieldAlert size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-amber-300 uppercase tracking-wider text-[9px] mr-1 font-bold">Strategy:</strong>
                {data.strategy_cue}
              </span>
            </div>
          )}

          {/* Key Anchor Phrases */}
          {data.key_phrases && data.key_phrases.length > 0 && (
            <div className="mt-2 pt-1 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] text-text-muted font-mono uppercase tracking-wide">Key Anchors:</span>
              {data.key_phrases.map((phrase, pIdx) => (
                <span
                  key={pIdx}
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-white/10 text-white/95 border border-white/15 font-mono shadow-xs"
                >
                  {phrase}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3 Answer Options Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-0.5">
        {data.options.map((opt, idx) => {
          const isShort = opt.label.toLowerCase().includes('short')
          const isBalanced = opt.label.toLowerCase().includes('balanced')
          const isDetailed = opt.label.toLowerCase().includes('detailed')

          const badgeClass = isShort
            ? 'bg-blue-500/20 text-blue-300 border-blue-500/35'
            : isBalanced
            ? 'bg-purple-500/20 text-purple-300 border-purple-500/35'
            : isDetailed
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
            : 'bg-accent/20 text-accent border-accent/30'

          const lengthHint = isShort
            ? '≤ 20 words · Punchy'
            : isBalanced
            ? '≤ 40 words · Conversational'
            : isDetailed
            ? '≤ 70 words · In-depth'
            : ''

          const wordCount = opt.say_this.trim().split(/\s+/).filter(Boolean).length

          return (
            <div
              key={idx}
              className="p-3 rounded-xl bg-white/[0.03] border border-border/70 hover:border-accent/40 hover:bg-white/[0.05] transition-all flex flex-col justify-between space-y-2 group/opt"
            >
              {/* Option Subheader */}
              <div className="flex items-center justify-between text-[10px] gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full font-bold border ${badgeClass}`}>
                    {opt.label}
                  </span>
                  <span className="text-text-muted font-mono text-[9px]">{lengthHint}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] font-mono text-text-muted">
                    {wordCount}w
                  </span>
                  <button
                    onClick={() => handleCopyOption(opt.say_this, idx)}
                    className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                    title={`Copy "${opt.label}" answer`}
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check size={11} className="text-green-400" />
                        <span className="text-[9px] text-green-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={11} />
                        <span className="text-[9px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Ready-to-say Spoken Answer with luminous bold keyword highlights */}
              <p className="text-[13px] text-text-primary font-medium leading-relaxed selection:bg-accent/30 flex-1">
                "{renderHighlightedSayThis(opt.say_this)}"
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StructuredCoachCard({ data, timestamp }: { data: CoachCardData; timestamp: number }) {
  // If the card has the 3 answer options, render AnswerOptionsCard!
  if (data.options && Array.isArray(data.options) && data.options.length > 0) {
    return <AnswerOptionsCard data={data} timestamp={timestamp} />
  }

  const [copied, setCopied] = useState(false)
  const typeKey = (data.type || '').toLowerCase()
  const typeCfg = TYPE_CONFIG[typeKey] || {
    label: (data.type || 'Coach Cue').replace(/_/g, ' ').toUpperCase(),
    badge: 'bg-accent/20 text-accent border-accent/30',
  }

  const handleCopy = () => {
    const textToCopy = formatCardForClipboard(data)
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // Small Talk / Greeting: Concise, one-sentence reply without heavy cards
  if (data.type === 'small_talk') {
    const replyText = data.reply || data.body?.reply || 'I am doing well, thank you! Excited to be here today.'
    return (
      <div className="suggestion-enter mb-3 px-3.5 py-2.5 rounded-xl bg-surface-card/95 border border-emerald-500/30 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Bot size={12} className="text-emerald-400" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
              TUDLOIKO Coach
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-emerald-500/20 text-emerald-300 border-emerald-500/35">
              Greeting / Small Talk
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              title="Copy reply"
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
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {data.question_clean && (
          <div className="text-[11px] text-text-muted italic pl-2 border-l border-emerald-500/40">
            "{data.question_clean}"
          </div>
        )}

        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-text-primary text-[13px] font-medium leading-relaxed">
          "{replyText}"
        </div>
      </div>
    )
  }

  return (
    <div className="suggestion-enter mb-4 px-3.5 py-3 rounded-xl bg-surface-card/95 border border-border/80 shadow-md hover:border-accent/40 transition-all space-y-2.5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="w-5 h-5 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <Bot size={12} className="text-accent" />
          </div>
          <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
            TUDLOIKO Coach
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${typeCfg.badge}`}>
            {typeCfg.label}
          </span>
          {data.target_seconds && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-border/40 text-text-muted flex items-center gap-1 font-mono">
              <Clock size={10} className="text-accent/70" /> ~{data.target_seconds}s
            </span>
          )}
          {data.depth && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-border/30 text-text-muted capitalize">
              {data.depth}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            title="Copy answer cues"
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
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Cleaned Question */}
      {data.question_clean && (
        <div className="text-[12px] text-text-primary/95 font-medium pl-2.5 border-l-2 border-accent/60 py-0.5 italic">
          "{data.question_clean}"
        </div>
      )}

      {/* Special Banner for Inappropriate Question */}
      {data.type === 'inappropriate' && (
        <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 flex items-start gap-2 text-red-300 text-[12px]">
          <ShieldAlert size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-red-200 block text-[11px] uppercase tracking-wider mb-0.5">
              Inappropriate / Non-Job-Relevant Question
            </span>
            <span>Use the polite redirect below to pivot smoothly back to your qualifications.</span>
          </div>
        </div>
      )}

      {/* Special Banner for Clarification Needed */}
      {data.type === 'clarification_needed' && (
        <div className="p-2.5 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-start gap-2 text-orange-300 text-[12px]">
          <HelpCircle size={15} className="text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-orange-200 block text-[11px] uppercase tracking-wider mb-0.5">
              Clarification Recommended
            </span>
            <span>The question was unclear or incomplete. Ask the interviewer to clarify before answering.</span>
          </div>
        </div>
      )}

      {/* Evaluated Intent & Matched Story */}
      {(data.intent || data.source?.story_title) && (
        <div className="flex items-center gap-2 flex-wrap text-[11px] pt-0.5">
          {data.intent && (
            <div className="flex items-center gap-1 text-text-secondary bg-white/5 px-2 py-0.5 rounded-md border border-border/40">
              <Target size={11} className="text-accent flex-shrink-0" />
              <span><strong className="text-text-primary font-medium">Intent:</strong> {data.intent}</span>
            </div>
          )}
          {data.source?.story_title && (
            <div className="flex items-center gap-1 text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/25">
              <BookMarked size={11} className="text-amber-400 flex-shrink-0" />
              <span><strong className="font-semibold">Story:</strong> {data.source.story_title}</span>
            </div>
          )}
        </div>
      )}

      {/* Answer Cues Body */}
      {data.body && (
        <div className="space-y-2 pt-1">
          {Object.entries(data.body).map(([key, val]) => {
            const formattedLabel = key.replace(/_/g, ' ').toUpperCase()
            return (
              <div key={key} className="flex items-start gap-2 text-[12px] leading-relaxed">
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold rounded bg-accent/20 text-accent border border-accent/30 font-mono tracking-wider flex-shrink-0 mt-0.5">
                  {formattedLabel}
                </span>
                <div className="flex-1 min-w-0 text-text-primary">
                  {Array.isArray(val) ? (
                    <ul className="space-y-1">
                      {val.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-accent mt-2 flex-shrink-0" />
                          <span>{renderFormattedText(String(item))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>{renderFormattedText(String(val))}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Gap Warning */}
      {data.gap_warning && (
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <span><strong>Gap Warning:</strong> {data.gap_warning}</span>
        </div>
      )}

      {/* Watch Outs */}
      {data.watch_outs && data.watch_outs.length > 0 && (
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[11px] space-y-1">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
            <ShieldAlert size={11} /> Watch Outs
          </div>
          <ul className="space-y-0.5 pl-3 list-disc text-red-300/90">
            {data.watch_outs.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Likely Follow-ups */}
      {data.likely_followups && data.likely_followups.length > 0 && (
        <div className="p-2 rounded-lg bg-white/5 border border-border/40 text-[11px] space-y-1.5">
          <div className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={11} /> Likely Follow-ups to Expect
          </div>
          <div className="space-y-1">
            {data.likely_followups.map((f, idx) => (
              <div key={idx} className="pl-2 border-l-2 border-accent/40 text-[11px]">
                <p className="font-medium text-text-primary">"{f.question}"</p>
                <p className="text-[10px] text-text-muted mt-0.5">💡 Prep: {f.prep_hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ask Them */}
      {data.ask_them && (
        <div className="p-2 rounded-lg bg-gem-blue/10 border border-gem-blue/25 text-[12px] flex items-start gap-1.5 text-gem-blue">
          <ArrowRight size={13} className="mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider block text-gem-blue/80">
              Ask Interviewer (Reverse Question)
            </span>
            <span className="font-medium text-text-primary text-[11px]">"{data.ask_them}"</span>
          </div>
        </div>
      )}
    </div>
  )
}

function CoachMessageCard({ suggestion }: { suggestion: Suggestion }) {
  // If suggestion text is valid JSON matching CoachCardData, render StructuredCoachCard
  const structuredData = tryParseCoachJson(suggestion.text)
  if (structuredData) {
    return <StructuredCoachCard data={structuredData} timestamp={suggestion.timestamp} />
  }

  // If streaming JSON in progress, render a sleek streaming preview
  const isStreamingJson =
    suggestion.isStreaming &&
    (suggestion.text.includes('{') ||
      suggestion.text.includes('"question_clean"') ||
      suggestion.text.includes('"type"') ||
      suggestion.text.includes('"category"') ||
      suggestion.text.includes('"options"'))

  if (isStreamingJson) {
    const interimCategory = suggestion.text.match(/"category"\s*:\s*"([^"]+)"/)?.[1]
    const interimType = suggestion.text.match(/"type"\s*:\s*"([^"]+)"/)?.[1]
    const interimIntent = suggestion.text.match(/"intent"\s*:\s*"([^"]+)"/)?.[1]
    const interimCleanQ = suggestion.text.match(/"question_clean"\s*:\s*"([^"]+)"/)?.[1]
    const catKey = (interimCategory || '').toLowerCase().trim()
    const catColor = CATEGORY_COLORS[catKey] || {
      badge: 'bg-accent/20 text-accent border-accent/30',
    }
    const typeCfg = interimType ? TYPE_CONFIG[interimType.toLowerCase()] : null

    return (
      <div className="suggestion-enter mb-4 px-3.5 py-3 rounded-xl bg-surface-card/95 border border-accent/40 shadow-md space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-5 h-5 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Bot size={12} className="text-accent animate-pulse" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
              TUDLOIKO Coach
            </span>
            {interimCategory ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${catColor.badge}`}>
                {interimCategory}
              </span>
            ) : typeCfg ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${typeCfg.badge}`}>
                {typeCfg.label}
              </span>
            ) : null}
            <span className="text-[10px] text-accent flex items-center gap-1 font-mono">
              <Loader2 size={11} className="animate-spin text-accent" />
              <span>Generating 3 answer options…</span>
            </span>
          </div>
          <span className="text-[10px] text-text-muted">
            {new Date(suggestion.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {interimCleanQ && (
          <div className="text-[12px] text-text-primary font-medium pl-2.5 border-l-2 border-accent/60 italic">
            "{interimCleanQ}"
          </div>
        )}

        {interimIntent && (
          <div className="flex items-center gap-1 text-[11px] text-text-secondary bg-white/5 px-2 py-1 rounded-md border border-border/40">
            <Target size={11} className="text-accent flex-shrink-0" />
            <span><strong className="text-text-primary font-medium">Intent:</strong> {interimIntent}</span>
          </div>
        )}

        {/* Pulse skeleton for the 3 incoming options */}
        <div className="space-y-2 py-0.5">
          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Short
              </span>
              <span className="text-[9px] text-text-muted font-mono">≤ 20 words</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded animate-pulse w-3/4" />
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Balanced
              </span>
              <span className="text-[9px] text-text-muted font-mono">≤ 40 words</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded animate-pulse w-5/6" />
          </div>

          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Detailed
              </span>
              <span className="text-[9px] text-text-muted font-mono">≤ 70 words</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded animate-pulse w-2/3" />
          </div>
        </div>
      </div>
    )
  }

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
              const isFollowUp = line.startsWith('→') || line.includes('→')
              if (isFollowUp) {
                const cleanFollowUp = line.replace(/^[•\-\*]?\s*→\s*/, '')
                return (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 p-2 rounded-lg bg-gem-blue/10 border border-gem-blue/25 text-gem-blue text-[12px]"
                  >
                    <ArrowRight size={12} className="mt-0.5 flex-shrink-0 text-gem-blue" />
                    <span className="font-medium text-gem-blue/95">
                      {renderFormattedText(cleanFollowUp)}
                    </span>
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
                <p className="text-[10px] text-text-muted">Processing audio with Gemini…</p>
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
                  Recording question. Click <span className="text-red-400 font-semibold">Stop to Answer</span> when the interviewer finishes to generate talking points directly.
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
