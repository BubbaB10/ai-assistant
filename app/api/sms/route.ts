/**
 * POST /api/sms — Twilio inbound webhook
 * All incoming SMS messages come through here
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadProfile } from '@/lib/profile'
import { processMessage } from '@/lib/brain'
import { sendSMS } from '@/lib/sms'
import { updateProfileGoals } from '@/lib/profile'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''

// Validate Twilio signature to prevent spoofed requests
function validateTwilioSignature(req: NextRequest, body: URLSearchParams): boolean {
  // Skip validation in development or if auth token is placeholder
  if (!AUTH_TOKEN || AUTH_TOKEN.includes('placeholder')) {
    console.warn('Twilio signature validation skipped (no auth token configured)')
    return true
  }

  const twilioSignature = req.headers.get('X-Twilio-Signature') || ''
  const url = `${BASE_URL}/api/sms`

  // Build the string to sign: url + sorted params
  const sortedParams = Array.from(body.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((acc, [key, val]) => acc + key + val, url)

  const expectedSignature = crypto
    .createHmac('sha1', AUTH_TOKEN)
    .update(sortedParams)
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(twilioSignature),
    Buffer.from(expectedSignature)
  )
}

function twimlResponse(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message>
</Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: NextRequest) {
  try {
    // Parse form body from Twilio
    const bodyText = await req.text()
    const body = new URLSearchParams(bodyText)

    // Validate Twilio signature
    try {
      if (!validateTwilioSignature(req, body)) {
        console.error('Invalid Twilio signature')
        return new NextResponse('Forbidden', { status: 403 })
      }
    } catch {
      // timingSafeEqual throws if buffers are different lengths
      console.error('Twilio signature validation failed')
      return new NextResponse('Forbidden', { status: 403 })
    }

    const from = body.get('From') || ''
    const messageBody = body.get('Body')?.trim() || ''

    if (!from || !messageBody) {
      return new NextResponse('Bad Request', { status: 400 })
    }

    console.log(`Inbound SMS from ${from}: ${messageBody}`)

    // Look up user profile
    const profile = loadProfile(from)

    if (!profile) {
      // Unknown number — direct to onboarding
      const onboardUrl = `${BASE_URL}/onboard`
      // Use sendSMS so it goes via Twilio outbound (not TwiML) — gives more control
      await sendSMS(
        from,
        `Hey! I'm Planner, your personal AI assistant. To get set up, visit: ${onboardUrl}`
      )
      return new NextResponse('', { status: 204 })
    }

    if (!profile.active) {
      return twimlResponse("Your account is currently inactive. Contact support to reactivate.")
    }

    // Check if this is an onboarding goals reply
    // (User has no goals set yet and is responding to our follow-up question)
    const isOnboardingGoal =
      profile.goals.length === 0 &&
      messageBody.length < 200 &&
      !messageBody.includes('?')

    if (isOnboardingGoal) {
      // Save as their goal
      updateProfileGoals(from, [messageBody])
      return twimlResponse(`Got it! "${messageBody}" — I'll keep that front of mind. Text me anything anytime.`)
    }

    // Run through the brain
    const { reply } = await processMessage(profile, messageBody)

    return twimlResponse(reply)
  } catch (err) {
    console.error('SMS webhook error:', err)
    return twimlResponse("Something went wrong on my end. Try again in a moment.")
  }
}

// Twilio sends POST requests; disable body size limit for webhook
export const runtime = 'nodejs'
