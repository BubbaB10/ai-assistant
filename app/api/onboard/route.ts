/**
 * POST /api/onboard — Create user profile and send welcome message
 * Supports SMS, Telegram, and WhatsApp channels.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProfile, profileExists } from '@/lib/profile'
import { verifySave } from '@/lib/integrity'
import { sendToUser } from '@/lib/channels'
import { isRedisConfigured } from '@/lib/redis'

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone: rawPhone, channel = 'sms', telegramChatId } = body

    if (!name || !email || !rawPhone) {
      return NextResponse.json({ error: 'name, email, and phone are required' }, { status: 400 })
    }

    if (!isRedisConfigured) {
      return NextResponse.json({
        error: 'Service not ready — Redis not configured. Contact support.'
      }, { status: 503 })
    }

    const phone = normalizePhone(rawPhone)
    if (!phone) {
      return NextResponse.json({ error: 'Invalid phone number. US numbers only.' }, { status: 400 })
    }

    if (channel === 'telegram' && !telegramChatId) {
      return NextResponse.json({ error: 'telegramChatId required for Telegram channel' }, { status: 400 })
    }

    const alreadyExists = await profileExists(phone)
    if (alreadyExists) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
    }

    // Create and save profile — integrity-verified
    const { profile, saved } = await createProfile(
      phone,
      name.trim(),
      email.trim().toLowerCase(),
      channel,
      telegramChatId
    )

    // Alert operator if save had issues
    await verifySave(saved, 'onboard', phone)

    if (!saved.ok) {
      return NextResponse.json({
        error: 'Failed to save profile. Please try again.'
      }, { status: 503 })
    }

    // Send welcome message via their chosen channel
    const welcomeMsg = `Hey ${profile.name}! Your AI assistant is ready. Text me anything — questions, reminders, tasks. What's one thing you want to get off your plate?`
    await sendToUser(profile, welcomeMsg)

    return NextResponse.json({
      success: true,
      message: `Welcome, ${profile.name}! Check your ${channel} for a message.`,
      phone: profile.phone,
      channel: profile.channel,
      memoryVersion: profile.memoryVersion,
    })
  } catch (err) {
    console.error('[onboard] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
