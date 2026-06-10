/**
 * POST /api/call/screen — analyzes caller's spoken screening response
 * Called by Twilio after caller states their name/reason
 */

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { alertOperator } from '@/lib/integrity'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const FORWARD_TO = process.env.GUARDIAN_FORWARD_NUMBER || ''
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

function twiml(xml: string): NextResponse {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: NextRequest) {
  const body = new URLSearchParams(await req.text())
  const speechResult = body.get('SpeechResult') || ''
  const from = body.get('From') || 'unknown'
  const digits = body.get('Digits') || ''

  // No response at all — hang up
  if (!speechResult && !digits) {
    await alertOperator(`📵 Silent call attempt blocked from ${from} — no screening response.`)
    return twiml(`<Say voice="alice">No response received. Goodbye.</Say><Hangup/>`)
  }

  // Analyze the screening response
  const verdict = await analyzeCallerResponse(speechResult, from)

  if (verdict.suspicious) {
    await alertOperator(
      `📵 SUSPICIOUS CALL SCREENED — from ${from}\n\nCaller said: "${speechResult}"\nReason flagged: ${verdict.reason}\n\nCall was rejected. Review if needed.`
    )
    return twiml(`
      <Say voice="alice" rate="slow">
        Thank you. We will pass along your message. Goodbye.
      </Say>
      <Hangup/>
    `)
  }

  // Looks legitimate — notify operator and connect
  await alertOperator(
    `📞 Screened call connecting — from ${from}\nCaller said: "${speechResult}"\nAssessment: ${verdict.reason}`
  )

  if (!FORWARD_TO) {
    return twiml(`<Say voice="alice">Connecting you now.</Say>`)
  }

  return twiml(`
    <Say voice="alice" rate="slow">
      Thank you. One moment please.
    </Say>
    <Dial>${FORWARD_TO}</Dial>
  `)
}

async function analyzeCallerResponse(
  speech: string,
  callerNumber: string
): Promise<{ suspicious: boolean; reason: string }> {
  if (!speech || speech.trim().length < 3) {
    return { suspicious: true, reason: 'No substantive response given' }
  }

  // Hard patterns in spoken response
  const scamPhrases = [
    /social security|irs|medicare|warrant|arrest|lawsuit/i,
    /gift card|wire transfer|bank account|routing number/i,
    /microsoft|windows|virus|computer|tech support/i,
    /won|prize|lottery|inheritance|million/i,
    /urgent|immediately|today only|act now/i,
  ]

  for (const p of scamPhrases) {
    if (p.test(speech)) {
      return { suspicious: true, reason: `Caller mentioned: "${speech.slice(0, 80)}" — matches scam pattern` }
    }
  }

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `A caller to an elderly person's phone said this when asked to state their name and reason for calling: "${speech}"

Is this suspicious? Reply with JSON only: {"suspicious": true/false, "reason": "one sentence"}`
      }],
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(raw)
    return {
      suspicious: Boolean(parsed.suspicious),
      reason: String(parsed.reason || 'AI assessment'),
    }
  } catch {
    // If AI fails, default to connecting — don't block legitimate calls on AI failure
    return { suspicious: false, reason: 'AI analysis unavailable — connected with caution' }
  }
}

export const runtime = 'nodejs'
