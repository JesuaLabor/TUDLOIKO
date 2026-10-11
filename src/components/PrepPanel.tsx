import { useState, useRef } from 'react'
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
  UploadCloud,
  FileCheck,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { GeminiContext } from '../lib/gemini'
import type { PredictedQuestion } from '../types/copilot'
import { predictQuestionsWithGemini, extractResumeFromPdf } from '../lib/gemini'
import { BackendClient } from '../lib/backend'

interface PrepPanelProps {
  context: GeminiContext
  updateContext: (patch: Partial<GeminiContext>) => void
  apiKey: string
  onSelectQuestionForPractice?: (q: string) => void
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PrepPanel({
  context,
  updateContext,
  apiKey,
  onSelectQuestionForPractice,
}: PrepPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [predictedQuestions, setPredictedQuestions] = useState<PredictedQuestion[]>([])
  const [isPredicting, setIsPredicting] = useState(false)
  const [expandedQId, setExpandedQId] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSynced, setIsSynced] = useState(false)

  // PDF Resume States
  const [isParsingPdf, setIsParsingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [showTextPreview, setShowTextPreview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const processPdfFile = async (file: File) => {
    if (!file) return
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Please select a valid PDF file (.pdf).')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setPdfError('PDF file exceeds 15MB limit.')
      return
    }
    if (!apiKey) {
      setPdfError('Please enter your Gemini API key in Settings first to parse PDFs.')
      return
    }

    setIsParsingPdf(true)
    setPdfError(null)

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string
          const base64 = res.split(',')[1] || ''
          resolve(base64)
        }
        reader.onerror = reject
      })
      reader.readAsDataURL(file)
      const base64Pdf = await base64Promise

      const { extractedSummary, detectedRole } = await extractResumeFromPdf(base64Pdf, apiKey)

      updateContext({
        resume: extractedSummary,
        resumeFileName: file.name,
        resumeFileSize: file.size,
        resumePdfBase64: base64Pdf,
        ...(detectedRole && !context.position ? { position: detectedRole } : {}),
      })
      setShowTextPreview(true)
    } catch (err) {
      console.error('Failed to parse PDF resume:', err)
      setPdfError(err instanceof Error ? err.message : 'Failed to parse PDF resume.')
    } finally {
      setIsParsingPdf(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processPdfFile(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processPdfFile(file)
    }
  }

  const handleRemovePdf = () => {
    updateContext({
      resume: '',
      resumeFileName: undefined,
      resumeFileSize: undefined,
      resumePdfBase64: undefined,
    })
    setShowTextPreview(false)
    setPdfError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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

        {/* Resume / Profile Knowledge Section with PDF attachment */}
        <div className="space-y-1.5 pt-1.5 border-t border-border/50">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-text-secondary font-medium flex items-center gap-1">
              <User size={10} className="text-accent" /> Resume & Experience Knowledge
            </label>
            {context.resumeFileName && (
              <button
                type="button"
                onClick={() => setShowTextPreview((prev) => !prev)}
                className="text-[10px] text-accent hover:underline flex items-center gap-1"
              >
                {showTextPreview ? (
                  <>
                    <EyeOff size={10} /> Hide Extracted Text
                  </>
                ) : (
                  <>
                    <Eye size={10} /> View / Edit Extracted Text
                  </>
                )}
              </button>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* PDF Scanning / Loading State */}
          {isParsingPdf && (
            <div className="p-3.5 rounded-xl bg-accent/10 border border-accent/30 flex items-center gap-3 animate-pulse">
              <Loader2 size={18} className="text-accent animate-spin flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-accent">Parsing Resume with Gemini AI…</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Extracting your career background, tech stack, and key project metrics for live interview answers.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {pdfError && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center gap-2 text-red-400 text-[11px]">
              <AlertCircle size={13} className="flex-shrink-0" />
              <span>{pdfError}</span>
            </div>
          )}

          {/* Attached PDF Card */}
          {!isParsingPdf && context.resumeFileName ? (
            <div className="p-2.5 rounded-xl bg-surface-card border border-border/80 flex items-center justify-between gap-2 transition-all hover:border-accent/30">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                  <FileCheck size={16} className="text-green-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-text-primary truncate max-w-[200px]" title={context.resumeFileName}>
                      {context.resumeFileName}
                    </span>
                    {context.resumeFileSize && (
                      <span className="text-[10px] text-text-muted">
                        ({formatFileSize(context.resumeFileSize)})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30 flex items-center gap-0.5">
                      <Check size={9} /> Copilot Knowledge Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Replace with another PDF"
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-text-muted hover:text-text-primary border border-border/40 transition-colors"
                >
                  Replace PDF
                </button>
                <button
                  type="button"
                  onClick={handleRemovePdf}
                  title="Remove resume"
                  className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ) : !isParsingPdf && (
            /* Upload Dropzone */
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                p-3 rounded-xl border border-dashed cursor-pointer transition-all text-center
                flex flex-col items-center justify-center gap-1.5 group
                ${isDragging
                  ? 'border-accent bg-accent/15 scale-[1.01]'
                  : 'border-border/80 bg-surface-card/40 hover:border-accent/50 hover:bg-surface-card/80'
                }
              `}
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UploadCloud size={16} className="text-accent" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                  Attach PDF Resume (Click or Drag & Drop)
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  Gemini automatically reads your skills, projects, and work history for real-time interview answers (Max 15MB)
                </p>
              </div>
            </div>
          )}

          {/* Extracted Text Preview / Manual Edit Area */}
          {(showTextPreview || (!context.resumeFileName && (context.resume || '').length > 0)) && (
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-text-muted">
                  Extracted Profile Text (Used by Copilot during live interview):
                </span>
                <span className="text-[9px] text-text-muted font-mono">
                  {(context.resume || '').length} chars
                </span>
              </div>
              <textarea
                value={context.resume || ''}
                onChange={(e) => updateContext({ resume: e.target.value })}
                placeholder="Paste your CV highlights, achievements, or project summary…"
                rows={4}
                className="glass-input text-[11px] resize-none font-sans"
              />
            </div>
          )}
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
