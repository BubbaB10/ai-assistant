/**
 * POST /api/cron/cognition-slot — delivers daily brain touchpoints
 *
 * Runs 3x/day via Vercel Cron:
 *   9am  CT — morning slot
 *   1pm  CT — midday slot
 *   6pm  CT — evening slot
 *
 * Finds all guardian-mode active profiles, checks slot readiness,
 * sends the appropriate game/prompt via their channel.
 */

import { NextRequest, NextResponse } from 'next/server'
import { listAllProfiles, loadProfile } from '@/lib/profile'
import { getCognitionPrompt, getCurrentSlot, CognitionSlot } from '@/lib/cognition'
import { sendToUser } from '@/lib/channels'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Allow slot override via query param for manual testing
  const url = new URL(req.url)
  const slotOverride = url.searchParams.get('slot') as CognitionSlot | null
  const slot = slotOverride ?? getCurrentSlot()

  const phones = await listAllProfiles()
  const results = { sent: 0, skipped: 0, errors: 0 }

  for (const phone of phones) {
    try {
      const profile = await loadProfile(phone)
      if (!profile?.active) { results.skipped++; continue }

      // Only guardian-mode users get cognition prompts
      const guardian = (profile as any).guardian
      if (!guardian?.enabled) { results.skipped++; continue }

      // Check if cognition is explicitly disabled
      const cognition = (profile as any).cognition
      if (cognition?.enabled === false) { results.skipped++; continue }

      const prompt = await getCognitionPrompt(profile, slot)
      if (!prompt) { results.skipped++; continue }

      await sendToUser(profile, prompt)
      results.sent++
    } catch (err) {
      console.error(`[cognition-slot] Error for ${phone}:`, err)
      results.errors++
    }
  }

  console.log(`[cognition-slot] slot=${slot}`, results)
  return NextResponse.json({ ok: true, slot, results, timestamp: new Date().toISOString() })
}

export const runtime = 'nodejs'
