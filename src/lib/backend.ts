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

  /** Sync candidate profile context with Django backend DB */
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

  /** Fetch latest candidate profile context from Django backend DB */
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
}
