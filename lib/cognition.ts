/**
 * Cognition engine — daily brain exercises disguised as conversation.
 *
 * He never knows it's cognitive exercise. It just feels like the assistant
 * being engaging and curious about him.
 *
 * Three touchpoints per day:
 *   Morning  (~9am)  — trivia or "finish the phrase" from his era
 *   Midday   (~1pm)  — word association or storytelling prompt
 *   Evening  (~6pm)  — reflection ("best part of your day?")
 *
 * Week 1: interest survey instead of games — 5 conversational questions.
 * Week 2+: games personalized to his era, career, and hobbies.
 *
 * Engagement tracking is private. He never sees a score.
 * If responses drop for 5+ days, operator gets a quiet heads-up.
 */

import OpenAI from 'openai'
import { redisGet, redisSet } from './redis'
import { UserProfile } from './profile'
import { alertOperator } from './integrity'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type CognitionSlot = 'morning' | 'midday' | 'evening'

export type GameType =
  | 'trivia'           // recall — "What year did the first moon landing happen?"
  | 'word_association' // language — "Name 3 things that come to mind: summer"
  | 'finish_phrase'    // pattern — "An apple a day keeps the ___"
  | 'storytelling'     // narrative — "Tell me about a time when..."
  | 'reflection'       // evening — "What made you smile today?"

export interface CognitionGame {
  type: GameType
  slot: CognitionSlot
  prompt: string       // what the assistant actually says — warm, casual
  hint?: string        // gentle follow-up if he seems stuck
  answer?: string      // for trivia — used to give positive reinforcement
}

export interface CognitionInterests {
  era: string           // "1940s-50s"
  career?: string       // "worked in oil fields"
  hobbies: string[]     // ["fishing", "baseball", "church"]
  music?: string        // "country, big band"
  sports?: string       // "Cowboys fan"
  hometown?: string     // "grew up in East Texas"
}

export interface EngagementEntry {
  date: string
  slot: CognitionSlot
  gameType: GameType
  responseLength: number
  engagementScore: number   // 1–5, private
}

export interface CognitionState {
  interests?: CognitionInterests
  surveyDone: boolean
  surveyStep: number          // 0–4
  lastGameBySlot: {
    morning?: string          // ISO date of last delivery
    midday?: string
    evening?: string
  }
  engagementLog: EngagementEntry[]
  gamesPlayed: number
}

// ─── Redis helpers ────────────────────────────────────────────────────────────

const STATE_TTL = 60 * 60 * 24 * 365 * 5 // 5 years

async function getState(phone: string): Promise<CognitionState> {
  return (await redisGet<CognitionState>(`cognition:${phone}`)) ?? {
    interests: undefined,
    surveyDone: false,
    surveyStep: 0,
    lastGameBySlot: {},
    engagementLog: [],
    gamesPlayed: 0,
  }
}

async function saveState(phone: string, state: CognitionState): Promise<void> {
  await redisSet(`cognition:${phone}`, state, STATE_TTL)
}

// ─── Interest survey ──────────────────────────────────────────────────────────
// Week 1: 5 warm questions instead of games.
// Feels like the assistant getting to know him. Not a form.

const SURVEY_QUESTIONS = [
  "I want to get to know you better! Where did you grow up?",
  "What kind of work did you do over the years?",
  "What do you enjoy doing in your free time?",
  "Are you a sports fan? Any teams you follow?",
  "What kind of music do you like?",
]

const SURVEY_FIELDS = ['hometown', 'career', 'hobbies', 'sports', 'music']

export async function getNextSurveyQuestion(phone: string): Promise<string | null> {
  const state = await getState(phone)
  if (state.surveyDone) return null
  return SURVEY_QUESTIONS[state.surveyStep] ?? null
}

export async function recordSurveyAnswer(
  phone: string,
  answer: string
): Promise<{ done: boolean }> {
  const state = await getState(phone)
  if (state.surveyDone) return { done: true }

  const field = SURVEY_FIELDS[state.surveyStep]
  const updatedInterests = await parseInterestAnswer(state.interests, field, answer)
  const nextStep = state.surveyStep + 1
  const done = nextStep >= SURVEY_QUESTIONS.length

  await saveState(phone, {
    ...state,
    interests: updatedInterests,
    surveyStep: nextStep,
    surveyDone: done,
  })

  return { done }
}

async function parseInterestAnswer(
  existing: CognitionInterests | undefined,
  field: string,
  answer: string
): Promise<CognitionInterests> {
  const base: CognitionInterests = existing ?? { era: '1940s-1950s', hobbies: [] }
  try {
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Extract the "${field}" from this answer: "${answer}"\nReturn JSON only: {"${field}": <value>}\nFor hobbies return an array of strings. Keep values short.`,
      }],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(r.choices[0]?.message?.content || '{}')
    return { ...base, ...parsed }
  } catch {
    return base
  }
}

// ─── Game generator ───────────────────────────────────────────────────────────

function pickGameType(slot: CognitionSlot, gamesPlayed: number): GameType {
  if (slot === 'evening') return 'reflection'
  if (slot === 'morning') return gamesPlayed % 3 === 0 ? 'finish_phrase' : 'trivia'
  return gamesPlayed % 2 === 0 ? 'word_association' : 'storytelling'
}

const FALLBACK_GAMES: Record<CognitionSlot, CognitionGame> = {
  morning: {
    type: 'finish_phrase', slot: 'morning',
    prompt: 'Quick one for you — "Early to bed and early to rise makes a man healthy, wealthy, and ___?"',
    answer: 'wise',
  },
  midday: {
    type: 'word_association', slot: 'midday',
    prompt: 'Name three things that come to mind when I say: summer.',
  },
  evening: {
    type: 'reflection', slot: 'evening',
    prompt: 'What was the best part of your day today?',
  },
}

export async function generateGame(
  phone: string,
  slot: CognitionSlot
): Promise<CognitionGame> {
  const state = await getState(phone)
  const type = pickGameType(slot, state.gamesPlayed)
  const ints = state.interests

  const interestCtx = ints
    ? `Era: ${ints.era}. Career: ${ints.career || 'unknown'}. Hobbies: ${ints.hobbies.join(', ') || 'unknown'}. Sports: ${ints.sports || 'unknown'}. Music: ${ints.music || 'unknown'}. Hometown: ${ints.hometown || 'unknown'}.`
    : 'No interests known yet — use general Americana from the 1940s–1970s.'

  const typeInstructions: Record<GameType, string> = {
    trivia: `One friendly trivia question — history, sports, or pop culture from his era. Something he'd likely know but has to think about. Warm and conversational, not a quiz-show host. Include the answer separately.`,
    word_association: `Ask him to name 3 things that come to mind for a category tied to his interests. Example: "Name three things that come to mind when I say: a perfect summer day." Easy, fun, no wrong answers.`,
    finish_phrase: `A well-known saying, proverb, or song lyric from his era — last word or phrase missing. He should know it cold. Something that makes him smile when he gets it.`,
    storytelling: `One warm open question that invites him to share a memory or story. Tied to his interests or career. Example: "What's the most memorable catch you ever made fishing?"`,
    reflection: `Evening — one warm question about his day. Positive, open-ended. Makes him articulate something good. Example: "What was the best moment of your day today?"`,
  }

  try {
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `You are crafting a casual, friendly message for an elderly man's AI assistant. It must feel like natural conversation — NOT a test or quiz.

About him: ${interestCtx}

Task: ${typeInstructions[type]}

JSON only:
{
  "prompt": "What the assistant says (warm, 1–2 sentences, conversational)",
  "hint": "Gentle follow-up if he seems stuck, or null",
  "answer": "Answer if trivia, or null"
}`,
      }],
      max_tokens: 200,
      temperature: 0.85,
      response_format: { type: 'json_object' },
    })
    const raw = JSON.parse(r.choices[0]?.message?.content || '{}')
    return {
      type,
      slot,
      prompt: raw.prompt || FALLBACK_GAMES[slot].prompt,
      hint: raw.hint || undefined,
      answer: raw.answer || undefined,
    }
  } catch {
    return FALLBACK_GAMES[slot]
  }
}

// ─── Slot readiness ───────────────────────────────────────────────────────────
// One game per slot per day max.

export async function isSlotReady(phone: string, slot: CognitionSlot): Promise<boolean> {
  const state = await getState(phone)
  const last = state.lastGameBySlot[slot]
  if (!last) return true
  return new Date(last).toDateString() !== new Date().toDateString()
}

// Mark slot delivered
async function markSlotDelivered(phone: string, slot: CognitionSlot): Promise<void> {
  const state = await getState(phone)
  await saveState(phone, {
    ...state,
    gamesPlayed: state.gamesPlayed + 1,
    lastGameBySlot: { ...state.lastGameBySlot, [slot]: new Date().toISOString() },
  })
}

// ─── Engagement tracking (private) ───────────────────────────────────────────

export async function scoreResponse(
  phone: string,
  slot: CognitionSlot,
  response: string
): Promise<void> {
  const state = await getState(phone)
  const lastGame = state.engagementLog[state.engagementLog.length - 1]
  if (!lastGame) return

  let score = 3
  try {
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Rate this elderly person's conversational response (1=very brief/confused/off-topic, 5=engaged/articulate/on-topic):
"${response.slice(0, 300)}"
JSON only: {"score": <1-5>}`,
      }],
      max_tokens: 30,
      temperature: 0,
      response_format: { type: 'json_object' },
    })
    score = Math.min(5, Math.max(1, Number(JSON.parse(r.choices[0]?.message?.content || '{}').score) || 3))
  } catch { /* best-effort */ }

  const entry: EngagementEntry = {
    date: new Date().toISOString(),
    slot,
    gameType: lastGame.gameType,
    responseLength: response.length,
    engagementScore: score,
  }

  const updatedLog = [...state.engagementLog.slice(-89), entry]
  await saveState(phone, { ...state, engagementLog: updatedLog })

  // Alert operator if 5 consecutive low scores (private — never shown to user)
  const recent = updatedLog.slice(-5)
  if (recent.length === 5 && recent.every(e => e.engagementScore <= 2)) {
    await alertOperator(
      `🧠 Heads up — engagement check\n\nLast 5 responses have been brief or low-energy. Not a diagnosis — just something you may want to keep an eye on. Response lengths: ${recent.map(e => e.responseLength).join(', ')} chars.`
    )
  }
}

// ─── Main integration hooks ───────────────────────────────────────────────────

/**
 * Called by the cron route for each slot.
 * Returns the message to send, or null if not needed.
 */
export async function getCognitionPrompt(
  profile: UserProfile,
  slot: CognitionSlot
): Promise<string | null> {
  const cfg = (profile as any).cognition
  if (cfg?.enabled === false) return null

  const ready = await isSlotReady(profile.phone, slot)
  if (!ready) return null

  const state = await getState(profile.phone)

  // Week 1: interest survey
  if (!state.surveyDone) {
    const q = await getNextSurveyQuestion(profile.phone)
    if (q) {
      await markSlotDelivered(profile.phone, slot)
      return q
    }
  }

  const game = await generateGame(profile.phone, slot)
  await markSlotDelivered(profile.phone, slot)
  return game.prompt
}

/**
 * Called by SMS/Telegram handler on every inbound message.
 * Checks if user is responding to a cognition prompt and logs engagement.
 * Returns true if this was a cognition interaction.
 */
export async function handleCognitionResponse(
  profile: UserProfile,
  message: string,
  slot: CognitionSlot
): Promise<boolean> {
  const state = await getState(profile.phone)

  // Survey in progress — record the answer
  if (!state.surveyDone) {
    const { done } = await recordSurveyAnswer(profile.phone, message)
    return true
  }

  // Check if there was a recent game for this slot (within 2 hours)
  const last = state.lastGameBySlot[slot]
  if (last && (Date.now() - new Date(last).getTime()) < 2 * 60 * 60 * 1000) {
    await scoreResponse(profile.phone, slot, message)
    return true
  }

  return false
}

/**
 * Infer the current slot from wall-clock time (CT).
 */
export function getCurrentSlot(): CognitionSlot {
  const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).getHours()
  if (hour < 11) return 'morning'
  if (hour < 16) return 'midday'
  return 'evening'
}
