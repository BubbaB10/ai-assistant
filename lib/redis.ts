/**
 * Redis store — conversation history + user profiles
 * Uses Upstash Redis REST API.
 * NO silent fallback for profiles — if Redis is down, we alert, not pretend.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// In-memory fallback for conversation history ONLY (not profiles)
const memoryStore: Record<string, ConversationMessage[]> = {}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''

export const isRedisConfigured =
  !!REDIS_URL &&
  !REDIS_URL.includes('placeholder') &&
  !!REDIS_TOKEN &&
  !REDIS_TOKEN.includes('placeholder')

const HISTORY_TTL = 60 * 60 * 24 * 7  // 7 days (was 24h — extended for relationship continuity)
const PROFILE_TTL = 60 * 60 * 24 * 365 // 1 year — profiles are long-lived
const MAX_EXCHANGES = 10 // last 10 exchanges = 20 messages (was 5 — more context)

// ─── Core Redis helpers ──────────────────────────────────────────────────────

export async function redisGet<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured) return null
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

export async function redisSet(key: string, value: unknown, ttl: number): Promise<boolean> {
  if (!isRedisConfigured) return false
  try {
    const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: JSON.stringify(value), ex: ttl }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function redisDel(key: string): Promise<void> {
  if (!isRedisConfigured) return
  try {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
  } catch { /* ignore */ }
}

export async function redisKeys(pattern: string): Promise<string[]> {
  if (!isRedisConfigured) return []
  try {
    const res = await fetch(`${REDIS_URL}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.result ?? []
  } catch {
    return []
  }
}

// ─── Conversation history ─────────────────────────────────────────────────────

export async function getHistory(phone: string): Promise<ConversationMessage[]> {
  const key = `history:${phone}`
  if (isRedisConfigured) {
    const stored = await redisGet<ConversationMessage[]>(key)
    return stored ?? []
  }
  return memoryStore[key] ?? []
}

export async function appendHistory(
  phone: string,
  userMsg: string,
  assistantMsg: string
): Promise<void> {
  const key = `history:${phone}`
  const existing = await getHistory(phone)
  const updated = [
    ...existing,
    { role: 'user' as const, content: userMsg, timestamp: Date.now() },
    { role: 'assistant' as const, content: assistantMsg, timestamp: Date.now() },
  ].slice(-MAX_EXCHANGES * 2)

  if (isRedisConfigured) {
    await redisSet(key, updated, HISTORY_TTL)
  } else {
    memoryStore[key] = updated
  }
}

export async function clearHistory(phone: string): Promise<void> {
  const key = `history:${phone}`
  if (isRedisConfigured) {
    await redisDel(key)
  } else {
    delete memoryStore[key]
  }
}

// ─── Profile persistence in Redis ────────────────────────────────────────────
// Profiles NEVER use in-memory fallback — silent loss is not acceptable.

export async function redisGetProfile<T>(phone: string): Promise<T | null> {
  const key = `profile:${phone}`
  return redisGet<T>(key)
}

export async function redisSetProfile<T>(phone: string, profile: T): Promise<{ ok: boolean; verified: boolean }> {
  const key = `profile:${phone}`
  const ok = await redisSet(key, profile, PROFILE_TTL)
  if (!ok) return { ok: false, verified: false }

  // Verify: read back and confirm it round-trips
  const readBack = await redisGet<T>(key)
  const verified = readBack !== null && JSON.stringify(readBack) === JSON.stringify(profile)
  return { ok, verified }
}

export async function redisProfileExists(phone: string): Promise<boolean> {
  const profile = await redisGetProfile(phone)
  return profile !== null
}

export async function redisListProfiles(): Promise<string[]> {
  const keys = await redisKeys('profile:*')
  return keys.map(k => k.replace('profile:', ''))
}
