/**
 * Twilio SMS send wrapper
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || ''

const isConfigured =
  ACCOUNT_SID &&
  !ACCOUNT_SID.includes('placeholder') &&
  AUTH_TOKEN &&
  !AUTH_TOKEN.includes('placeholder') &&
  FROM_NUMBER &&
  !FROM_NUMBER.includes('0000000000')

export interface SendResult {
  success: boolean
  sid?: string
  error?: string
}

export async function sendSMS(to: string, body: string): Promise<SendResult> {
  if (!isConfigured) {
    console.log(`[SMS MOCK] To: ${to}\nBody: ${body}`)
    return { success: true, sid: 'MOCK_SID' }
  }

  // Enforce SMS length limit
  const trimmedBody = body.length > 320 ? body.slice(0, 317) + '...' : body

  try {
    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: FROM_NUMBER,
          Body: trimmedBody,
        }).toString(),
      }
    )

    if (!res.ok) {
      const error = await res.text()
      console.error('Twilio error:', error)
      return { success: false, error }
    }

    const data = await res.json() as { sid: string }
    return { success: true, sid: data.sid }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('SMS send error:', error)
    return { success: false, error }
  }
}

export async function sendWelcomeSMS(to: string, name: string): Promise<void> {
  await sendSMS(
    to,
    `Hey ${name}! I'm your Planner. Text me anything about your money or your week and I'll give you a straight answer. Try: "How much have I spent this month?"`
  )
}

export async function sendFollowUpSMS(to: string): Promise<void> {
  await sendSMS(
    to,
    `Quick setup question: what's one financial goal you're working toward right now? (e.g., "save for a trip", "pay off my credit card", "just stop being so disorganized")`
  )
}
