import { useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Repeat, Radio, Gauge, AlertTriangle } from 'lucide-react'
import type { SpeechAnalyticsResult } from '../types/copilot'

interface AudioControlsProps {
  isListening: boolean
  captureMode: 'manual' | 'auto'
  audioLevel: number       // 0–100
  deviceLabel: string
  onToggleRecord: () => void
  onToggleMode: () => void
  isProcessing: boolean
  speechStats?: SpeechAnalyticsResult
}

// ─── Amplitude Visualizer (canvas) ───────────────────────────────────────────
function AmplitudeBar({ level, isListening }: { level: number; isListening: boolean }) {
  const bars = 10
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const w = canvas.width
    const h = canvas.height
    const barW = Math.floor(w / bars) - 1

    for (let i = 0; i < bars; i++) {
      const spread = isListening ? levelRef.current / 100 : 0.05
      const noise = Math.random() * spread * 0.5
      const barH = Math.max(2, (spread + noise) * h * 0.85)
      const x = i * (barW + 1)
      const y = (h - barH) / 2

      const alpha = isListening ? 0.6 + spread * 0.4 : 0.2
      ctx.fillStyle = isListening
        ? `rgba(124, 107, 255, ${alpha})`
        : `rgba(100, 100, 140, 0.25)`
      ctx.beginPath()
      ctx.roundRect(x, y, barW, barH, 1)
      ctx.fill()
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [isListening])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      width={60}
      height={20}
      className="rounded"
    />
  )
}

// ─── AudioControls ─────────────────────────────────────────────────────────
export default function AudioControls({
  isListening,
  captureMode,
  audioLevel,
  deviceLabel,
  onToggleRecord,
  onToggleMode,
  isProcessing,
  speechStats,
}: AudioControlsProps) {
  const paceColor = {
    optimal: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    fast: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    slow: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  }[speechStats?.paceStatus ?? 'optimal']

  const fillerTooltip = speechStats?.fillerCounts
    ? Object.entries(speechStats.fillerCounts)
        .map(([k, v]) => `"${k}": ${v}`)
        .join(', ')
    : ''

  return (
    <div className="no-drag border-b border-border bg-surface-subtle/60 px-3 py-1.5">
      <div className="flex items-center gap-2">

        {/* ── Record / Stop button ─────────────────────────────────── */}
        <button
          onClick={onToggleRecord}
          title={isListening ? 'Stop recording' : 'Start recording'}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold
            transition-all duration-200 active:scale-95 flex-shrink-0
            ${isListening
              ? 'bg-red-500/20 text-red-400 border border-red-500/35 hover:bg-red-500/30'
              : 'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30'
            }
          `}
        >
          {isListening ? (
            <>
              <span className="recording-dot" />
              <MicOff size={11} />
              Stop
            </>
          ) : (
            <>
              <Mic size={11} />
              Record
            </>
          )}
        </button>

        {/* ── Amplitude visualizer ─────────────────────────────────── */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <AmplitudeBar level={audioLevel} isListening={isListening} />
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-[10px] text-text-muted truncate leading-tight">
              {isListening
                ? isProcessing
                  ? '⏳ Processing…'
                  : '🎙 Capturing audio…'
                : deviceLabel
                  ? `📻 ${deviceLabel.slice(0, 24)}`
                  : 'No device selected'
              }
            </p>
          </div>
        </div>

        {/* ── Speech Telemetry: WPM & Fillers ──────────────────────── */}
        {speechStats && (speechStats.wpm > 0 || speechStats.totalFillers > 0) && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {speechStats.wpm > 0 && (
              <span
                title={`Pacing: ${speechStats.wpm} words per minute (${speechStats.paceStatus})`}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold ${paceColor}`}
              >
                <Gauge size={9} />
                {speechStats.wpm} WPM
              </span>
            )}

            {speechStats.totalFillers > 0 && (
              <span
                title={fillerTooltip ? `Detected fillers: ${fillerTooltip}` : 'Filler words detected'}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-bold text-amber-400 bg-amber-500/10 border-amber-500/25 cursor-help"
              >
                <AlertTriangle size={9} />
                {speechStats.totalFillers} {speechStats.totalFillers === 1 ? 'filler' : 'fillers'}
              </span>
            )}
          </div>
        )}

        {/* ── Mode toggle ──────────────────────────────────────────── */}
        <button
          onClick={onToggleMode}
          title={`Mode: ${captureMode === 'manual' ? 'Manual (click to record)' : 'Auto (continuous)'}`}
          className={`
            flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium
            border transition-all duration-150 active:scale-95 flex-shrink-0
            ${captureMode === 'auto'
              ? 'bg-gem-green/15 text-gem-green border-gem-green/25'
              : 'bg-white/5 text-text-muted border-border hover:text-text-secondary'
            }
          `}
        >
          {captureMode === 'auto'
            ? <><Radio size={10} /> Auto</>
            : <><Repeat size={10} /> Manual</>
          }
        </button>
      </div>
    </div>
  )
}
