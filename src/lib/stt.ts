import { GoogleGenerativeAI } from '@google/generative-ai'
import { blobToBase64 } from './audioCapture'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TranscriptEntry {
  id: string
  text: string
  timestamp: number
  speaker: 'them' | 'you' | 'unknown'
}

export interface STTResult {
  transcript: string
  suggestions: string
  raw: string
}

// ─── System prompt for fast verbatim audio transcription ───────────────────────
function buildAudioPrompt(contextSummary: string, _previousTranscript: string): string {
  const parts = [
    `You are a fast, highly accurate speech-to-text transcription engine for an online job interview.
Transcribe the interviewer's spoken words verbatim from the audio chunk.
If the audio contains silence, ambient background noise only, or unintelligible audio, respond with "(no speech)".
Do NOT answer the question. Do NOT give advice, bullet points, or suggestions. Return ONLY the verbatim speech.

TRANSCRIPT: [verbatim speech]`,
  ]

  if (contextSummary) {
    parts.push(`\nCONTEXT TERMS (for technical vocabulary recognition):\n${contextSummary.slice(0, 500)}`)
  }

  return parts.join('\n')
}

// ─── Parse TRANSCRIPT: from Gemini STT response ───────────────────────────────
function parseSTTResponse(raw: string): STTResult {
  const transcriptMatch = raw.match(/TRANSCRIPT:\s*([\s\S]+)/i)
  let transcript = transcriptMatch?.[1]?.trim() ?? raw.trim()

  transcript = transcript
    .replace(/^TRANSCRIPT:\s*/i, '')
    .trim()

  return {
    transcript,
    suggestions: '',
    raw,
  }
}

// ─── GeminiAudioProcessor ─────────────────────────────────────────────────────
export class GeminiAudioProcessor {
  private genAI: GoogleGenerativeAI
  private isProcessing = false
  private cooldownUntil = 0

  constructor(private apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
  }

  updateApiKey(key: string) {
    this.apiKey = key
    this.genAI = new GoogleGenerativeAI(key)
    this.cooldownUntil = 0
  }

  /**
   * Process an audio chunk: transcribe + generate suggestions in one Gemini call.
   * Returns parsed transcript text and suggestion bullets.
   */
  async processChunk(
    audioBlob: Blob,
    mimeType: string,
    contextSummary: string,
    previousTranscript: string,
    onDone: (result: STTResult) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    if (this.isProcessing) return
    if (Date.now() < this.cooldownUntil) {
      // In rate limit cooldown window; pause background attempts
      return
    }
    this.isProcessing = true

    if (audioBlob.size < 800) {
      this.isProcessing = false
      onDone({ transcript: '(no speech)', suggestions: '', raw: '' })
      return
    }

    try {
      const base64Audio = await blobToBase64(audioBlob)
      if (!base64Audio || base64Audio.length < 50) {
        this.isProcessing = false
        onDone({ transcript: '(no speech)', suggestions: '', raw: '' })
        return
      }

      // Clean mimeType to canonical standard format without codecs parameters
      const cleanMime = (mimeType.split(';')[0].trim() || 'audio/webm') as 'audio/webm' | 'audio/ogg' | 'audio/wav'

      // Prioritize gemini-3.5-flash-lite and flash-lite family for high free-tier quota & ultra-low latency
      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash',
      ]
      let lastErr: unknown = null

      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 800,
            },
          })

          const prompt = buildAudioPrompt(contextSummary, previousTranscript)

          const result = await model.generateContent([
            {
              inlineData: {
                mimeType: cleanMime,
                data: base64Audio,
              },
            },
            prompt,
          ])

          const raw = result.response.text()
          this.cooldownUntil = 0 // Reset cooldown on successful response
          onDone(parseSTTResponse(raw))
          return
        } catch (err) {
          lastErr = err
          // Continue to next candidate model (Google quotas can be per-model, e.g. gemini-3.5-flash daily limit vs flash-lite)
        }
      }

      throw lastErr || new Error('Failed to process audio chunk.')
    } catch (err) {
      let msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('429') || msg.includes('Quota exceeded')) {
        this.cooldownUntil = Date.now() + 45000 // 45s backoff window
        msg = '⚠ Gemini API Quota Exceeded (429 Rate Limit). The free tier allows 15 requests/min. Pausing background audio for 45s, or switch to Manual Record/Stop mode.'
      }
      onError(new Error(msg))
    } finally {
      this.isProcessing = false
    }
  }

  get busy() { return this.isProcessing }
}

// ─── Build context summary string from app context ────────────────────────────
export function buildContextSummary(ctx: {
  position?: string
  companyInfo?: string
  jobDescription?: string
  resume?: string
}): string {
  const parts: string[] = []
  if (ctx.position) parts.push(`Role: ${ctx.position}`)
  if (ctx.companyInfo) parts.push(`Company: ${ctx.companyInfo}`)
  if (ctx.jobDescription) parts.push(`JD: ${ctx.jobDescription.slice(0, 500)}`)
  if (ctx.resume) parts.push(`Resume Profile:\n${ctx.resume.slice(0, 1500)}`)
  return parts.join('\n')
}
