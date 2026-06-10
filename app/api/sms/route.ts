/**
 * POST /api/sms — Twilio inbound SMS webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadProfile, updateProfile } from '@/lib/profile'
import { processMessage } from '@/lib/brain'
import { safeLoadProfile } from '@/lib/integrity'
import { sendToUser } from '@/lib/channels'
import { guardianGate } from '@/lib/guardian'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''

function validateTwilioSignature(req: NextRequest, body: URLSearchParams): boolean {
  if (!AUTH_TOKEN || AUTH_TOKEN.includes('placeholder')) return true
  const sig = req.headers.get('X-Twilio-Signature') || ''
  const url = `${BASE_URL}/api/sms`
  const str = Array.from(body.entries()).sort(([a], [b]) => a.localeCompare(b)).reduce((acc, [k, v]) => acc + k + v, url)
  const expected = crypto.createHmac('sha1', AUTH_TOKEN).update(str).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch { return false }
}

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message></Response>`
  return new NextResponse(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text()
    const body = new URLSearchParams(bodyText)

    try {
      if (!validateTwilioSignature(req, body)) {
        console.error('Invalid Twilio signature')
        return new NextResponse('Forbidden', { status: 403 })
      }
    } catch {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const from = body.get('From') || ''
    const messageBody = body.get('Body')?.trim() || ''
    if (!from || !messageBody) return new NextResponse('Bad Request', { status: 400 })

    // Use integrity-aware loader — alerts operator if Redis is down
    const profile = await safeLoadProfile(from)

    if (!profile) {
      // Redis is up but no profile — unknown number, direct to onboard
      const onboardUrl = `${BASE_URL}/onboard`
      // Direct Twilio TwiML reply (can't use sendToUser without a profile)
      return twiml(`Hey! I'm your AI assistant. To get started, visit: ${onboardUrl}`)
    }

    if (!profile.active) {
      return twiml("Your account is currently inactive. Contact support to reactivate.")
    }

    // Touch last seen
    await updateProfile(from, { lastSeen: new Date().toISOString() })

    // Guardian gate — scam protection for elderly/protected users
    const guardianResult = await guardianGate(profile, messageBody, from)
    if (guardianResult.action === 'block' && guardianResult.reply) {
      return twiml(guardianResult.reply)
    }
    if (guardianResult.action === 'warn' && guardianResult.reply) {
      // Send warning then also let brain respond
      const { reply: brainReply } = await processMessage(profile, messageBody)
      return twiml(guardianResult.reply + ' ' + brainReply)
    }

    const { reply } = await processMessage(profile, messageBody)
    return twiml(reply)
  } catch (err) {
    console.error('[sms] webhook error:', err)
    return twiml("Something went wrong. Try again in a moment.")
  }
}

export const runtime = 'nodejs'
