/**
 * Memory integrity layer — the Hermes gate for user profiles.
 *
 * Rules:
 * 1. Every profile save is verified (read-back check in profile.ts).
 * 2. If verification fails → alert operator via Telegram immediately.
 * 3. Daily health check → scan all profiles, flag missing/corrupt ones.
 * 4. If Redis is completely down → alert operator, respond to user with
 *    "I'm having a memory issue — my operator has been notified" — never pretend.
 */

import { loadProfile, listAllProfiles, SaveResult, UserProfile } from './profile'
import { isRedisConfigured } from './redis'

const OPERATOR_TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const OPERATOR_CHAT_ID = process.env.OPERATOR_TELEGRAM_CHAT_ID || ''  // Bubba's chat ID

// ─── Alert operator via Telegram ─────────────────────────────────────────────

export async function alertOperator(message: string): Promise<void> {
  console.error('[INTEGRITY ALERT]', message)

  if (!OPERATOR_TELEGRAM_TOKEN || !OPERATOR_CHAT_ID) {
    console.error('[integrity] Telegram not configured — operator alert not sent')
    return
  }

  try {
    await fetch(`https://api.telegram.org/bot${OPERATOR_TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OPERATOR_CHAT_ID,
        text: `🚨 AI Assistant Memory Alert\n\n${message}`,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    console.error('[integrity] Failed to send Telegram alert:', err)
  }
}

// ─── Check save result and alert if bad ──────────────────────────────────────

export async function verifySave(
  result: SaveResult,
  context: string,
  phone: string
): Promise<void> {
  if (result.ok && result.verified) return  // All good

  if (!result.ok) {
    await alertOperator(
      `❌ Profile save FAILED for ${phone}\nContext: ${context}\nError: ${result.error || 'unknown'}\n\nAction required: check Redis connectivity immediately.`
    )
    return
  }

  if (!result.verified) {
    await alertOperator(
      `⚠️ Profile save succeeded but read-back MISMATCH for ${phone}\nContext: ${context}\nError: ${result.error || 'data may be corrupt'}\n\nAction required: verify Redis data integrity.`
    )
  }
}

// ─── Check Redis health ───────────────────────────────────────────────────────

export async function checkRedisHealth(): Promise<{ ok: boolean; error?: string }> {
  if (!isRedisConfigured) {
    return { ok: false, error: 'Redis env vars not configured' }
  }

  try {
    const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!
    const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!
    const testKey = 'health:ping'
    const testVal = Date.now().toString()

    // Write
    const setRes = await fetch(`${REDIS_URL}/set/${testKey}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: testVal, ex: 60 }),
    })
    if (!setRes.ok) return { ok: false, error: `Redis SET failed: ${setRes.status}` }

    // Read back
    const getRes = await fetch(`${REDIS_URL}/get/${testKey}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    })
    if (!getRes.ok) return { ok: false, error: `Redis GET failed: ${getRes.status}` }
    const data = await getRes.json()
    const readVal = data.result ? JSON.parse(data.result) : null
    if (readVal !== testVal) return { ok: false, error: 'Redis read-back mismatch on health check' }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ─── Daily profile health scan ────────────────────────────────────────────────

export interface ProfileHealthResult {
  phone: string
  status: 'ok' | 'missing' | 'corrupt' | 'stale'
  detail?: string
}

export async function runProfileHealthScan(): Promise<ProfileHealthResult[]> {
  const results: ProfileHealthResult[] = []

  // First check Redis itself
  const redisHealth = await checkRedisHealth()
  if (!redisHealth.ok) {
    await alertOperator(
      `🔴 Redis health check FAILED\nError: ${redisHealth.error}\n\nAll user profiles may be inaccessible. Investigate immediately.`
    )
    return [{ phone: 'SYSTEM', status: 'missing', detail: `Redis down: ${redisHealth.error}` }]
  }

  const phones = await listAllProfiles()

  if (phones.length === 0) {
    // No profiles yet — only an issue if we expect them
    return []
  }

  const staleThresholdDays = 30
  const now = Date.now()

  for (const phone of phones) {
    try {
      const profile = await loadProfile(phone)
      if (!profile) {
        results.push({ phone, status: 'missing', detail: 'Key exists in index but profile returned null' })
        continue
      }

      // Check for stale profiles (not seen in 30 days but still active)
      if (profile.active && profile.lastSeen) {
        const daysSince = (now - new Date(profile.lastSeen).getTime()) / 86400000
        if (daysSince > staleThresholdDays) {
          results.push({ phone, status: 'stale', detail: `Last seen ${Math.floor(daysSince)} days ago` })
          continue
        }
      }

      // Basic integrity check — required fields present
      if (!profile.name || !profile.phone || !profile.channel) {
        results.push({ phone, status: 'corrupt', detail: 'Missing required fields (name/phone/channel)' })
        continue
      }

      results.push({ phone, status: 'ok' })
    } catch (err) {
      results.push({ phone, status: 'corrupt', detail: String(err) })
    }
  }

  // Alert on any non-ok results
  const problems = results.filter(r => r.status !== 'ok')
  if (problems.length > 0) {
    const summary = problems.map(p => `• ${p.phone}: ${p.status}${p.detail ? ` — ${p.detail}` : ''}`).join('\n')
    await alertOperator(
      `⚠️ Daily profile health scan found ${problems.length} issue(s):\n\n${summary}\n\nTotal profiles: ${phones.length}`
    )
  }

  return results
}

// ─── Safe profile loader (used in inbound message handler) ───────────────────
// Returns profile or null + fires operator alert if Redis is down.

export async function safeLoadProfile(phone: string): Promise<UserProfile | null> {
  if (!isRedisConfigured) {
    await alertOperator(
      `🔴 Redis not configured — cannot load profile for ${phone}\n\nThe user received a memory-error response. Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel immediately.`
    )
    return null
  }

  const profile = await loadProfile(phone)
  if (!profile) {
    // Could be new user (not onboarded yet) — don't alert for that
    // Only alert if Redis itself seems up but profile is unexpectedly missing
    const redisOk = await checkRedisHealth()
    if (redisOk.ok) {
      // Redis is fine, user just hasn't onboarded
      return null
    } else {
      await alertOperator(
        `🔴 Redis is DOWN — failed to load profile for ${phone}\nRedis error: ${redisOk.error}\n\nUser received a degraded response.`
      )
      return null
    }
  }

  return profile
}
