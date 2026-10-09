import type {
  StoryBankItem,
  JobApplication,
  PredictedQuestion,
  InterviewDebrief,
} from '../types/copilot'

export interface BackendHealth {
  status: 'ok' | 'offline'
  service?: string
  version?: string
}

export interface CandidateContextPayload {
  position?: string
  companyInfo?: string
  jobDescription?: string
  resume?: string
}

const BACKEND_BASE_URL = 'http://127.0.0.1:8000/api'

export class BackendClient {
  /** Check if local Django backend server is online */
  static async checkHealth(): Promise<BackendHealth> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/health/`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = await res.json()
        return { status: 'ok', service: data.service, version: data.version }
      }
    } catch {
      // Backend offline or unreachable
    }
    return { status: 'offline' }
  }

  // ─── Profile Context ────────────────────────────────────────────────────────
  static async saveProfile(payload: CandidateContextPayload): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/profiles/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: payload.position || '',
          company_info: payload.companyInfo || '',
          job_description: payload.jobDescription || '',
          resume: payload.resume || '',
        }),
      })
      return res.ok
    } catch (err) {
      console.warn('[BackendClient] Failed to save profile:', err)
      return false
    }
  }

  static async fetchLatestProfile(): Promise<CandidateContextPayload | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/profiles/`)
      if (res.ok) {
        const list = await res.json()
        if (Array.isArray(list) && list.length > 0) {
          const latest = list[0]
          return {
            position: latest.position,
            companyInfo: latest.company_info,
            jobDescription: latest.job_description,
            resume: latest.resume,
          }
        }
      }
    } catch (err) {
      console.warn('[BackendClient] Failed to fetch profile:', err)
    }
    return null
  }

  // ─── Story Bank ─────────────────────────────────────────────────────────────
  static async getStories(): Promise<StoryBankItem[]> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/stories/`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to get stories:', err)
    }
    return []
  }

  static async createStory(story: Partial<StoryBankItem>): Promise<StoryBankItem | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/stories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(story),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to create story:', err)
    }
    return null
  }

  static async deleteStory(id: number): Promise<boolean> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/stories/${id}/`, { method: 'DELETE' })
      return res.ok
    } catch {
      return false
    }
  }

  static async refineStory(rawNotes: string, title?: string, apiKey?: string): Promise<Partial<StoryBankItem> | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/stories/refine/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_notes: rawNotes, title, api_key: apiKey }),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to refine story:', err)
    }
    return null
  }

  // ─── Job Applications & Predicted Questions ─────────────────────────────────
  static async getApplications(): Promise<JobApplication[]> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/applications/`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to get applications:', err)
    }
    return []
  }

  static async createApplication(app: Partial<JobApplication>): Promise<JobApplication | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/applications/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(app),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to create application:', err)
    }
    return null
  }

  static async predictQuestions(appId: number, apiKey?: string): Promise<PredictedQuestion[] | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/applications/${appId}/predict_questions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to predict questions:', err)
    }
    return null
  }

  // ─── Story Matcher & Debrief ────────────────────────────────────────────────
  static async matchStory(question: string, apiKey?: string): Promise<{ matched_story: StoryBankItem | null; star_cue: string; reason: string } | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/sessions/match_story/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, api_key: apiKey }),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to match story:', err)
    }
    return null
  }

  static async createSession(title: string, notes?: string, totalFillers: number = 0, avgWpm: number = 0): Promise<number | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, notes, total_fillers: totalFillers, avg_wpm: avgWpm }),
      })
      if (res.ok) {
        const data = await res.json()
        return data.id
      }
    } catch (err) {
      console.warn('[BackendClient] Failed to create session:', err)
    }
    return null
  }

  static async generateDebrief(sessionId: number, apiKey?: string): Promise<InterviewDebrief | null> {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/sessions/${sessionId}/generate_debrief/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[BackendClient] Failed to generate debrief:', err)
    }
    return null
  }
}
