/**
 * Core GPT conversation handler.
 * Every inbound message runs through here regardless of channel.
 */

import OpenAI from 'openai'
import { UserProfile } from './profile'
import { getHistory, appendHistory, ConversationMessage } from './redis'
import { classifyQuery } from './classify'
import { assembleContext } from './context'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// SMS max 320 chars. Telegram/WhatsApp can breathe a bit more.
const MAX_CHARS: Record<string, number> = {
  sms: 320,
  telegram: 1200,
  whatsapp: 800,
}

export interface BrainResponse {
  reply: string
  queryType: string
  usedModel: string
}

export async function processMessage(
  profile: UserProfile,
  incomingMessage: string
): Promise<BrainResponse> {
  const queryType = await classifyQuery(incomingMessage)
  const { systemPrompt, useExpensiveModel } = await assembleContext(profile, queryType)
  const history: ConversationMessage[] = await getHistory(profile.phone)
  const model = useExpensiveModel ? 'gpt-4o' : 'gpt-4o-mini'

  const maxTokens = profile.channel === 'sms' ? 150 : profile.channel === 'telegram' ? 400 : 250

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: incomingMessage },
  ]

  let reply: string
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    })
    reply = response.choices[0]?.message?.content?.trim() ?? "Sorry, couldn't process that. Try again?"
  } catch (err) {
    console.error('[brain] OpenAI error:', err)
    reply = "Having a brain hiccup. Try again in a sec."
  }

  // Enforce channel length limit
  const maxChars = MAX_CHARS[profile.channel] ?? 320
  if (reply.length > maxChars) {
    reply = reply.slice(0, maxChars - 3) + '...'
  }

  await appendHistory(profile.phone, incomingMessage, reply)

  return { reply, queryType, usedModel: model }
}

export async function generateWeeklySummary(profile: UserProfile): Promise<string> {
  const { systemPrompt } = await assembleContext(profile, 'financial')
  const maxChars = MAX_CHARS[profile.channel] ?? 320

  const prompt = `Generate a short weekly check-in for ${profile.name}. Mention 1 thing they did well and 1 thing to keep an eye on. Keep it under ${maxChars} characters. Sound like a friend, not a report.`

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 150,
      temperature: 0.8,
    })
    return response.choices[0]?.message?.content?.trim() ?? 'Weekly check-in unavailable.'
  } catch {
    return 'Weekly check-in unavailable — try again later.'
  }
}
