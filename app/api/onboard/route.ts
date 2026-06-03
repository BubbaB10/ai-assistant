/**
 * POST /api/onboard — Create user profile and send welcome SMS
 */

import { NextRequest, NextResponse } from 'next/server'
import { createProfile, profileExists } from '@/lib/profile'
import { sendWelcomeSMS, sendFollowUpSMS } from '@/lib/sms'

interface OnboardBody {
  name?: string
  email?: string
  phone?: string
}

// Normalize US phone number to E.164 format
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as OnboardBody
    const { name, email, phone: rawPhone } = body

    if (!name || !email || !rawPhone) {
      return NextResponse.json({ error: 'name, email, and phone are required' }, { status: 400 })
    }

    const phone = normalizePhone(rawPhone)
    if (!phone) {
      return NextResponse.json({ error: 'Invalid phone number. US numbers only.' }, { status: 400 })
    }

    // Check if already onboarded
    if (profileExists(phone)) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 })
    }

    // Create profile
    const profile = createProfile(phone, name.trim(), email.trim().toLowerCase())

    // Send welcome SMS immediately
    await sendWelcomeSMS(phone, name.trim())

    // Schedule follow-up SMS (2 minute delay)
    setTimeout(async () => {
      await sendFollowUpSMS(phone)
    }, 2 * 60 * 1000)

    return NextResponse.json({
      success: true,
      message: `Welcome, ${profile.name}! Check your phone for a text.`,
      phone: profile.phone,
    })
  } catch (err) {
    console.error('Onboard error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
