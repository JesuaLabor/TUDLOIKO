export interface StoryBankItem {
  id?: number
  title: string
  situation: string
  task: string
  action: string
  result: string
  tags: string[]
  metrics: string[]
  created_at?: string
  updated_at?: string
}

export interface PredictedQuestion {
  id: string
  category: 'Behavioral' | 'Technical' | 'Culture & Values' | 'Situational'
  question: string
  intent: string
  recommended_star_points: string[]
}

export interface JobApplication {
  id?: number
  company_name: string
  position: string
  job_description: string
  resume: string
  predicted_questions: PredictedQuestion[]
  status: string
  created_at?: string
  updated_at?: string
}

export interface QuestionReview {
  question: string
  candidate_response_summary: string
  strong_points: string
  areas_to_improve: string
  suggested_model_answer: string
}

export interface InterviewDebrief {
  id?: number
  session_id?: number
  overall_score: number
  executive_summary: string
  question_reviews: QuestionReview[]
  thank_you_email_draft: string
  follow_up_questions: string[]
  created_at?: string
}

export interface SpeechAnalyticsResult {
  totalFillers: number
  fillerCounts: Record<string, number>
  wpm: number
  paceStatus: 'slow' | 'optimal' | 'fast'
  totalWords: number
}

export type QuestionType =
  | 'small_talk'
  | 'behavioral'
  | 'technical_concept'
  | 'technical_problem'
  | 'situational'
  | 'motivational'
  | 'self_intro'
  | 'strengths_weaknesses'
  | 'salary_logistics'
  | 'no_experience'
  | 'clarification_needed'
  | 'inappropriate'

export interface LikelyFollowup {
  question: string
  prep_hint: string
}

export interface AnswerOption {
  label: 'Short' | 'Balanced' | 'Detailed' | string
  say_this: string
}

export interface CoachCardData {
  question_clean: string
  category: string
  difficulty?: 'standard' | 'challenging' | 'tricky'
  main_point?: string
  strategy_cue?: string
  key_phrases?: string[]
  options: AnswerOption[]
  type?: QuestionType | string
  reply?: string
  intent?: string
  depth?: 'simple' | 'medium' | 'technical'
  target_seconds?: number
  source?: {
    story_id: string | null
    story_title: string | null
    confidence: 'high' | 'medium' | 'low'
  }
  body?: Record<string, any>
  watch_outs?: string[]
  likely_followups?: LikelyFollowup[]
  gap_warning?: string | null
  ask_them?: string | null
}
