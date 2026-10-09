import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StoryBankItem, PredictedQuestion, InterviewDebrief } from '../types/copilot'

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
  stories?: StoryBankItem[]
}

function cleanJsonText(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return cleaned.trim()
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
  if (context.stories && context.stories.length > 0) {
    const storiesSummary = context.stories
      .map((s) => `• "${s.title}": S(${s.situation}) A(${s.action}) R(${s.result}) [${s.tags.join(', ')}]`)
      .slice(0, 4)
      .join('\n')
    parts.push(`Candidate's Personal Story Bank (reference these examples if relevant):\n${storiesSummary}`)
  }

  return parts.join('\n\n')
}

// ─── GeminiClient ─────────────────────────────────────────────────────────────
export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private context: GeminiContext = {}
  private modelName: string

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey)
    this.modelName = config.model ?? 'gemini-3.5-flash-lite'
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
    const modelsToTry = [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
    ]
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

  /** Check if an API key looks plausibly valid */
  static validateApiKey(key: string): boolean {
    return key.trim().length >= 20
  }
}

// ─── Standalone Client-Side AI Helpers ─────────────────────────────────────────

export async function refineStoryWithGemini(
  rawNotes: string,
  apiKey: string,
  titleHint: string = ''
): Promise<Partial<StoryBankItem>> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' })

  const prompt = `
You are TUDLOIKO Career Coach. Transform the following raw career experience notes into a structured STAR-method interview story.

User's raw notes:
"${rawNotes}"
Title hint: "${titleHint}"

Return a valid JSON object ONLY with this exact schema (no markdown fences, no extra text):
{
  "title": "Short punchy story title (e.g. Scaling Payment Processing Under High Traffic)",
  "situation": "Concise situation and context (1-2 sentences)",
  "task": "The specific responsibility or challenge faced (1-2 sentences)",
  "action": "Key actions taken, leadership shown, or technologies used (2-3 sentences)",
  "result": "Quantifiable outcomes, metrics, or positive impact (1-2 sentences)",
  "tags": ["skill1", "skill2", "skill3"],
  "metrics": ["metric or key achievement (e.g. 40% latency reduction)"]
}
`
  const result = await model.generateContent(prompt)
  return JSON.parse(cleanJsonText(result.response.text()))
}

export async function predictQuestionsWithGemini(
  position: string,
  company: string,
  jobDescription: string,
  resume: string,
  apiKey: string
): Promise<PredictedQuestion[]> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' })

  const prompt = `
You are TUDLOIKO AI Interview Prep Coach. Analyze the following target job role and candidate background:

Role: ${position} at ${company}
Job Description:
${jobDescription || 'Professional role'}

Candidate Resume:
${resume || 'Not provided'}

Predict 8-10 highly probable, high-impact interview questions categorized by type.
Return a valid JSON array ONLY (no markdown fences) containing objects with this exact schema:
[
  {
    "id": "q1",
    "category": "Behavioral",
    "question": "The specific question text",
    "intent": "Why the interviewer asks this / what they are evaluating",
    "recommended_star_points": [
      "Brief cue for Situation/Task",
      "Key Action to highlight",
      "Expected Result/Impact"
    ]
  }
]
Categories must be one of: "Behavioral", "Technical", "Culture & Values", "Situational".
`
  const result = await model.generateContent(prompt)
  return JSON.parse(cleanJsonText(result.response.text()))
}

export async function matchStoryWithGemini(
  question: string,
  stories: StoryBankItem[],
  apiKey: string
): Promise<{ matchedStory: StoryBankItem | null; starCue: string; reason: string }> {
  if (!stories.length) return { matchedStory: null, starCue: '', reason: '' }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' })

  const storiesSummary = stories.map((s, idx) => ({
    index: idx,
    title: s.title,
    tags: s.tags,
    result: s.result,
  }))

  const prompt = `
Given this interview question:
"${question}"

And the candidate's available Story Bank entries:
${JSON.stringify(storiesSummary)}

Select the SINGLE best matching story that the candidate should use as their example.
Return a valid JSON object ONLY:
{
  "story_index": 0,
  "reason": "Brief 1-sentence reason why this story fits",
  "star_cue": "1-sentence STAR reminder tailored to this question"
}
`
  try {
    const result = await model.generateContent(prompt)
    const data = JSON.parse(cleanJsonText(result.response.text()))
    const idx = typeof data.story_index === 'number' ? data.story_index : 0
    return {
      matchedStory: stories[idx] || stories[0],
      starCue: data.star_cue || '',
      reason: data.reason || '',
    }
  } catch {
    return { matchedStory: stories[0], starCue: '', reason: '' }
  }
}

export async function generateDebriefWithGemini(
  sessionTitle: string,
  transcripts: { speaker: string; text: string }[],
  notes: string,
  apiKey: string
): Promise<InterviewDebrief> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' })

  const transcriptText = transcripts.map((t) => `[${t.speaker}]: ${t.text}`).join('\n')

  const prompt = `
You are TUDLOIKO AI Career Coach. Review this completed job interview session:

Session: ${sessionTitle}
Candidate Notes: ${notes || 'None'}
Transcript:
${transcriptText || 'General interview conversation.'}

Generate a comprehensive post-interview debrief. Return a valid JSON object ONLY (no markdown):
{
  "overall_score": 85,
  "executive_summary": "2-3 paragraph summary of how the interview went, strengths displayed, and overall tone.",
  "question_reviews": [
    {
      "question": "Question asked by interviewer",
      "candidate_response_summary": "Summary of what applicant said",
      "strong_points": "What was articulate and clear",
      "areas_to_improve": "What was vague or could be framed better",
      "suggested_model_answer": "Concise bulleted STAR model answer"
    }
  ],
  "thank_you_email_draft": "Subject: Thank you - Interview Follow-up\\n\\nDear Interviewer,\\n...",
  "follow_up_questions": [
    "Thoughtful follow-up question 1",
    "Thoughtful follow-up question 2"
  ]
}
`
  const result = await model.generateContent(prompt)
  return JSON.parse(cleanJsonText(result.response.text()))
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
