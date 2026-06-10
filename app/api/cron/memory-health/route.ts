/**
 * POST /api/cron/memory-health — daily profile integrity scan
 * Called by Vercel Cron at 7am CT daily.
 * Protected by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runProfileHealthScan } from '@/lib/integrity'

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get('authorization') || ''
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`
  if (process.env.CRON_SECRET && secret !== expected) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  console.log('[memory-health] Starting daily profile scan...')
  const results = await runProfileHealthScan()

  const summary = {
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    problems: results.filter(r => r.status !== 'ok'),
  }

  console.log('[memory-health] Scan complete:', summary)
  return NextResponse.json({ ok: true, summary, timestamp: new Date().toISOString() })
}

export const runtime = 'nodejs'
