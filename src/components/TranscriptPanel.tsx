import { useEffect, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import type { TranscriptEntry } from '../lib/stt'

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  isListening: boolean
}

function speakerLabel(speaker: TranscriptEntry['speaker']): { label: string; cls: string } {
  switch (speaker) {
    case 'them': return { label: 'Interviewer', cls: 'text-gem-blue' }
    case 'you':  return { label: 'You', cls: 'text-accent-light' }
    default:     return { label: '~', cls: 'text-text-muted' }
  }
}

export default function TranscriptPanel({ entries, isListening }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="flex-1 overflow-y-auto">
      {entries.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-8 text-center">
          <div
            className={`
              w-12 h-12 rounded-2xl border flex items-center justify-center
              ${isListening
                ? 'bg-red-500/10 border-red-500/30 recording-ring'
                : 'bg-white/5 border-border'
              }
            `}
          >
            {isListening
              ? <Mic size={18} className="text-red-400" />
              : <MicOff size={18} className="text-text-muted" />
            }
          </div>
          <div>
            <p className="text-text-secondary text-sm font-medium mb-1">
              {isListening ? 'Listening…' : 'No Transcript Yet'}
            </p>
            <p className="text-text-muted text-xs leading-relaxed">
              {isListening
                ? 'Speak or let the interviewer ask a question. Gemini will transcribe and generate suggestions automatically.'
                : 'Press Record in the Copilot tab to start capturing audio.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="py-2">
          {entries.map((entry) => {
            const { label, cls } = speakerLabel(entry.speaker)
            const isNoSpeech = entry.text.toLowerCase().includes('(no speech)')
            if (isNoSpeech) return null // skip silent chunks
            return (
              <div
                key={entry.id}
                className="suggestion-enter px-4 py-2 border-b border-border/40 last:border-0"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] font-semibold ${cls}`}>{label}</span>
                  <span className="text-[10px] text-text-muted">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-text-primary text-[12px] leading-relaxed">{entry.text}</p>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
