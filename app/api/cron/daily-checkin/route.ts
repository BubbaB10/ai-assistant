/**
 * POST /api/cron/daily-checkin — morning check-in for guardian-mode users
 * Runs daily at 9am CT via Vercel Cron
 */

import { NextRequest, NextResponse } from 'next/server'
import { listAllProfiles, loadProfile } from '@/lib/profile'
import { sendDailyCheckIn, escalateMissedCheckIn } from '@/lib/guardian'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const phones = await listAllProfiles()
  const results = { sent: 0, escalated: 0, skipped: 0 }

  for (const phone of phones) {
    const profile = await loadProfile(phone)
    if (!profile?.active) { results.skipped++; continue }

    const guardian = profile.guardian
    if (!guardian?.enabled || !guardian?.checkInEnabled) { results.skipped++; continue }

    // Check if they already responded today
    const lastResponse = guardian.lastCheckInResponse
    const respondedToday = lastResponse
      ? new Date(lastResponse).toDateString() === new Date().toDateString()
      : false

    if (respondedToday) {
      results.skipped++
      continue
    }

    // Check if they missed yesterday's check-in
    const lastResponseDays = lastResponse
      ? (Date.now() - new Date(lastResponse).getTime()) / 86400000
      : 999

    if (lastResponseDays > 1.5) {
      // Missed yesterday — escalate
      await escalateMissedCheckIn(profile)
      results.escalated++
    }

    await sendDailyCheckIn(profile)
    results.sent++
  }

  console.log('[daily-checkin] Results:', results)
  return NextResponse.json({ ok: true, results, timestamp: new Date().toISOString() })
}

export const runtime = 'nodejs'
