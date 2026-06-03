# AI Assistant — Planner

SMS-first personal AI assistant. Users text a phone number and get real answers about their finances and life.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with real credentials
npm run dev
```

## Architecture

**3-tier context system:**
- Tier 1: User profile — always in context (name, goals, lifestyle)
- Tier 2: Query-triggered — financial data fetched based on what they ask
- Tier 3: Proactive — weekly summaries, budget alerts pushed via SMS

**Flow:**
```
Twilio SMS → POST /api/sms → classify → context → GPT → reply SMS
```

## Environment Variables

See `.env.example` for all required variables.

## File Structure

```
app/
  page.tsx              Landing page (Planner brand)
  onboard/page.tsx      3-field signup
  api/sms/route.ts      Twilio inbound webhook
  api/send/route.ts     Outbound SMS utility
  api/health/route.ts   Health check
lib/
  brain.ts              Core GPT handler
  classify.ts           Query type classifier
  context.ts            Context assembler
  profile.ts            User profile CRUD
  bookkeeper.ts         Financial data loader
  sms.ts                Twilio send wrapper
  redis.ts              Conversation history
  proactive.ts          Weekly summaries + alerts
data/
  users/                User profiles (keyed by phone)
  bookkeeper/           Financial data per user
scripts/
  send-weekly-summary.ts  Cron: Sunday 9pm
  check-budget-alerts.ts  Cron: Daily 10am
```

## Twilio Setup

1. Create Twilio account
2. Buy a phone number
3. Set webhook URL: `https://your-domain.vercel.app/api/sms`
4. Method: HTTP POST

## Deployment

```bash
vercel --prod
```

Set all env vars in Vercel dashboard before deploying.
