/**
 * Core GPT conversation handler — the brain of the assistant
 * Every inbound SMS runs through this
 */

import OpenAI from 'openai'
import { UserProfile } from './profile'
import { getHistory, appendHistory, ConversationMessage } from './redis'
import { classifyQuery } from './classify'
import { assembleContext } from './context'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const MAX_RESPONSE_CHARS = 320

export interface BrainResponse {
  reply: string
  queryType: string
  usedModel: string
}

export async function processMessage(
  profile: UserProfile,
  incomingMessage: string
): Promise<BrainResponse> {
  // Step 1: Classify the query
  const queryType = await classifyQuery(incomingMessage)

  // Step 2: Assemble context (tier 1 + tier 2 based on query type)
  const { systemPrompt, useExpensiveModel } = await assembleContext(profile, queryType)

  // Step 3: Load conversation history from Redis
  const history: ConversationMessage[] = await getHistory(profile.phone)

  // Step 4: Build messages array for OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: incomingMessage },
  ]

  // Step 5: Select model based on query type
  const model = useExpensiveModel ? 'gpt-4o' : 'gpt-4o-mini'

  // Step 6: Call OpenAI
  let reply: string
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 150, // ~320 chars max for SMS
      temperature: 0.7,
    })

    reply = response.choices[0]?.message?.content?.trim() ?? "Sorry, I couldn't process that. Try again?"
  } catch (err) {
    console.error('OpenAI error:', err)
    reply = "Having a brain hiccup. Try again in a sec."
  }

  // Enforce SMS length limit
  if (reply.length > MAX_RESPONSE_CHARS) {
    reply = reply.slice(0, MAX_RESPONSE_CHARS - 3) + '...'
  }

  // Step 7: Save exchange to Redis
  await appendHistory(profile.phone, incomingMessage, reply)

  return { reply, queryType, usedModel: model }
}

// Generate proactive weekly summary for a user
export async function generateWeeklySummary(profile: UserProfile): Promise<string> {
  const { systemPrompt } = await assembleContext(profile, 'financial')

  const prompt = `Generate a weekly financial summary for ${profile.name}. Keep it under 280 characters. Be specific with numbers if available. Mention 1-2 wins and 1 thing to watch. Sound like a friend, not a report.`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 120,
      temperature: 0.8,
    })

    return response.choices[0]?.message?.content?.trim() ?? 'Weekly summary unavailable.'
  } catch {
    return 'Weekly summary unavailable — check back later.'
  }
}
