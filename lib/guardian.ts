/**
 * Guardian layer — wraps the brain for elderly/protected users.
 *
 * Every inbound message passes through here first.
 * Handles scam detection, operator alerts, and daily check-ins.
 */

import { UserProfile } from './profile'
import { analyzeMessage, extractAndLearnContacts, formatWarnMessage, formatBlockMessage, ScamResult } from './scam'
import { alertOperator } from './integrity'
import { sendToUser } from './channels'

// ─── Guardian profile extension ───────────────────────────────────────────────
// Added to UserProfile when guardian mode is enabled

export interface GuardianConfig {
  enabled: boolean
  operatorPhone: string         // who to alert (Bubba)
  operatorName: string          // "Bubba and Helen" — personalized alerts
  checkInEnabled: boolean
  checkInTime: string           // "09:00" local time
  checkInMessage: string        // what the assistant says each morning
  lastCheckInResponse?: string  // ISO timestamp
  missedCheckIns: number        // consecutive missed check-ins before escalation
}

// ─── Inbound message gate ────────────────────────────────────────────────────

export interface GuardianResult {
  action: 'pass' | 'warn' | 'block'
  reply?: string                // set if guardian handles the reply itself
  scamResult?: ScamResult
}

export async function guardianGate(
  profile: UserProfile,
  message: string,
  senderIdentifier: string
): Promise<GuardianResult> {
  const config = (profile as UserProfile & { guardian?: GuardianConfig }).guardian
  if (!config?.enabled) {
    return { action: 'pass' }
  }

  // Learn contacts conversationally
  await extractAndLearnContacts(message, profile.phone)

  // Check if user is asking assistant to analyze a suspicious message
  const isForwardingForAnalysis = /is this (legit|real|safe|a scam|spam|fake)/i.test(message) ||
    /check this (out|message|text|email)/i.test(message) ||
    /someone (texted|called|emailed|sent)/i.test(message)

  if (isForwardingForAnalysis) {
    // User is asking for help — don't gate, pass to brain with scam-analysis context
    return { action: 'pass' }
  }

  // Run scam analysis on the inbound message
  const result = await analyzeMessage(message, senderIdentifier, profile.phone)

  if (result.verdict === 'BLOCK') {
    // Alert operator
    await alertOperator(
      `🚨 SCAM BLOCKED for ${profile.name} (${profile.phone})\n\nCategory: ${result.category || 'unknown'}\nSender: ${senderIdentifier}\nMessage: "${message.slice(0, 200)}"\nConfidence: ${Math.round(result.confidence * 100)}%\n\nMessage was blocked. ${profile.name} was notified it was a scam.`
    )

    return {
      action: 'block',
      reply: formatBlockMessage(result),
      scamResult: result,
    }
  }

  if (result.verdict === 'WARN') {
    // Alert operator
    await alertOperator(
      `⚠️ SUSPICIOUS message for ${profile.name} (${profile.phone})\n\nCategory: ${result.category || 'unknown'}\nSender: ${senderIdentifier}\nMessage: "${message.slice(0, 200)}"\nReasons: ${result.reasons.join('; ')}\nConfidence: ${Math.round(result.confidence * 100)}%\n\n${profile.name} has been warned. Review and advise if needed.`
    )

    return {
      action: 'warn',
      reply: formatWarnMessage(result, senderIdentifier !== 'unknown' ? senderIdentifier : undefined),
      scamResult: result,
    }
  }

  return { action: 'pass', scamResult: result }
}

// ─── Daily check-in ───────────────────────────────────────────────────────────

export async function sendDailyCheckIn(profile: UserProfile): Promise<void> {
  const config = (profile as UserProfile & { guardian?: GuardianConfig }).guardian
  if (!config?.enabled || !config.checkInEnabled) return

  const msg = config.checkInMessage || `Good morning ${profile.name}! How are you feeling today? Just reply and let me know you're doing well. 😊`
  await sendToUser(profile, msg)
}

export async function handleCheckInResponse(profile: UserProfile): Promise<void> {
  const config = (profile as UserProfile & { guardian?: GuardianConfig }).guardian
  if (!config?.enabled) return

  // Reset missed check-ins counter
  const updated = {
    ...profile,
    guardian: { ...config, lastCheckInResponse: new Date().toISOString(), missedCheckIns: 0 }
  }

  const { saveProfile } = await import('./profile')
  await saveProfile(updated as UserProfile)
}

export async function escalateMissedCheckIn(profile: UserProfile): Promise<void> {
  const config = (profile as UserProfile & { guardian?: GuardianConfig }).guardian
  if (!config?.enabled || !config.checkInEnabled) return

  const missed = (config.missedCheckIns || 0) + 1

  // Update missed count
  const { saveProfile } = await import('./profile')
  await saveProfile({ ...profile, guardian: { ...config, missedCheckIns: missed } } as UserProfile)

  if (missed >= 2) {
    await alertOperator(
      `🔴 CHECK-IN MISSED — ${profile.name}\n\nMissed ${missed} consecutive morning check-ins.\nLast response: ${config.lastCheckInResponse ? new Date(config.lastCheckInResponse).toLocaleString() : 'never'}\n\nYou may want to check in personally.`
    )
  }
}

// ─── Email triage ─────────────────────────────────────────────────────────────
// User forwards email text to assistant, we analyze it

export async function analyzeEmail(
  emailContent: string,
  senderEmail: string,
  userPhone: string
): Promise<{ verdict: 'safe' | 'warn' | 'block'; explanation: string }> {
  const result = await analyzeMessage(emailContent, senderEmail, userPhone)

  if (result.verdict === 'BLOCK') {
    return {
      verdict: 'block',
      explanation: `🚫 That email is a scam — I'm certain of it. Do NOT click any links, call any numbers, or reply. Just delete it. I've let your family know.`
    }
  }

  if (result.verdict === 'WARN') {
    const reasonText = result.reasons.slice(0, 2).join(' Also, ')
    return {
      verdict: 'warn',
      explanation: `⚠️ That email looks suspicious. ${reasonText} I'd recommend not responding or clicking anything. Want me to ask your family to take a look?`
    }
  }

  return {
    verdict: 'safe',
    explanation: `That email looks legitimate to me. ${senderEmail ? `It's from ${senderEmail}. ` : ''}Always okay to double-check with family if you're unsure.`
  }
}
