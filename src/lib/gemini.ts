import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'
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
  resumeFileName?: string
  resumeFileSize?: number
  resumePdfBase64?: string
  stories?: StoryBankItem[]
  depthPreference?: 'simple' | 'medium' | 'technical'
  interviewLanguage?: 'English' | 'Filipino' | 'Taglish'
}

export interface InterviewTurnHistory {
  question: string
  storyId?: string | null
}

export function cleanJsonText(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return cleaned.trim()
}

// ─── Real-Time Interview Coach System Prompt ──────────────────────────────────
export const REALTIME_COACH_SYSTEM_PROMPT = `You are a real-time interview coach. The applicant glances at your output for
2-3 seconds during a live interview. Give them a prominent MAIN POINT answer and 3 ready-to-say spoken answer options.

# INPUTS
- QUESTION: the interviewer's latest question (raw speech-to-text, may have errors)
- PROFILE: the applicant's resume summary and skills
- STORY_BANK: the applicant's real projects and examples
- JOB: the job posting (title, requirements)
- SETTINGS: language (English | Filipino | Taglish)

# TASK
1. Understand the question and clean up any transcription errors.
2. Label category (e.g. "Greeting / Small Talk", "Elevator Pitch", "Behavioral", "Technical", "Motivation", "Salary", "Unclear") and difficulty ("standard", "challenging", "tricky").
3. Synthesize a 1-second "main_point":
   - The central thesis or direct punchline to state upfront (8–18 words max).
   - In difficult questions (e.g. failures, conflicts, trade-offs, gaps), the main_point must answer directly without deflection.
4. For "challenging" or "tricky" questions, provide a concise "strategy_cue" (e.g. "Acknowledge the trade-off first before picking an option", "Own the error without defensiveness", "Focus on quantifiable business impact").
5. Extract 2–4 "key_phrases" (critical technical terms, metrics, or anchor points).
6. Write exactly 3 spoken answer options in first person:
   - "Short"    : up to 20 words
   - "Balanced" : up to 40 words
   - "Detailed" : up to 70 words
   In each option, bold the 2–3 most critical keywords/numbers using markdown (**term**) so they pop out to the user's eyes while reading.

# RULES
- Match the size of the answer to the size of the question. A greeting gets a one-line reply in all three options.
- Use ONLY facts from PROFILE and STORY_BANK. Never invent employers, projects, tools, or metrics.
- If the applicant has no direct experience, make the main_point an honest bridge (closest parallel experience + fast learning ability). Never fake experience.
- Sound like a natural person: conversational, direct, zero corporate buzzword salad.
- Match the language in SETTINGS.
- Output ONLY valid JSON in the schema below.

# OUTPUT SCHEMA
{
  "question_clean": string,
  "category": string,
  "difficulty": "standard" | "challenging" | "tricky",
  "main_point": string,
  "strategy_cue": string,
  "key_phrases": string[],
  "options": [
    { "label": "Short",    "say_this": string },
    { "label": "Balanced", "say_this": string },
    { "label": "Detailed", "say_this": string }
  ]
}

# EXAMPLE (Challenging Question)
QUESTION: "Tell me about a production outage you caused."
{
  "question_clean": "Tell me about a production outage you caused and how you handled it.",
  "category": "Behavioral",
  "difficulty": "challenging",
  "main_point": "I took full ownership of an unindexed query, rolled back in 12 minutes, and added automated CI query linting.",
  "strategy_cue": "Own the incident immediately; highlight rapid MTTR and permanent prevention rather than making excuses.",
  "key_phrases": ["12-Minute MTTR", "Unindexed Migration", "CI Query Linting"],
  "options": [
    { "label": "Short",    "say_this": "I pushed an unindexed migration that spiked CPU. I initiated an immediate **rollback in 12 minutes** and added **automated CI query checks**." },
    { "label": "Balanced", "say_this": "Early on, an unindexed query caused a spike in DB CPU. I immediately alerted the team, executed our **rollback runbook within 12 minutes**, and implemented **pre-deployment query linting** to prevent regressions." },
    { "label": "Detailed", "say_this": "During high-traffic testing, a database migration without composite indexing caused replica lag. I immediately owned the issue, coordinated with DevOps, and restored normal latency via a **zero-downtime rollback in 12 minutes**. To ensure it wouldn't reoccur, I wrote a **custom CI linter** that flags unindexed lookups across all PRs." }
  ]
}
`

export const COACH_RESPONSE_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    question_clean: {
      type: SchemaType.STRING,
      description: 'Cleaned transcription of the interviewer question',
    },
    category: {
      type: SchemaType.STRING,
      description: 'Category: Greeting / Small Talk, Elevator Pitch, Behavioral, Technical, Motivation, Salary, or Unclear',
    },
    difficulty: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['standard', 'challenging', 'tricky'],
      description: 'Question difficulty level: standard, challenging, or tricky',
    },
    main_point: {
      type: SchemaType.STRING,
      description: 'The single 1-second core takeaway or central thesis to state upfront (8-18 words max)',
    },
    strategy_cue: {
      type: SchemaType.STRING,
      description: 'Tactical advice or trap avoidance for difficult/tricky questions (1 concise sentence)',
    },
    key_phrases: {
      type: SchemaType.ARRAY,
      description: '2 to 4 critical technical keywords, metrics, or anchor terms to mention',
      items: {
        type: SchemaType.STRING,
      },
    },
    options: {
      type: SchemaType.ARRAY,
      description: 'Exactly 3 ready-to-say answer options: Short, Balanced, Detailed',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          label: {
            type: SchemaType.STRING,
            format: 'enum',
            description: 'Option label: Short, Balanced, or Detailed',
            enum: ['Short', 'Balanced', 'Detailed'],
          },
          say_this: {
            type: SchemaType.STRING,
            description: 'Ready-to-say answer spoken aloud in first person, with **critical keywords** formatted in markdown bold',
          },
        },
        required: ['label', 'say_this'],
      },
    },
  },
  required: ['question_clean', 'category', 'difficulty', 'main_point', 'options'],
}

export function buildCoachPromptInputs(
  interviewerQuestion: string,
  context: GeminiContext
): string {
  const storiesList = (context.stories && context.stories.length > 0)
    ? context.stories.map((s, idx) => ({
        id: s.id ? `story-${s.id}` : `story-${idx + 1}`,
        title: s.title,
        situation: s.situation,
        task: s.task,
        action: s.action,
        result: s.result,
        metrics: s.metrics || []
      }))
    : []

  const jobParts = [
    context.position ? `Title: ${context.position}` : '',
    context.companyInfo ? `Company: ${context.companyInfo}` : '',
    context.jobDescription ? `Requirements: ${context.jobDescription.slice(0, 1500)}` : ''
  ].filter(Boolean)

  const lang = context.interviewLanguage || 'English'

  return `[INPUTS]
- QUESTION: ${interviewerQuestion}
- PROFILE: ${context.resume || 'General software engineer profile'}
- STORY_BANK: ${JSON.stringify(storiesList, null, 2)}
- JOB: ${jobParts.length > 0 ? jobParts.join('\n') : 'Target job interview'}
- SETTINGS: language (${lang})`
}

// ─── GeminiClient ─────────────────────────────────────────────────────────────
export class GeminiClient {
  private genAI: GoogleGenerativeAI
  private context: GeminiContext = {}
  private modelName: string
  private history: InterviewTurnHistory[] = []

  constructor(config: GeminiConfig) {
    this.genAI = new GoogleGenerativeAI(config.apiKey)
    this.modelName = config.model ?? 'gemini-3.5-flash-lite'
  }

  setContext(ctx: GeminiContext) {
    this.context = ctx
  }

  addHistory(question: string, storyId?: string | null) {
    this.history.push({ question, storyId })
    if (this.history.length > 20) {
      this.history.shift()
    }
  }

  getHistory(): InterviewTurnHistory[] {
    return [...this.history]
  }

  clearHistory() {
    this.history = []
  }

  /**
   * Stream a structured response from Gemini matching the real-time interview coach schema.
   */
  async streamSuggestion(
    interviewerPrompt: string,
    onChunk: (accumulatedText: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const modelsToTry = [
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.5-flash',
    ]
    let lastError: unknown = null

    const historySummary = this.history.length > 0
      ? this.history.map((h, i) => `Q${i + 1}: "${h.question}" (used story_id: ${h.storyId || 'none'})`).join('; ')
      : 'None'

    const fullPrompt = buildCoachPromptInputs(interviewerPrompt, this.context)

    for (const modelName of modelsToTry) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: REALTIME_COACH_SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: COACH_RESPONSE_SCHEMA,
            maxOutputTokens: 1200,
          },
        })
        const chat = model.startChat()

        const result = await chat.sendMessageStream(fullPrompt)

        let accumulatedText = ''
        for await (const chunk of result.stream) {
          const chunkText = chunk.text()
          accumulatedText += chunkText
          onChunk(accumulatedText)
        }

        this.addHistory(interviewerPrompt)

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

export async function extractResumeFromPdf(
  base64Pdf: string,
  apiKey: string
): Promise<{ extractedSummary: string; detectedRole?: string }> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
  ]

  let lastError: unknown = null
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200,
        },
      })

      const prompt = `You are TUDLOIKO Career AI. Analyze this candidate's PDF resume and extract a comprehensive, well-structured interview profile for the AI Copilot to reference during a live interview.

Extract and format cleanly:
• CANDIDATE SUMMARY: (2-sentence executive summary of experience level, core specializations, and career highlights)
• CORE SKILLS & TECH STACK: (Languages, frameworks, databases, cloud, devops, tools, architectures)
• WORK HISTORY & NOTABLE ACHIEVEMENTS: (Companies/roles, quantifiable achievements with metrics, percentages, throughput numbers, and key responsibilities)
• NOTABLE PROJECTS: (Project names, tech stacks, problems solved, and architectural highlights)
• EDUCATION & CREDENTIALS: (Degrees, institutions, relevant certifications)

At the very end of your response, on a new line, add:
DETECTED_ROLE: [The candidate's primary job title, e.g. "Full-Stack Software Engineer" or "Senior Backend Developer"]

Preserve all technical keywords, metrics, numbers, and project names with high accuracy.`

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Pdf,
          },
        },
        prompt,
      ])

      const raw = result.response.text()
      const roleMatch = raw.match(/DETECTED_ROLE:\s*(.+)$/m)
      const detectedRole = roleMatch ? roleMatch[1].trim() : undefined
      const extractedSummary = raw.replace(/DETECTED_ROLE:\s*.+$/m, '').trim()

      return { extractedSummary, detectedRole }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Failed to extract resume from PDF.')
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
