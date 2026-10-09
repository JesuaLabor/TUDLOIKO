import { useEffect, useRef } from 'react'
import { Mic, MicOff, Radio, Info } from 'lucide-react'
import type { TranscriptEntry } from '../lib/stt'

interface TranscriptPanelProps {
  entries: TranscriptEntry[]
  isListening: boolean
  isMonitorSource?: boolean
  onSwitchToMonitor?: () => void
  onSwitchToMic?: () => void
}

function speakerLabel(speaker: TranscriptEntry['speaker']): { label: string; cls: string } {
  switch (speaker) {
    case 'them': return { label: 'Interviewer', cls: 'text-gem-blue' }
    case 'you':  return { label: 'You', cls: 'text-accent-light' }
    default:     return { label: '~', cls: 'text-text-muted' }
  }
}

export default function TranscriptPanel({
  entries,
  isListening,
  isMonitorSource,
  onSwitchToMonitor,
  onSwitchToMic,
}: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {entries.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 py-6 text-center">
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

          <div className="max-w-xs space-y-1">
            <p className="text-text-secondary text-sm font-semibold">
              {isListening ? 'Listening for speech…' : 'No Transcript Yet'}
            </p>
            <p className="text-text-muted text-[11px] leading-relaxed">
              {isListening
                ? 'Speak or play interview audio. When a question is detected, Gemini transcribes and generates talking points automatically.'
                : 'Press Record to start listening to the conversation.'
              }
            </p>
          </div>

          {/* YouTube / System Audio Tip Card */}
          <div className="mt-2 p-3 rounded-xl bg-gem-blue/10 border border-gem-blue/25 text-left max-w-sm space-y-2">
            <div className="flex items-center gap-1.5 text-gem-blue text-[11px] font-semibold">
              <Info size={12} className="flex-shrink-0" />
              <span>Playing YouTube or on a Zoom/Meet call?</span>
            </div>
            <p className="text-text-muted text-[10px] leading-relaxed">
              By default, TUDLOIKO listens to your <span className="text-text-primary font-medium">Physical Microphone</span>.
              To capture sound from YouTube, Zoom, or Google Meet, switch to your computer's <span className="text-gem-blue font-medium">📻 System Audio (Monitor)</span> source.
            </p>

            <div className="pt-1 flex items-center gap-2">
              {!isMonitorSource && onSwitchToMonitor && (
                <button
                  onClick={onSwitchToMonitor}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gem-blue/20 border border-gem-blue/35 text-gem-blue text-[10px] font-semibold hover:bg-gem-blue/30 active:scale-95 transition-all"
                >
                  <Radio size={10} />
                  <span>Switch to System Audio (Monitor)</span>
                </button>
              )}
              {isMonitorSource && onSwitchToMic && (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                    ✓ Currently capturing System Audio
                  </span>
                  <button
                    onClick={onSwitchToMic}
                    className="text-[10px] text-text-muted hover:text-text-secondary underline"
                  >
                    Switch to Mic
                  </button>
                </div>
              )}
            </div>
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
