import { useState } from 'react'
import {
  BookMarked,
  Plus,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Tag,
  TrendingUp,
  FileEdit,
  FolderOpen,
} from 'lucide-react'
import type { StoryBankItem } from '../types/copilot'
import { BackendClient } from '../lib/backend'
import { refineStoryWithGemini } from '../lib/gemini'

interface StoryBankPanelProps {
  stories: StoryBankItem[]
  onSaveStory: (story: StoryBankItem) => void
  onDeleteStory: (id: number | string) => void
  apiKey: string
}

export default function StoryBankPanel({
  stories,
  onSaveStory,
  onDeleteStory,
  apiKey,
}: StoryBankPanelProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [expandedId, setExpandedId] = useState<string | number | null>(null)
  const [selectedTag, setSelectedTag] = useState<string>('all')
  const [copiedId, setCopiedId] = useState<string | number | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [rawNotes, setRawNotes] = useState('')
  const [situation, setSituation] = useState('')
  const [task, setTask] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [metricsInput, setMetricsInput] = useState('')

  // Collect all unique tags
  const allTags = Array.from(new Set(stories.flatMap((s) => s.tags || [])))

  const filteredStories = stories.filter((s) => {
    if (selectedTag === 'all') return true
    return s.tags?.some((t) => t.toLowerCase() === selectedTag.toLowerCase())
  })

  const resetForm = () => {
    setTitle('')
    setRawNotes('')
    setSituation('')
    setTask('')
    setAction('')
    setResult('')
    setTagsInput('')
    setMetricsInput('')
    setIsCreating(false)
  }

  const handleMagicRefine = async () => {
    if (!rawNotes.trim()) return
    setIsRefining(true)
    try {
      let refined: Partial<StoryBankItem> | null = null
      // Try backend first
      refined = await BackendClient.refineStory(rawNotes, title, apiKey)
      // Fallback to client-side direct Gemini
      if (!refined && apiKey) {
        refined = await refineStoryWithGemini(rawNotes, apiKey, title)
      }

      if (refined) {
        if (refined.title) setTitle(refined.title)
        if (refined.situation) setSituation(refined.situation)
        if (refined.task) setTask(refined.task)
        if (refined.action) setAction(refined.action)
        if (refined.result) setResult(refined.result)
        if (refined.tags) setTagsInput(refined.tags.join(', '))
        if (refined.metrics) setMetricsInput(refined.metrics.join(', '))
      }
    } catch (err) {
      console.error('Failed to refine story:', err)
    } finally {
      setIsRefining(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim() && !situation.trim()) return

    const parsedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    const parsedMetrics = metricsInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    const newStory: StoryBankItem = {
      id: Date.now(),
      title: title.trim() || 'Untitled Experience',
      situation: situation.trim(),
      task: task.trim(),
      action: action.trim(),
      result: result.trim(),
      tags: parsedTags.length > 0 ? parsedTags : ['general'],
      metrics: parsedMetrics,
    }

    // Save to local state
    onSaveStory(newStory)
    // Async push to backend
    BackendClient.createStory(newStory).catch(() => {})

    resetForm()
  }

  const handleCopyStory = (s: StoryBankItem) => {
    const text = `**${s.title}**
• Situation: ${s.situation}
• Task: ${s.task}
• Action: ${s.action}
• Result: ${s.result}
Tags: ${s.tags.join(', ')}`
    navigator.clipboard.writeText(text)
    setCopiedId(s.id ?? s.title)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="no-drag flex-1 overflow-y-auto p-3.5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <BookMarked size={14} className="text-accent" />
            <h2 className="text-text-primary text-xs font-semibold uppercase tracking-wider">
              Personal Story Bank
            </h2>
          </div>
          <p className="text-text-muted text-[11px] mt-0.5">
            Your authentic STAR examples ready for instant recall during interviews
          </p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-medium hover:bg-accent/30 active:scale-95 transition-all"
          >
            <Plus size={12} />
            <span>Add Story</span>
          </button>
        )}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && !isCreating && (
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
              selectedTag === 'all'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-white/5 text-text-muted hover:text-text-secondary border border-border'
            }`}
          >
            All ({stories.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all ${
                selectedTag.toLowerCase() === tag.toLowerCase()
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-white/5 text-text-muted hover:text-text-secondary border border-border'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Create / Refine Form */}
      {isCreating && (
        <div className="glass-card p-3 rounded-xl border border-accent/30 space-y-3 bg-surface-base/80">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1">
              <FileEdit size={12} className="text-accent" /> New STAR Story
            </span>
            <button
              onClick={resetForm}
              className="text-[10px] text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>

          {/* AI Magic Refine Box */}
          <div className="p-2.5 rounded-lg bg-accent/8 border border-accent/20 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-accent flex items-center gap-1">
                <Sparkles size={11} /> AI Auto-Refine from Raw Experience
              </label>
              <button
                onClick={handleMagicRefine}
                disabled={isRefining || !rawNotes.trim()}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-white text-[10px] font-medium hover:bg-accent/90 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
              >
                <Sparkles size={10} className={isRefining ? 'animate-spin' : ''} />
                {isRefining ? 'Refining…' : 'Refine with Gemini'}
              </button>
            </div>
            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Paste raw notes or bullet points from your resume here (e.g. 'Led team of 5 to fix memory leak in Node.js server under high peak load during sale, reduced crashes by 80%'). Gemini will structure it into STAR!"
              rows={2}
              className="glass-input text-[11px] w-full resize-none bg-surface-base/90"
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-text-secondary font-medium">Story Title / Hook</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Optimizing Database Query Throughput"
                className="glass-input text-[11px] mt-0.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Situation (S)</label>
                <textarea
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  placeholder="Context & problem faced…"
                  rows={2}
                  className="glass-input text-[11px] mt-0.5 resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Task (T)</label>
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Your specific responsibility…"
                  rows={2}
                  className="glass-input text-[11px] mt-0.5 resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Action (A)</label>
                <textarea
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="Concrete steps & tools used…"
                  rows={2}
                  className="glass-input text-[11px] mt-0.5 resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Result (R)</label>
                <textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  placeholder="Measurable metrics & impact…"
                  rows={2}
                  className="glass-input text-[11px] mt-0.5 resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Skills / Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="leadership, system-design, debugging"
                  className="glass-input text-[11px] mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] text-text-secondary font-medium">Key Metrics (comma-separated)</label>
                <input
                  type="text"
                  value={metricsInput}
                  onChange={(e) => setMetricsInput(e.target.value)}
                  placeholder="40% faster, zero downtime"
                  className="glass-input text-[11px] mt-0.5"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <button
              onClick={resetForm}
              className="px-2.5 py-1 rounded text-[11px] text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 rounded bg-accent text-white text-[11px] font-semibold hover:bg-accent/90 active:scale-95 transition-all shadow-sm"
            >
              Save to Story Bank
            </button>
          </div>
        </div>
      )}

      {/* Story Cards List */}
      <div className="space-y-2.5">
        {filteredStories.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-border bg-surface-subtle/20">
            <FolderOpen size={24} className="mx-auto text-text-muted/60 mb-2" />
            <p className="text-xs text-text-secondary font-medium">No stories in this view</p>
            <p className="text-[11px] text-text-muted mt-1 max-w-xs mx-auto">
              Add your best project examples, leadership moments, and technical wins so TUDLOIKO can prompt you during live calls.
            </p>
          </div>
        ) : (
          filteredStories.map((story) => {
            const isExpanded = expandedId === story.id
            const isCopied = copiedId === story.id

            return (
              <div
                key={story.id || story.title}
                className="glass-card rounded-xl border border-border/80 overflow-hidden hover:border-accent/30 transition-all bg-surface-base/60"
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : (story.id ?? null))}
                  className="p-3 flex items-start justify-between cursor-pointer select-none"
                >
                  <div className="space-y-1 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-text-primary leading-tight">
                        {story.title}
                      </h3>
                      {story.metrics && story.metrics.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-green-400 px-1.5 py-0.2 rounded-full bg-green-500/10 border border-green-500/20">
                          <TrendingUp size={9} /> {story.metrics[0]}
                        </span>
                      )}
                    </div>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {story.tags?.map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 border border-border text-text-muted"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-text-muted">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyStory(story)
                      }}
                      title="Copy story"
                      className="p-1 hover:text-text-primary rounded hover:bg-white/5"
                    >
                      {isCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (story.id) onDeleteStory(story.id)
                      }}
                      title="Delete story"
                      className="p-1 hover:text-red-400 rounded hover:bg-white/5"
                    >
                      <Trash2 size={11} />
                    </button>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-black/10 space-y-2 text-[11px]">
                    <div>
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                        Situation & Task:
                      </span>
                      <p className="text-text-secondary leading-relaxed">
                        {story.situation || '—'} {story.task}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gem-blue uppercase tracking-wider block">
                        Action:
                      </span>
                      <p className="text-text-secondary leading-relaxed">{story.action || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider block">
                        Result & Impact:
                      </span>
                      <p className="text-text-secondary leading-relaxed font-medium">
                        {story.result || '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
