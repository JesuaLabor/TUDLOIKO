import { useEffect, useRef, useCallback } from 'react'
import { Mic, MicOff, Repeat, Radio } from 'lucide-react'

interface AudioControlsProps {
  isListening: boolean
  captureMode: 'manual' | 'auto'
  audioLevel: number       // 0–100
  deviceLabel: string
  onToggleRecord: () => void
  onToggleMode: () => void
  isProcessing: boolean
}

// ─── Amplitude Visualizer (canvas) ───────────────────────────────────────────
function AmplitudeBar({ level, isListening }: { level: number; isListening: boolean }) {
  const bars = 12
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
      // Each bar has a slightly different randomized height for a waveform look
      const spread = isListening ? levelRef.current / 100 : 0.05
      const noise = Math.random() * spread * 0.5
      const barH = Math.max(2, (spread + noise) * h * 0.85)
      const x = i * (barW + 1)
      const y = (h - barH) / 2

      // Gradient: accent color when active, muted when idle
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
      width={72}
      height={24}
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
}: AudioControlsProps) {
  return (
    <div className="no-drag border-b border-border bg-surface-subtle/60 px-3 py-2">
      <div className="flex items-center gap-2">

        {/* ── Record / Stop button ─────────────────────────────────── */}
        <button
          onClick={onToggleRecord}
          title={isListening ? 'Stop recording' : 'Start recording'}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
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
              <MicOff size={12} />
              Stop
            </>
          ) : (
            <>
              <Mic size={12} />
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
                  ? `📻 ${deviceLabel.slice(0, 28)}`
                  : 'No device selected'
              }
            </p>
          </div>
        </div>

        {/* ── Mode toggle ──────────────────────────────────────────── */}
        <button
          onClick={onToggleMode}
          title={`Mode: ${captureMode === 'manual' ? 'Manual (click to record)' : 'Auto (continuous)'}`}
          className={`
            flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
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
