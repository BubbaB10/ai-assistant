import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ai-assistant',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      openai: !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('placeholder'),
      twilio: !!process.env.TWILIO_ACCOUNT_SID && !process.env.TWILIO_ACCOUNT_SID.includes('placeholder'),
      redis: !!process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_URL.includes('placeholder'),
    },
  })
}
