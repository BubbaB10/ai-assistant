/**
 * POST /api/call — Twilio Voice webhook for call screening
 *
 * How it works:
 * 1. Father-in-law's phone forwards to a Twilio number (or Twilio IS his number)
 * 2. Unknown caller gets: "Please state your name and reason for calling"
 * 3. Recording analyzed by GPT — if suspicious, call rejected + operator alerted
 * 4. If clean, call forwarded to his real number
 * 5. Known callers (caller ID in trusted contacts) ring through immediately
 *
 * Setup: Point Twilio Voice webhook to POST /api/call
 */

import { NextRequest, NextResponse } from 'next/server'
import { isTrustedContact } from '@/lib/scam'
import { alertOperator } from '@/lib/integrity'

const FORWARD_TO = process.env.GUARDIAN_FORWARD_NUMBER || ''  // Father-in-law's real number
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

// Step 1: Incoming call — check trusted list or prompt for screening
export async function POST(req: NextRequest) {
  const body = new URLSearchParams(await req.text())
  const from = body.get('From') || 'unknown'
  const to = body.get('To') || ''

  // Find user profile by the Twilio number called
  // (Each protected user has their own Twilio number)
  const userPhone = to  // The Twilio number maps to a protected user

  const trusted = await isTrustedContact(userPhone, from)

  if (trusted) {
    // Known caller — ring straight through, no screening
    if (!FORWARD_TO) {
      return twiml(`<Say voice="alice">Connecting you now.</Say><Dial>${from}</Dial>`)
    }
    return twiml(`<Say voice="alice">One moment please.</Say><Dial>${FORWARD_TO}</Dial>`)
  }

  // Unknown caller — screen them
  return twiml(`
    <Gather action="${BASE_URL}/api/call/screen" method="POST" timeout="8">
      <Say voice="alice" rate="slow">
        Hello. You have reached a protected line. Please state your full name and reason for your call after the tone. Press any key when finished.
      </Say>
    </Gather>
    <Say voice="alice">We did not receive a response. Goodbye.</Say>
    <Hangup/>
  `)
}

export const runtime = 'nodejs'
