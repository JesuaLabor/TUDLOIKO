import { useState } from 'react'
import {
  Award,
  Sparkles,
  Copy,
  Check,
  Mail,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { InterviewDebrief, SpeechAnalyticsResult } from '../types/copilot'
import type { TranscriptEntry } from '../lib/stt'
import { generateDebriefWithGemini } from '../lib/gemini'
import { BackendClient } from '../lib/backend'

interface DebriefPanelProps {
  transcripts: TranscriptEntry[]
  liveNotes: string
  speechStats: SpeechAnalyticsResult
  apiKey: string
  existingDebrief?: InterviewDebrief | null
  onDebriefGenerated?: (debrief: InterviewDebrief) => void
}

export default function DebriefPanel({
  transcripts,
  liveNotes,
  speechStats,
  apiKey,
  existingDebrief,
  onDebriefGenerated,
}: DebriefPanelProps) {
  const [debrief, setDebrief] = useState<InterviewDebrief | null>(existingDebrief || null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const handleGenerate = async () => {
    if (!apiKey) return
    setIsGenerating(true)
    try {
      // Direct client-side Gemini generation
      const formattedTranscripts = transcripts.map((t) => ({
        speaker: t.speaker,
        text: t.text,
      }))

      const result = await generateDebriefWithGemini(
        'Live Interview Session',
        formattedTranscripts,
        liveNotes,
        apiKey
      )

      if (result) {
        setDebrief(result)
        onDebriefGenerated?.(result)
      }
    } catch (err) {
      console.error('Failed to generate debrief:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyEmail = () => {
    if (!debrief?.thank_you_email_draft) return
    navigator.clipboard.writeText(debrief.thank_you_email_draft)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    if (score >= 70) return 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10'
  }

  return (
    <div className="no-drag flex-1 overflow-y-auto p-3.5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <Award size={14} className="text-accent" />
            <h2 className="text-text-primary text-xs font-semibold uppercase tracking-wider">
              Post-Interview Debrief & Scoring
            </h2>
          </div>
          <p className="text-text-muted text-[11px] mt-0.5">
            Objective analysis of your answers, speech pacing, and automated thank-you draft
          </p>
        </div>

        {debrief && (
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 border border-border text-[10px] text-text-muted hover:text-text-secondary active:scale-95 transition-all"
          >
            <Sparkles size={10} className={isGenerating ? 'animate-spin' : ''} />
            {isGenerating ? 'Analyzing…' : 'Regenerate'}
          </button>
        )}
      </div>

      {/* If No Debrief Yet */}
      {!debrief ? (
        <div className="glass-card p-5 rounded-2xl border border-border text-center space-y-4 bg-surface-base/60">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
            <Award size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-text-primary">Ready for your Debrief?</h3>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              TUDLOIKO evaluates the recorded live transcript ({transcripts.length} dialogue turns) and your live notes to deliver question-by-question scoring and tailored follow-up tips.
            </p>
          </div>

          {/* Quick Speech Telemetry */}
          <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto py-2">
            <div className="p-2 rounded-lg bg-white/5 border border-border text-center">
              <span className="text-[10px] text-text-muted block">Filler Words Spoken</span>
              <span className="text-base font-bold text-text-primary">
                {speechStats.totalFillers}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-border text-center">
              <span className="text-[10px] text-text-muted block">Average Pace</span>
              <span className="text-base font-bold text-text-primary">
                {speechStats.wpm > 0 ? `${speechStats.wpm} WPM` : 'Normal'}
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !apiKey}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 active:scale-95 transition-all shadow-md shadow-accent/20"
          >
            <Sparkles size={14} className={isGenerating ? 'animate-spin' : ''} />
            <span>{isGenerating ? 'Analyzing Interview with Gemini…' : 'Generate Full Debrief'}</span>
          </button>
        </div>
      ) : (
        /* Debrief Report View */
        <div className="space-y-4">
          {/* Top Score Card */}
          <div className="glass-card p-3.5 rounded-xl border border-border flex items-center justify-between bg-surface-base/70">
            <div>
              <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider block">
                Overall Interview Score
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl font-black text-text-primary">{debrief.overall_score}</span>
                <span className="text-xs text-text-muted">/ 100</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-text-muted block">Fillers</span>
                <span className="text-xs font-semibold text-text-primary">
                  {speechStats.totalFillers} detected
                </span>
              </div>
              <div className={`px-2.5 py-1 rounded-lg border font-bold text-xs ${getScoreColor(debrief.overall_score)}`}>
                {debrief.overall_score >= 80 ? 'Strong Candidate' : 'Promising'}
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          {debrief.executive_summary && (
            <div className="glass-card p-3 rounded-xl border border-border space-y-1.5 bg-surface-base/60">
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                <TrendingUp size={11} /> Executive Summary
              </span>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                {debrief.executive_summary}
              </p>
            </div>
          )}

          {/* Question-by-Question Deep Dive */}
          {debrief.question_reviews && debrief.question_reviews.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-text-primary block">
                Answer-by-Answer Feedback ({debrief.question_reviews.length})
              </span>

              <div className="space-y-2">
                {debrief.question_reviews.map((qr, idx) => {
                  const isExpanded = expandedIndex === idx

                  return (
                    <div
                      key={idx}
                      className="glass-card rounded-xl border border-border/80 overflow-hidden bg-surface-base/60"
                    >
                      <div
                        onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                        className="p-3 flex items-start justify-between cursor-pointer select-none"
                      >
                        <div className="space-y-0.5 flex-1 pr-2">
                          <span className="text-[9px] text-text-muted font-medium">Question {idx + 1}</span>
                          <p className="text-xs font-semibold text-text-primary leading-snug">{qr.question}</p>
                        </div>
                        {isExpanded ? <ChevronUp size={12} className="text-text-muted mt-1" /> : <ChevronDown size={12} className="text-text-muted mt-1" />}
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border/50 bg-black/10 space-y-2.5 text-[11px]">
                          {qr.candidate_response_summary && (
                            <div>
                              <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider block">
                                What You Said:
                              </span>
                              <p className="text-text-secondary mt-0.5">{qr.candidate_response_summary}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 rounded-lg bg-green-500/8 border border-green-500/20">
                              <span className="text-[10px] font-bold text-green-400 flex items-center gap-1">
                                <CheckCircle2 size={10} /> Strong Points
                              </span>
                              <p className="text-text-secondary text-[10px] mt-1 leading-snug">
                                {qr.strong_points || 'Clear communication'}
                              </p>
                            </div>
                            <div className="p-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                              <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                                <AlertCircle size={10} /> Areas to Tighten
                              </span>
                              <p className="text-text-secondary text-[10px] mt-1 leading-snug">
                                {qr.areas_to_improve || 'Hit measurable metrics more specifically'}
                              </p>
                            </div>
                          </div>

                          {qr.suggested_model_answer && (
                            <div>
                              <span className="text-[10px] font-bold text-accent uppercase tracking-wider block">
                                Recommended Model Answer:
                              </span>
                              <p className="text-text-secondary mt-0.5 leading-relaxed font-medium">
                                {qr.suggested_model_answer}
                              </p>
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

          {/* Thank-You Email Draft */}
          {debrief.thank_you_email_draft && (
            <div className="glass-card p-3 rounded-xl border border-border space-y-2 bg-surface-base/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                  <Mail size={12} className="text-accent" /> Tailored Thank-You Email
                </span>
                <button
                  onClick={handleCopyEmail}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent text-[10px] font-medium hover:bg-accent/30 active:scale-95 transition-all"
                >
                  {copiedEmail ? (
                    <>
                      <Check size={10} className="text-green-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={10} /> Copy Draft
                    </>
                  )}
                </button>
              </div>

              <textarea
                value={debrief.thank_you_email_draft}
                onChange={(e) =>
                  setDebrief({ ...debrief, thank_you_email_draft: e.target.value })
                }
                rows={5}
                className="glass-input text-[11px] w-full font-mono leading-relaxed resize-none bg-surface-base/90"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
