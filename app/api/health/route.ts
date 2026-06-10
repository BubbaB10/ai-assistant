/**
 * GET /api/health — system health check
 * Checks Redis, channel configs, and profile count
 */

import { NextResponse } from 'next/server'
import { checkRedisHealth } from '@/lib/integrity'
import { getChannelStatus } from '@/lib/channels'
import { listAllProfiles } from '@/lib/profile'
import { isRedisConfigured } from '@/lib/redis'

export async function GET() {
  const [redisHealth, channels, profiles] = await Promise.all([
    checkRedisHealth(),
    Promise.resolve(getChannelStatus()),
    listAllProfiles().catch(() => []),
  ])

  const status = redisHealth.ok ? 'ok' : 'degraded'

  return NextResponse.json({
    status,
    service: 'ai-assistant',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    checks: {
      redis: redisHealth.ok,
      redisConfigured: isRedisConfigured,
      redisError: redisHealth.error || null,
      channels,
      activeProfiles: profiles.length,
    },
  }, { status: redisHealth.ok ? 200 : 503 })
}

export const runtime = 'nodejs'
