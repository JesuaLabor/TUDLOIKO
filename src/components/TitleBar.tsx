import {
  MousePointerClick,
  Minus,
  ChevronUp,
  Trash2,
  Check,
  Sparkles,
  Loader2,
} from 'lucide-react'

interface TitleBarProps {
  isMinimized: boolean
  setIsMinimized: (v: boolean) => void
  isClickThrough: boolean
  onToggleClickThrough: () => void
  isStreaming: boolean
  isListening: boolean
  suggestionCount: number
  onClear: () => void
  showClearConfirm: boolean
}

export default function TitleBar({
  isMinimized,
  setIsMinimized,
  isClickThrough,
  onToggleClickThrough,
  isStreaming,
  isListening,
  suggestionCount,
  onClear,
  showClearConfirm,
}: TitleBarProps) {
  return (
    <div
      className={`
        drag-region flex items-center justify-between
        px-4 py-3 border-b border-border
        ${isMinimized ? 'rounded-2xl border-b-0' : 'rounded-t-2xl'}
      `}
    >
      {/* ── Left: logo + status ─────────────────────────────────── */}
      <div className="flex items-center gap-2 no-drag">
        {/* Logo glyph */}
        <div
          className={`
            w-7 h-7 rounded-lg flex items-center justify-center
            bg-accent/20 border border-accent/30
            ${isStreaming ? 'ring-glow' : ''}
            ${isListening ? 'border-red-500/40 bg-red-500/10' : ''}
          `}
        >
          {isStreaming ? (
            <Loader2 size={14} className="text-accent animate-spin" />
          ) : (
            <Sparkles size={14} className="text-accent" />
          )}
        </div>

        {/* Name */}
        <div className="drag-region">
          <span className="gradient-text font-semibold text-sm tracking-wide">
            TUDLOIKO
          </span>
          {isStreaming && (
            <span className="ml-2 text-[10px] text-accent/70 animate-pulse">
              AI thinking…
            </span>
          )}
        </div>
      </div>

      {/* ── Right: action buttons ───────────────────────────────── */}
      <div className="flex items-center gap-1 no-drag">
        {/* Click-through toggle */}
        <button
          onClick={onToggleClickThrough}
          title={isClickThrough ? 'Click-through ON — clicks pass to app behind' : 'Click-through OFF'}
          className={`
            flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium
            transition-all duration-150 active:scale-95
            ${isClickThrough
              ? 'bg-accent/20 text-accent border border-accent/30'
              : 'bg-white/5 text-text-muted hover:text-text-secondary hover:bg-white/10'
            }
          `}
        >
          <MousePointerClick size={11} />
          <span className="hidden sm:inline">
            {isClickThrough ? 'Through' : 'Click'}
          </span>
        </button>

        {/* Clear suggestions */}
        {suggestionCount > 0 && (
          <button
            onClick={onClear}
            title="Clear all suggestions"
            className="flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-all duration-150 active:scale-95"
          >
            {showClearConfirm ? (
              <Check size={12} className="text-green-400" />
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        )}

        {/* Minimize / Expand */}
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand' : 'Minimize'}
          className="flex items-center justify-center w-7 h-7 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-all duration-150 active:scale-95"
        >
          {isMinimized ? (
            <ChevronUp size={13} />
          ) : (
            <Minus size={13} />
          )}
        </button>
      </div>
    </div>
  )
}
