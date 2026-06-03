import { NextRequest, NextResponse } from 'next/server'
import { sendSMS } from '@/lib/sms'

// POST /api/send — Outbound SMS utility (internal use only)
// Requires an internal API key for security
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { to?: string; message?: string; apiKey?: string }
    const { to, message, apiKey } = body

    // Simple API key guard (not exposed to Twilio)
    const expectedKey = process.env.INTERNAL_API_KEY || 'dev-key'
    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!to || !message) {
      return NextResponse.json({ error: 'Missing to or message' }, { status: 400 })
    }

    const result = await sendSMS(to, message)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, sid: result.sid })
  } catch (err) {
    console.error('Send route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
