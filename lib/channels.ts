/**
 * Channel delivery layer — SMS, Telegram, or WhatsApp.
 * Each user has a preferred channel set at onboard time.
 * All outbound messages route through here.
 */

import { UserProfile } from './profile'

// ─── SMS via Twilio ───────────────────────────────────────────────────────────

const twilioSid = process.env.TWILIO_ACCOUNT_SID || ''
const twilioToken = process.env.TWILIO_AUTH_TOKEN || ''
const twilioFrom = process.env.TWILIO_PHONE_NUMBER || ''

const isTwilioConfigured =
  !!twilioSid && !twilioSid.includes('placeholder') &&
  !!twilioToken && !twilioToken.includes('placeholder') &&
  !!twilioFrom && !twilioFrom.includes('placeholder')

async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isTwilioConfigured) {
    console.log(`[SMS mock] To: ${to} | ${body}`)
    return true
  }
  try {
    const credentials = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
    const params = new URLSearchParams({ To: to, From: twilioFrom, Body: body })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() }
    )
    return res.ok
  } catch {
    return false
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

const telegramToken = process.env.TELEGRAM_BOT_TOKEN || ''
const isTelegramConfigured = !!telegramToken && !telegramToken.includes('placeholder')

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  if (!isTelegramConfigured) {
    console.log(`[Telegram mock] ChatId: ${chatId} | ${text}`)
    return true
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── WhatsApp via Twilio ──────────────────────────────────────────────────────

const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || ''
const isWhatsAppConfigured = isTwilioConfigured && !!whatsappFrom && !whatsappFrom.includes('placeholder')

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!isWhatsAppConfigured) {
    console.log(`[WhatsApp mock] To: ${to} | ${body}`)
    return true
  }
  try {
    const credentials = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')
    const params = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${whatsappFrom}`,
      Body: body,
    })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() }
    )
    return res.ok
  } catch {
    return false
  }
}

// ─── Main send function ───────────────────────────────────────────────────────

export async function sendToUser(profile: UserProfile, message: string): Promise<boolean> {
  switch (profile.channel) {
    case 'telegram':
      if (!profile.telegramChatId) {
        console.error('[channels] Telegram channel set but no telegramChatId for', profile.phone)
        return false
      }
      return sendTelegram(profile.telegramChatId, message)

    case 'whatsapp':
      return sendWhatsApp(profile.phone, message)

    case 'sms':
    default:
      return sendSms(profile.phone, message)
  }
}

// ─── Channel health check ─────────────────────────────────────────────────────

export function getChannelStatus(): Record<string, boolean> {
  return {
    sms: isTwilioConfigured,
    telegram: isTelegramConfigured,
    whatsapp: isWhatsAppConfigured,
  }
}
