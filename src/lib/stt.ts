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

// ─── System prompt for combined STT + suggestion ──────────────────────────────
function buildAudioPrompt(contextSummary: string, previousTranscript: string): string {
  const parts = [
    `You are TUDLOIKO, a real-time AI interview copilot. You are being fed a short audio clip from a live job interview.

Your task is to do TWO things and return them in this EXACT format:

TRANSCRIPT: [the verbatim spoken words in this audio clip, or "(no speech)" if silent/unclear]
SUGGESTIONS:
• [first suggestion]
• [second suggestion]
• [third suggestion, if needed]

RULES for SUGGESTIONS:
- 2–3 bullet points max, each under 15 words
- Be ultra-brief — the applicant is mid-conversation
- Base suggestions on what was JUST said in the audio + previous conversation context
- Never repeat suggestions already given
- If the audio contains a question, give answer talking points
- Prefix follow-up questions to ask the interviewer with →
- If audio has no clear question (e.g. small talk), give brief engagement tips`,
  ]

  if (contextSummary) {
    parts.push(`\nCANDIDATE CONTEXT:\n${contextSummary.slice(0, 600)}`)
  }
  if (previousTranscript) {
    parts.push(`\nRECENT CONVERSATION:\n${previousTranscript.slice(-800)}`)
  }

  return parts.join('\n')
}

// ─── Parse TRANSCRIPT: / SUGGESTIONS: sections from Gemini response ───────────
function parseSTTResponse(raw: string): STTResult {
  const transcriptMatch = raw.match(/TRANSCRIPT:\s*(.+?)(?=SUGGESTIONS:|$)/is)
  const suggestionsMatch = raw.match(/SUGGESTIONS:\s*([\s\S]+)/i)

  return {
    transcript: transcriptMatch?.[1]?.trim() ?? raw.slice(0, 200).trim(),
    suggestions: suggestionsMatch?.[1]?.trim() ?? '',
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

    try {
      const base64Audio = await blobToBase64(audioBlob)

      // Try models in order of stability & high quota limits
      const candidateModels = [
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash-lite',
      ]
      let lastErr: unknown = null

      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 400,
            },
          })

          const prompt = buildAudioPrompt(contextSummary, previousTranscript)

          const result = await model.generateContent([
            {
              inlineData: {
                mimeType: mimeType as 'audio/webm' | 'audio/webm;codecs=opus' | 'audio/ogg',
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
          const errStr = String(err)
          if (errStr.includes('429') || errStr.includes('Quota exceeded')) {
            break // Quota error applies to all models for this key
          }
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
  if (ctx.jobDescription) parts.push(`JD: ${ctx.jobDescription.slice(0, 300)}`)
  if (ctx.resume) parts.push(`Resume: ${ctx.resume.slice(0, 300)}`)
  return parts.join('\n')
}
