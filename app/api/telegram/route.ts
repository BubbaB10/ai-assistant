/**
 * POST /api/telegram — Telegram bot webhook
 * Receives messages from Telegram users, routes through brain, replies.
 *
 * Setup: set webhook via:
 * https://api.telegram.org/bot<TOKEN>/setWebhook?url=<BASE_URL>/api/telegram
 */

import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/brain'
import { safeLoadProfile } from '@/lib/integrity'
import { updateProfile } from '@/lib/profile'
import { sendToUser } from '@/lib/channels'
import { guardianGate } from '@/lib/guardian'
import { handleCognitionResponse, getCurrentSlot } from '@/lib/cognition'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const TELEGRAM_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret if configured
    if (TELEGRAM_SECRET) {
      const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || ''
      if (secret !== TELEGRAM_SECRET) {
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    const update = await req.json()
    const message = update?.message || update?.edited_message
    if (!message) return new NextResponse('OK', { status: 200 })

    const chatId = String(message.chat?.id || '')
    const text = message.text?.trim() || ''
    if (!chatId || !text) return new NextResponse('OK', { status: 200 })

    // Find profile by telegramChatId
    // We store telegramChatId in the profile at onboard time
    // Look up by scanning — in prod with many users we'd index this separately
    const { redisKeys, redisGet } = await import('@/lib/redis')
    const profileKeys = await redisKeys('profile:*')
    let profile = null

    for (const key of profileKeys) {
      const p = await redisGet<{ telegramChatId?: string; phone: string }>(key)
      if (p?.telegramChatId === chatId) {
        profile = await safeLoadProfile(p.phone)
        break
      }
    }

    if (!profile) {
      // Unknown Telegram user — send onboard link
      const onboardUrl = `${BASE_URL}/onboard?channel=telegram&chat_id=${chatId}`
      await sendTelegramMessage(chatId, `Hi! I'm your AI assistant. To get started: ${onboardUrl}`)
      return new NextResponse('OK', { status: 200 })
    }

    if (!profile.active) {
      await sendTelegramMessage(chatId, 'Your account is currently inactive. Contact support to reactivate.')
      return new NextResponse('OK', { status: 200 })
    }

    await updateProfile(profile.phone, { lastSeen: new Date().toISOString() })

    // Guardian gate
    const guardianResult = await guardianGate(profile, text, chatId)
    if (guardianResult.action === 'block' && guardianResult.reply) {
      await sendTelegramMessage(chatId, guardianResult.reply)
      return new NextResponse('OK', { status: 200 })
    }

    // Cognition response detection
    const slot = getCurrentSlot()
    await handleCognitionResponse(profile, text, slot)

    const replyText = guardianResult.action === 'warn' && guardianResult.reply
      ? guardianResult.reply
      : (await processMessage(profile, text)).reply

    await sendTelegramMessage(chatId, replyText)

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[telegram] webhook error:', err)
    return new NextResponse('OK', { status: 200 }) // Always 200 to Telegram
  }
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.log(`[Telegram mock] ChatId: ${chatId} | ${text}`)
    return
  }
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (err) {
    console.error('[telegram] send error:', err)
  }
}

export const runtime = 'nodejs'
