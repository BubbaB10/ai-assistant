/**
 * Query classifier
 * Uses GPT-4o-mini for fast, cheap classification before fetching context
 */

import OpenAI from 'openai'

export type QueryType =
  | 'financial'   // spending, transactions, income questions
  | 'budget'      // budget limits, overspending, allowances
  | 'advice'      // general financial or life advice
  | 'reminder'    // scheduling, reminders, upcoming events
  | 'greeting'    // hello, hi, who are you
  | 'goal'        // saving goals, progress, targets
  | 'onboarding'  // setup, goals answer during onboarding
  | 'unknown'     // catch-all

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const SYSTEM_PROMPT = `You are a query classifier for an SMS financial assistant. 
Classify the user's message into exactly one category:
- financial: questions about spending, transactions, income, account balances, what they spent
- budget: questions about budget limits, whether over/under budget, remaining budget
- advice: requests for advice, recommendations, decisions, or general help
- reminder: scheduling, reminders, upcoming events, calendar
- greeting: hello, hi, who are you, what can you do
- goal: saving goals, progress toward a goal, target amounts
- onboarding: response to "what's your financial goal?" onboarding question
- unknown: anything else

Respond with ONLY the category name, nothing else.`

export async function classifyQuery(message: string): Promise<QueryType> {
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      max_tokens: 10,
      temperature: 0,
    })

    const result = response.choices[0]?.message?.content?.trim().toLowerCase()

    const validTypes: QueryType[] = [
      'financial', 'budget', 'advice', 'reminder', 'greeting', 'goal', 'onboarding', 'unknown'
    ]

    if (result && validTypes.includes(result as QueryType)) {
      return result as QueryType
    }

    return 'unknown'
  } catch (error) {
    console.error('Classification error:', error)
    return 'unknown'
  }
}

// Lightweight keyword-based fallback (no API call)
export function classifyQueryLocal(message: string): QueryType {
  const lower = message.toLowerCase()

  if (/^(hi|hey|hello|howdy|what can you|who are you|help me get started)/.test(lower)) {
    return 'greeting'
  }

  if (/(spent|spend|transaction|purchase|bought|charge|payment|cost|expense)/.test(lower)) {
    return 'financial'
  }

  if (/(budget|over budget|under budget|limit|allowance|remaining|left in my)/.test(lower)) {
    return 'budget'
  }

  if (/(save|saving|goal|target|on track|progress toward)/.test(lower)) {
    return 'goal'
  }

  if (/(remind|reminder|schedule|appointment|event|calendar|when is|next week)/.test(lower)) {
    return 'reminder'
  }

  if (/(should i|advice|recommend|what do you think|help me decide|better to)/.test(lower)) {
    return 'advice'
  }

  return 'unknown'
}
