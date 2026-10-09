import { useState, useEffect } from 'react'
import { FileText, Briefcase, Building2, User, RefreshCw, Check } from 'lucide-react'
import type { GeminiContext } from '../lib/gemini'
import { BackendClient } from '../lib/backend'

interface ContextPanelProps {
  context: GeminiContext
  updateContext: (patch: Partial<GeminiContext>) => void
}

type ContextFieldKey = 'position' | 'companyInfo' | 'jobDescription' | 'resume'

interface FieldConfig {
  key: ContextFieldKey
  label: string
  placeholder: string
  icon: typeof FileText
  rows: number
  hint: string
}

const FIELDS: FieldConfig[] = [
  {
    key: 'position',
    label: 'Target Role',
    placeholder: 'e.g. Senior Software Engineer at Acme Corp',
    icon: Briefcase,
    rows: 1,
    hint: 'Job title you\'re interviewing for',
  },
  {
    key: 'companyInfo',
    label: 'Company Info',
    placeholder: 'Company mission, products, culture, recent news…',
    icon: Building2,
    rows: 2,
    hint: 'Helps Gemini tailor talking points',
  },
  {
    key: 'jobDescription',
    label: 'Job Description',
    placeholder: 'Paste the full job description here…',
    icon: FileText,
    rows: 4,
    hint: 'Key requirements & responsibilities',
  },
  {
    key: 'resume',
    label: 'Your Resume / CV',
    placeholder: 'Paste your resume or key experience highlights…',
    icon: User,
    rows: 5,
    hint: 'Used to personalize suggestions to your background',
  },
]

export default function ContextPanel({ context, updateContext }: ContextPanelProps) {
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)

  const filledCount = FIELDS.filter((f) => !!context[f.key]?.trim()).length

  const handleBackendSync = async () => {
    setSyncing(true)
    const success = await BackendClient.saveProfile(context)
    if (success) {
      setSynced(true)
      setTimeout(() => setSynced(false), 2000)
    }
    setSyncing(false)
  }

  return (
    <div className="no-drag flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-text-primary text-sm font-semibold">Interview Context</h2>
          <p className="text-text-muted text-xs mt-0.5">
            Personalize suggestions with your background & job details
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackendSync}
            disabled={syncing}
            title="Sync profile context with Django database"
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 border border-border text-[10px] text-text-muted hover:text-text-secondary active:scale-95 transition-all"
          >
            {synced ? <><Check size={10} className="text-green-400" /> Synced</> : <><RefreshCw size={10} className={syncing ? 'animate-spin' : ''} /> Sync DB</>}
          </button>
          <span className="text-[10px] font-semibold text-accent px-2 py-0.5 rounded-full bg-accent/15 border border-accent/25">
            {filledCount}/{FIELDS.length} filled
          </span>
        </div>
      </div>

      {/* Fields */}
      {FIELDS.map(({ key, label, placeholder, icon: Icon, rows, hint }) => (
        <div key={key} className="space-y-1.5">
          <label className="flex items-center gap-1.5">
            <Icon size={11} className="text-accent/70" />
            <span className="section-label">{label}</span>
          </label>
          <textarea
            rows={rows}
            value={context[key] ?? ''}
            onChange={(e) => updateContext({ [key]: e.target.value })}
            placeholder={placeholder}
            className="glass-input"
          />
          <p className="text-[10px] text-text-muted pl-1">{hint}</p>
        </div>
      ))}

      {/* Clear context */}
      {filledCount > 0 && (
        <button
          onClick={() => updateContext({ position: '', companyInfo: '', jobDescription: '', resume: '' })}
          className="btn-ghost w-full justify-center text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
        >
          Clear all context
        </button>
      )}
    </div>
  )
}
