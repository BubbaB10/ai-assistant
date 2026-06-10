/**
 * Scam detection engine — protects elderly users from scammers.
 *
 * Three-tier verdict system:
 * - SAFE: known contact or clean content → pass through
 * - WARN: suspicious signals → warn user in plain English + alert operator
 * - BLOCK: confirmed scam pattern → block silently + alert operator
 *
 * Trusted contacts built conversationally over time — no form required.
 */

import OpenAI from 'openai'
import { redisGet, redisSet, redisKeys } from './redis'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScamVerdict = 'SAFE' | 'WARN' | 'BLOCK'

export interface ScamResult {
  verdict: ScamVerdict
  confidence: number       // 0–1
  reasons: string[]        // plain English, shown to user if WARN
  category?: string        // 'irs_impersonation' | 'grandparent_scam' | 'lottery' | etc.
  rawScore: number
}

export interface TrustedContact {
  identifier: string       // phone number, email address, or name
  name: string
  addedAt: string
  addedHow: 'conversational' | 'manual'
}

// ─── Hard pattern library — these are instant BLOCK ──────────────────────────

const BLOCK_PATTERNS = [
  // IRS / Government impersonation
  /\b(irs|internal revenue|social security administration|ssa|medicare|medicaid)\b.*\b(suspend|arrest|warrant|lawsuit|legal action|federal)\b/i,
  /\b(warrant|arrest|deport)\b.*\b(unless|immediately|now|today|call back)\b/i,

  // Gift card / wire transfer demands
  /\b(gift card|google play|apple gift|itunes card|steam card)\b.*\b(pay|send|buy|purchase)\b/i,
  /\b(wire transfer|western union|moneygram|zelle|cashapp|venmo)\b.*\b(immediately|urgent|today|now|verify)\b/i,

  // Lottery / prize scams
  /\b(won|winner|congratulations)\b.*\b(lottery|sweepstakes|prize|jackpot)\b.*\b(fee|tax|claim|send)\b/i,
  /\b(unclaimed|inheritance|million dollar)\b.*\b(transfer|fee|attorney|lawyer)\b/i,

  // Tech support scams
  /\b(microsoft|apple|windows|computer)\b.*\b(virus|hacked|compromised|infected|blocked)\b.*\b(call|remote|access)\b/i,
  /\b(tech support|technical support)\b.*\b(access|remote|install|download)\b/i,

  // Grandparent scam
  /\b(grandson|granddaughter|grandchild|nephew|niece)\b.*\b(jail|arrested|accident|hospital|bail)\b.*\b(send|wire|money|cash)\b/i,

  // Credential harvesting
  /\b(verify|confirm|validate)\b.*\b(social security|ssn|medicare number|bank account|routing number|password|pin)\b/i,
  /\b(account.*suspend|suspend.*account)\b.*\b(click|link|verify|confirm)\b/i,

  // Fake package delivery
  /\b(package|delivery|shipment)\b.*\b(held|suspended|fee|customs|release)\b.*\b(pay|click|verify)\b/i,

  // Romance / crypto scams
  /\b(bitcoin|crypto|investment)\b.*\b(guaranteed|double|profit|return)\b.*\b(send|transfer|invest)\b/i,
]

// Suspicious signals that bump toward WARN
const WARN_SIGNALS = [
  { pattern: /\bact (now|immediately|today|fast)\b/i, reason: 'Creates false urgency — legitimate organizations don\'t demand immediate action' },
  { pattern: /\bdon\'t tell (anyone|your family|your children)\b/i, reason: 'Trying to isolate you from family — classic scam tactic' },
  { pattern: /\bkeep (this|it) (secret|confidential|between us)\b/i, reason: 'Asking for secrecy — real businesses don\'t do this' },
  { pattern: /\b(click here|tap here|open this link)\b/i, reason: 'Suspicious link — could steal your information' },
  { pattern: /\byou (owe|have been selected|have won|are eligible)\b/i, reason: 'Unsolicited offers or demands are often scams' },
  { pattern: /\b(limited time|expires|last chance|final notice)\b/i, reason: 'Artificial deadline pressure — common scam technique' },
  { pattern: /\bverify your (account|information|identity|ssn|social)\b/i, reason: 'Asking for personal information by text is a red flag' },
  { pattern: /\b(free gift|free money|cash reward|bonus)\b/i, reason: 'Unsolicited offers of free money are almost always scams' },
  { pattern: /[A-Z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.(com|net)/i, reason: 'Sent from a personal email address, not a real organization' },
]

// ─── Trusted contacts store ───────────────────────────────────────────────────

const CONTACTS_TTL = 60 * 60 * 24 * 365 * 5  // 5 years

export async function getTrustedContacts(userPhone: string): Promise<TrustedContact[]> {
  const key = `trusted_contacts:${userPhone}`
  return (await redisGet<TrustedContact[]>(key)) ?? []
}

export async function addTrustedContact(
  userPhone: string,
  identifier: string,
  name: string,
  how: TrustedContact['addedHow'] = 'conversational'
): Promise<void> {
  const existing = await getTrustedContacts(userPhone)
  const normalized = identifier.toLowerCase().replace(/[\s\-\(\)]/g, '')
  if (existing.some(c => c.identifier.toLowerCase().replace(/[\s\-\(\)]/g, '') === normalized)) return

  const updated: TrustedContact[] = [
    ...existing,
    { identifier: identifier.toLowerCase(), name, addedAt: new Date().toISOString(), addedHow: how }
  ]
  const key = `trusted_contacts:${userPhone}`
  await redisSet(key, updated, CONTACTS_TTL)
}

export async function isTrustedContact(userPhone: string, identifier: string): Promise<boolean> {
  const contacts = await getTrustedContacts(userPhone)
  const normalized = identifier.toLowerCase().replace(/[\s\-\(\)]/g, '')
  return contacts.some(c => {
    const cn = c.identifier.toLowerCase().replace(/[\s\-\(\)]/g, '')
    return cn === normalized || normalized.includes(cn) || cn.includes(normalized)
  })
}

// ─── Core scam analysis ───────────────────────────────────────────────────────

export async function analyzeMessage(
  message: string,
  senderIdentifier: string,
  userPhone: string,
  useAI = true
): Promise<ScamResult> {
  // 1. Check trusted contacts first — trusted = SAFE immediately
  const trusted = await isTrustedContact(userPhone, senderIdentifier)
  if (trusted) {
    return { verdict: 'SAFE', confidence: 1.0, reasons: [], rawScore: 0 }
  }

  // 2. Check hard BLOCK patterns
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(message)) {
      return {
        verdict: 'BLOCK',
        confidence: 0.97,
        reasons: ['This matches a known scam pattern and has been blocked for your protection.'],
        category: detectCategory(message),
        rawScore: 10,
      }
    }
  }

  // 3. Check soft WARN signals
  const triggeredWarnings = WARN_SIGNALS.filter(s => s.pattern.test(message))
  let rawScore = triggeredWarnings.length

  // 4. AI analysis for borderline cases (score 1-3 or unknown sender)
  let aiReasons: string[] = []
  let aiScore = 0

  if (useAI && (rawScore > 0 || senderIdentifier === 'unknown')) {
    try {
      const aiResult = await aiScamAnalysis(message, senderIdentifier)
      aiScore = aiResult.score
      aiReasons = aiResult.reasons
      rawScore += aiScore
    } catch {
      // If AI fails, rely on pattern matching only
    }
  }

  const allReasons = [
    ...triggeredWarnings.map(w => w.reason),
    ...aiReasons,
  ]

  // 5. Final verdict
  if (rawScore >= 4) {
    return { verdict: 'BLOCK', confidence: Math.min(0.95, 0.7 + rawScore * 0.05), reasons: allReasons, category: detectCategory(message), rawScore }
  }
  if (rawScore >= 1) {
    return { verdict: 'WARN', confidence: Math.min(0.85, 0.5 + rawScore * 0.1), reasons: allReasons, category: detectCategory(message), rawScore }
  }
  return { verdict: 'SAFE', confidence: 0.8, reasons: [], rawScore: 0 }
}

async function aiScamAnalysis(message: string, sender: string): Promise<{ score: number; reasons: string[] }> {
  const prompt = `You are a scam detection system protecting an elderly person from fraud.

Analyze this message and rate the scam risk from 0-5.

Sender: ${sender || 'unknown'}
Message: "${message}"

Respond in this exact JSON format only:
{
  "score": <0-5>,
  "reasons": ["plain English reason 1", "plain English reason 2"]
}

Score guide:
0 = clearly legitimate
1 = slightly suspicious
2 = moderately suspicious  
3 = likely scam
4 = almost certainly scam
5 = confirmed scam pattern

Reasons must be plain English that an elderly person can understand. Max 2 reasons. Empty array if score is 0-1.`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(raw)
  return {
    score: Math.min(5, Math.max(0, Number(parsed.score) || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 2) : [],
  }
}

function detectCategory(message: string): string {
  if (/irs|internal revenue|tax|warrant|arrest/i.test(message)) return 'government_impersonation'
  if (/gift card|google play|apple gift|itunes/i.test(message)) return 'gift_card_demand'
  if (/won|winner|lottery|prize|jackpot/i.test(message)) return 'lottery_scam'
  if (/microsoft|apple|virus|hacked|tech support/i.test(message)) return 'tech_support_scam'
  if (/grandson|granddaughter|grandchild|jail|bail/i.test(message)) return 'grandparent_scam'
  if (/bitcoin|crypto|investment|guaranteed/i.test(message)) return 'investment_scam'
  if (/verify|confirm|account|suspend/i.test(message)) return 'phishing'
  if (/package|delivery|shipment/i.test(message)) return 'fake_delivery'
  return 'unknown'
}

// ─── Format user-facing warning message ──────────────────────────────────────

export function formatWarnMessage(result: ScamResult, senderName?: string): string {
  const from = senderName ? `from ${senderName} ` : ''
  const reasonList = result.reasons.slice(0, 2).join(' Also: ')

  return `⚠️ Heads up — that message ${from}looks suspicious. ${reasonList} Don't click any links or share personal info. Want me to check it out further?`
}

export function formatBlockMessage(result: ScamResult): string {
  const category = result.category?.replace(/_/g, ' ') || 'scam'
  return `🛡️ I blocked a ${category} message for you. It matched a known fraud pattern. Your family has been notified. You're safe — just ignore it if you see it again.`
}

// ─── Conversational contact learning ─────────────────────────────────────────
// When user mentions someone by name in conversation, learn them as trusted.

export async function extractAndLearnContacts(
  message: string,
  userPhone: string
): Promise<void> {
  // Simple heuristic: if user says "that was my [relation] [name]" or "add [name] to safe list"
  const addPatterns = [
    /add (.+?) (to|as) (safe|trusted|my contacts)/i,
    /that was my (son|daughter|wife|husband|sister|brother|friend|doctor|bank|church) (.+)/i,
    /(.+?) is (safe|trusted|my son|my daughter|my wife|my husband|my doctor)/i,
  ]

  for (const pattern of addPatterns) {
    const match = message.match(pattern)
    if (match) {
      // Extract the name/identifier — rough heuristic, good enough for now
      const candidate = match[1] || match[2]
      if (candidate && candidate.length > 1 && candidate.length < 50) {
        await addTrustedContact(userPhone, candidate.trim(), candidate.trim(), 'conversational')
      }
    }
  }
}
