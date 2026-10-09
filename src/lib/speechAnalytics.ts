import type { SpeechAnalyticsResult } from '../types/copilot'

const FILLER_PATTERNS: { phrase: string; regex: RegExp; language: 'en' | 'ph' }[] = [
  // English common fillers
  { phrase: 'um', regex: /\b(um+|uhm)\b/gi, language: 'en' },
  { phrase: 'uh', regex: /\b(uh+|er+)\b/gi, language: 'en' },
  { phrase: 'like', regex: /\b(like)\b/gi, language: 'en' },
  { phrase: 'actually', regex: /\b(actually)\b/gi, language: 'en' },
  { phrase: 'basically', regex: /\b(basically)\b/gi, language: 'en' },
  { phrase: 'you know', regex: /\b(you know)\b/gi, language: 'en' },
  { phrase: 'sort of', regex: /\b(sort of)\b/gi, language: 'en' },
  { phrase: 'kind of', regex: /\b(kind of)\b/gi, language: 'en' },
  { phrase: 'literally', regex: /\b(literally)\b/gi, language: 'en' },

  // Taglish / Filipino nuances
  { phrase: 'parang', regex: /\b(parang)\b/gi, language: 'ph' },
  { phrase: 'ano', regex: /\b(ano|ano po)\b/gi, language: 'ph' },
  { phrase: 'kumbaga', regex: /\b(kumbaga)\b/gi, language: 'ph' },
  { phrase: 'tapos', regex: /\b(tapos)\b/gi, language: 'ph' },
  { phrase: 'bale', regex: /\b(bale)\b/gi, language: 'ph' },
  { phrase: 'medyo', regex: /\b(medyo)\b/gi, language: 'ph' },
]

export class SpeechAnalyticsTracker {
  private totalWords = 0
  private fillerCounts: Record<string, number> = {}
  private totalFillers = 0
  private speakingStartTime: number | null = null
  private totalSpeakingDurationSec = 0
  private currentWpm = 0

  reset() {
    this.totalWords = 0
    this.fillerCounts = {}
    this.totalFillers = 0
    this.speakingStartTime = null
    this.totalSpeakingDurationSec = 0
    this.currentWpm = 0
  }

  processUtterance(text: string, durationMs: number = 4000): SpeechAnalyticsResult {
    if (!text || text.toLowerCase().includes('(no speech)')) {
      return this.getResult()
    }

    const words = text.trim().split(/\s+/).filter(Boolean)
    const wordCount = words.length
    this.totalWords += wordCount

    const durationSec = Math.max(1, durationMs / 1000)
    this.totalSpeakingDurationSec += durationSec

    // Detect filler words
    for (const { phrase, regex } of FILLER_PATTERNS) {
      const matches = text.match(regex)
      if (matches && matches.length > 0) {
        this.fillerCounts[phrase] = (this.fillerCounts[phrase] || 0) + matches.length
        this.totalFillers += matches.length
      }
    }

    // Instantaneous / smoothed WPM
    const minutes = this.totalSpeakingDurationSec / 60
    if (minutes > 0.05) {
      this.currentWpm = Math.round(this.totalWords / minutes)
    } else {
      // Short window estimate
      this.currentWpm = Math.round((wordCount / durationSec) * 60)
    }

    return this.getResult()
  }

  getResult(): SpeechAnalyticsResult {
    let paceStatus: 'slow' | 'optimal' | 'fast' = 'optimal'
    if (this.currentWpm > 0) {
      if (this.currentWpm < 110) paceStatus = 'slow'
      else if (this.currentWpm > 165) paceStatus = 'fast'
      else paceStatus = 'optimal'
    }

    return {
      totalFillers: this.totalFillers,
      fillerCounts: { ...this.fillerCounts },
      wpm: this.currentWpm,
      paceStatus,
      totalWords: this.totalWords,
    }
  }
}
