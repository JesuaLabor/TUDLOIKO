import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'

export interface GeminiConfig {
  apiKey: string
  maxContextTurns?: number
  model?: string
}

export interface GeminiContext {
  position?: string
  companyInfo?: string
  jobDescription?: string
  resume?: string
}

// ─── System prompt builder ───────────────────────────────────────────────────
function buildSystemPrompt(context: GeminiContext): string {
  const parts: string[] = [
    `You are TUDLOIKO, an AI Interview Copilot assisting a job applicant in real time during a live video interview.`,
    `Your goal: Provide hyper-concise, glanceable, high-impact talking points and answer hints. The user must be able to read and process your advice in under 2 seconds mid-conversation.`,
    `RULES:`,
    `- Keep response under 4 bullet points max`,
    `- Each bullet must be 8-18 words max`,
    `- Use bold text (**keyword**) for critical key phrases to make them glanceable`,
    `- Format actionable advice, STAR method framing (Situation/Task/Action/Result), or concrete metrics`,
    `- Suggest follow-up questions to ask the interviewer when appropriate (prefix with "→ Ask:")`,
    `- NEVER write full paragraphs or long essays`,
  ]

  if (context.position) parts.push(`Target Role: ${context.position}`)
  if (context.companyInfo) parts.push(`Company Info: ${context.companyInfo}`)
  if (context.jobDescription) parts.push(`Job Description:\n${context.jobDescription}`)
  if (context.resume) parts.push(`Candidate Resume/CV:\n${context.resume}`)

  return parts.join('\n\n')
}

// ─── GeminiClient ─────────────────────────────────────────────────────────────
export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private context: GeminiContext = {}
  private modelName: string

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey)
    // Default to gemini-1.5-flash which has 1,500 requests/day quota limit
    this.modelName = config.model ?? 'gemini-1.5-flash'
  }

  setContext(ctx: GeminiContext) {
    this.context = ctx
  }

  /**
   * Stream a response from Gemini given the interviewer's question/prompt.
   */
  async streamSuggestion(
    interviewerPrompt: string,
    onChunk: (accumulatedText: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro-latest']
    let lastError: unknown = null

    for (const modelName of modelsToTry) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 300,
          },
        })
        const chat = model.startChat()
        const systemContext = buildSystemPrompt(this.context)
        const fullPrompt = `[SYSTEM INSTRUCTION]\n${systemContext}\n\n[INTERVIEWER QUESTION]:\n${interviewerPrompt}`

        const result = await chat.sendMessageStream(fullPrompt)

        let accumulatedText = ''
        for await (const chunk of result.stream) {
          const chunkText = chunk.text()
          accumulatedText += chunkText
          onChunk(accumulatedText)
        }

        onDone(accumulatedText)
        return
      } catch (err) {
        lastError = err
      }
    }

    let msg = lastError instanceof Error ? lastError.message : String(lastError)
    if (msg.includes('429') || msg.includes('Quota exceeded')) {
      msg = '⚠ Gemini API Quota Exceeded (429 Rate Limit). Please wait a short moment before trying again.'
    }
    onError(new Error(msg))
  }

  /** Check if an API key looks plausibly valid (just length — don't gate on prefix format) */
  static validateApiKey(key: string): boolean {
    return key.trim().length >= 20
  }
}

// ─── Singleton Client Cache ───────────────────────────────────────────────────
let activeClient: GeminiClient | null = null
let activeApiKey = ''

export function getGeminiClient(apiKey: string, context?: GeminiContext): GeminiClient {
  if (!activeClient || activeApiKey !== apiKey) {
    activeClient = new GeminiClient({ apiKey })
    activeApiKey = apiKey
  }
  if (context) {
    activeClient.setContext(context)
  }
  return activeClient
}
