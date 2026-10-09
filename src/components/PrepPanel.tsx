import { useState } from 'react'
import {
  Sparkles,
  Briefcase,
  Building2,
  FileText,
  User,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  Send,
} from 'lucide-react'
import type { GeminiContext } from '../lib/gemini'
import type { PredictedQuestion } from '../types/copilot'
import { predictQuestionsWithGemini } from '../lib/gemini'
import { BackendClient } from '../lib/backend'

interface PrepPanelProps {
  context: GeminiContext
  updateContext: (patch: Partial<GeminiContext>) => void
  apiKey: string
  onSelectQuestionForPractice?: (q: string) => void
}

export default function PrepPanel({
  context,
  updateContext,
  apiKey,
  onSelectQuestionForPractice,
}: PrepPanelProps) {
  const [predictedQuestions, setPredictedQuestions] = useState<PredictedQuestion[]>([])
  const [isPredicting, setIsPredicting] = useState(false)
  const [expandedQId, setExpandedQId] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSynced, setIsSynced] = useState(false)

  const handlePredictQuestions = async () => {
    if (!apiKey) return
    setIsPredicting(true)
    try {
      const questions = await predictQuestionsWithGemini(
        context.position || 'Software Professional',
        context.companyInfo || 'Target Company',
        context.jobDescription || '',
        context.resume || '',
        apiKey
      )
      if (questions && questions.length > 0) {
        setPredictedQuestions(questions)
      }
    } catch (err) {
      console.error('Failed to predict questions:', err)
    } finally {
      setIsPredicting(false)
    }
  }

  const handleSyncToBackend = async () => {
    setIsSyncing(true)
    const success = await BackendClient.saveProfile(context)
    if (success) {
      setIsSynced(true)
      setTimeout(() => setIsSynced(false), 2000)
    }
    setIsSyncing(false)
  }

  const CATEGORY_COLORS: Record<string, string> = {
    Behavioral: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    Technical: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    'Culture & Values': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    Situational: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  }

  return (
    <div className="no-drag flex-1 overflow-y-auto p-3.5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-accent" />
            <h2 className="text-text-primary text-xs font-semibold uppercase tracking-wider">
              Interview Preparation & Prediction
            </h2>
          </div>
          <p className="text-text-muted text-[11px] mt-0.5">
            Analyze your target job description to predict likely questions & tailor your answers
          </p>
        </div>

        <button
          onClick={handleSyncToBackend}
          disabled={isSyncing}
          title="Save context to backend DB"
          className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-border text-[10px] text-text-muted hover:text-text-secondary active:scale-95 transition-all"
        >
          {isSynced ? (
            <>
              <Check size={10} className="text-green-400" /> Synced
            </>
          ) : (
            <>
              <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} /> Sync DB
            </>
          )}
        </button>
      </div>

      {/* Inputs Form */}
      <div className="glass-card p-3 rounded-xl border border-border space-y-2.5 bg-surface-base/60">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-text-secondary font-medium flex items-center gap-1">
              <Briefcase size={10} className="text-accent" /> Target Role
            </label>
            <input
              type="text"
              value={context.position || ''}
              onChange={(e) => updateContext({ position: e.target.value })}
              placeholder="e.g. Senior Backend Engineer"
              className="glass-input text-[11px] mt-0.5"
            />
          </div>
          <div>
            <label className="text-[10px] text-text-secondary font-medium flex items-center gap-1">
              <Building2 size={10} className="text-accent" /> Target Company
            </label>
            <input
              type="text"
              value={context.companyInfo || ''}
              onChange={(e) => updateContext({ companyInfo: e.target.value })}
              placeholder="e.g. Stripe, Canva, Remote US Startup"
              className="glass-input text-[11px] mt-0.5"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-text-secondary font-medium flex items-center gap-1">
            <FileText size={10} className="text-accent" /> Job Description / Key Requirements
          </label>
          <textarea
            value={context.jobDescription || ''}
            onChange={(e) => updateContext({ jobDescription: e.target.value })}
            placeholder="Paste the job description or bullet requirements here…"
            rows={3}
            className="glass-input text-[11px] mt-0.5 resize-none"
          />
        </div>

        <div>
          <label className="text-[10px] text-text-secondary font-medium flex items-center gap-1">
            <User size={10} className="text-accent" /> Your Resume / Key Experience Highlights
          </label>
          <textarea
            value={context.resume || ''}
            onChange={(e) => updateContext({ resume: e.target.value })}
            placeholder="Paste your CV highlights, achievements, or project summary…"
            rows={3}
            className="glass-input text-[11px] mt-0.5 resize-none"
          />
        </div>

        <div className="pt-1 flex justify-end">
          <button
            onClick={handlePredictQuestions}
            disabled={isPredicting || !apiKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 active:scale-95 transition-all shadow-sm"
          >
            <Sparkles size={12} className={isPredicting ? 'animate-spin' : ''} />
            <span>{isPredicting ? 'Analyzing with Gemini…' : '🔮 Predict Likely Questions'}</span>
          </button>
        </div>
      </div>

      {/* Predicted Questions Section */}
      {predictedQuestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-1">
              <HelpCircle size={12} className="text-accent" /> Predicted Questions ({predictedQuestions.length})
            </span>
            <span className="text-[10px] text-text-muted">Click any question for STAR tips</span>
          </div>

          <div className="space-y-2">
            {predictedQuestions.map((q) => {
              const isExpanded = expandedQId === q.id
              const catClass = CATEGORY_COLORS[q.category] || 'text-accent bg-accent/10 border-accent/20'

              return (
                <div
                  key={q.id || q.question}
                  className="glass-card rounded-xl border border-border/80 overflow-hidden hover:border-accent/30 transition-all bg-surface-base/60"
                >
                  <div
                    onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                    className="p-3 flex items-start justify-between cursor-pointer select-none"
                  >
                    <div className="space-y-1 flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${catClass}`}>
                          {q.category}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-text-primary leading-snug">{q.question}</p>
                    </div>

                    <div className="flex items-center gap-1 text-text-muted">
                      {onSelectQuestionForPractice && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectQuestionForPractice(q.question)
                          }}
                          title="Practice in Copilot tab"
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-accent bg-accent/10 hover:bg-accent/20 transition-all"
                        >
                          <Send size={9} /> Practice
                        </button>
                      )}
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-black/10 space-y-2 text-[11px]">
                      {q.intent && (
                        <div>
                          <span className="text-[10px] font-bold text-gem-blue uppercase tracking-wider block">
                            Interviewer Intent:
                          </span>
                          <p className="text-text-secondary leading-relaxed">{q.intent}</p>
                        </div>
                      )}
                      {q.recommended_star_points && q.recommended_star_points.length > 0 && (
                        <div>
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                            Recommended Talking Points:
                          </span>
                          <ul className="list-disc list-inside text-text-secondary space-y-0.5 mt-0.5">
                            {q.recommended_star_points.map((pt, i) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
