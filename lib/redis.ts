/**
 * Redis conversation history store
 * Uses Upstash Redis. Falls back to in-memory if unconfigured.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// In-memory fallback store (per-process, non-persistent)
const memoryStore: Record<string, ConversationMessage[]> = {}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''
const isRedisConfigured =
  REDIS_URL && !REDIS_URL.includes('placeholder') && REDIS_TOKEN && !REDIS_TOKEN.includes('placeholder')

const TTL_SECONDS = 60 * 60 * 24 // 24 hours
const MAX_EXCHANGES = 5 // last 5 exchanges = 10 messages

async function redisGet<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.result === null || data.result === undefined) return null
    return JSON.parse(data.result) as T
  } catch {
    return null
  }
}

async function redisSet(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: JSON.stringify(value), ex: ttl }),
    })
  } catch {
    // silently fail
  }
}

export async function getHistory(phone: string): Promise<ConversationMessage[]> {
  const key = `history:${phone}`

  if (isRedisConfigured) {
    const stored = await redisGet<ConversationMessage[]>(key)
    return stored ?? []
  }

  // Fallback: in-memory
  return memoryStore[key] ?? []
}

export async function appendHistory(
  phone: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const key = `history:${phone}`
  const existing = await getHistory(phone)

  const newMessages: ConversationMessage[] = [
    ...existing,
    { role: 'user', content: userMsg, timestamp: Date.now() },
    { role: 'assistant', content: assistantMsg, timestamp: Date.now() },
  ]

  // Keep only last MAX_EXCHANGES exchanges (2 messages per exchange)
  const trimmed = newMessages.slice(-MAX_EXCHANGES * 2)

  if (isRedisConfigured) {
    await redisSet(key, trimmed, TTL_SECONDS)
  } else {
    memoryStore[key] = trimmed
  }
}

export async function clearHistory(phone: string): Promise<void> {
  const key = `history:${phone}`

  if (isRedisConfigured) {
    try {
      await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      })
    } catch {
      // silently fail
    }
  } else {
    delete memoryStore[key]
  }
}
