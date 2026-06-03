# AI Assistant — Launch Summary

**Deployed:** 2026-06-03  
**Product:** Planner (SMS-first AI personal assistant)  
**Entity:** Micro Titan LLC

---

## Live URLs

| Resource | URL |
|----------|-----|
| **Production** | https://ai-assistant-murex-delta.vercel.app |
| **Health Check** | https://ai-assistant-murex-delta.vercel.app/api/health |
| **Landing Page** | https://ai-assistant-murex-delta.vercel.app |
| **Onboard** | https://ai-assistant-murex-delta.vercel.app/onboard |
| **GitHub Repo** | https://github.com/BubbaB10/ai-assistant |

---

## What Was Built

### Architecture
SMS-first AI assistant using a 3-tier context system:
- **Tier 1:** User profile always in context (name, goals, lifestyle, ~200 tokens)
- **Tier 2:** Query-triggered financial data (fetched based on classification)
- **Tier 3:** Proactive push (weekly summaries, budget alerts)

### Tech Stack
- Next.js 15 (App Router)
- TypeScript (strict mode, compiles clean)
- Tailwind CSS
- OpenAI GPT-4o / GPT-4o-mini
- Twilio SMS (webhook + outbound)
- Upstash Redis (conversation history, 24hr TTL, fallback to in-memory)
- Vercel (production deployment)

---

## Files Built

### App
| File | Purpose |
|------|---------|
| `app/page.tsx` | Landing page with SMS preview, features, pricing |
| `app/onboard/page.tsx` | 3-field signup (name, email, phone) |
| `app/dashboard/page.tsx` | Coming soon placeholder |
| `app/layout.tsx` | Root layout with Inter font, metadata |
| `app/globals.css` | Global styles + Tailwind |

### API Routes
| Route | Purpose |
|-------|---------|
| `POST /api/sms` | Twilio inbound webhook (Twilio sig validation + brain) |
| `POST /api/onboard` | User signup + welcome SMS |
| `POST /api/send` | Internal outbound SMS utility |
| `GET /api/health` | Health check (returns 200 JSON) |

### Lib
| File | Purpose |
|------|---------|
| `lib/brain.ts` | Core GPT conversation handler |
| `lib/classify.ts` | Query classifier (GPT-4o-mini, with local keyword fallback) |
| `lib/context.ts` | Assembles tier 1/2 context per query type |
| `lib/profile.ts` | User profile CRUD (JSON flat files) |
| `lib/bookkeeper.ts` | Financial data loader + formatters |
| `lib/sms.ts` | Twilio send wrapper (mock mode if unconfigured) |
| `lib/redis.ts` | Conversation history store (Upstash REST API, in-memory fallback) |
| `lib/proactive.ts` | Weekly summaries + budget alert dispatch |

### Scripts (Cron-ready)
| Script | Schedule |
|--------|---------|
| `scripts/send-weekly-summary.ts` | Sunday 9pm CT |
| `scripts/check-budget-alerts.ts` | Daily 10am CT |

### Data Templates
- `data/users/example.json` — User profile schema
- `data/bookkeeper/example.json` — Financial data schema

---

## Vercel Configuration

| Variable | Status |
|---------|--------|
| `OPENAI_API_KEY` | ✅ Live key configured |
| `TWILIO_ACCOUNT_SID` | ⚠️ Placeholder — needs real Twilio account |
| `TWILIO_AUTH_TOKEN` | ⚠️ Placeholder — needs real Twilio account |
| `TWILIO_PHONE_NUMBER` | ⚠️ Placeholder — needs real Twilio number |
| `UPSTASH_REDIS_REST_URL` | ⚠️ Placeholder — needs Upstash account |
| `UPSTASH_REDIS_REST_TOKEN` | ⚠️ Placeholder — needs Upstash account |
| `NEXT_PUBLIC_BASE_URL` | ✅ Set to production URL |

**Vercel Project ID:** `prj_V7OICJCwhWYHcptAbyVFw3IYJ8Ns`

---

## Next Steps to Go Live

1. **Create Twilio account** → buy a US phone number → set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` in Vercel
2. **Set Twilio webhook** → `POST https://ai-assistant-murex-delta.vercel.app/api/sms`
3. **Create Upstash account** → create Redis database → set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` in Vercel
4. **Create first real user profile** in `data/users/+1PHONENUMBER.json` with actual data
5. **Set up Bookkeeper data** feed into `data/bookkeeper/+1PHONENUMBER.json`
6. **Test full SMS flow** → text the Twilio number → verify brain responds
7. **Set up cron jobs** on Vercel (or external) for weekly summary + budget alerts

---

## Health Check Response (Confirmed 2026-06-03)

```json
{
  "status": "ok",
  "service": "ai-assistant",
  "version": "0.1.0",
  "timestamp": "2026-06-03T17:43:35.659Z",
  "environment": "production",
  "checks": {
    "openai": true,
    "twilio": false,
    "redis": false
  }
}
```

---

## TypeScript

✅ `npx tsc --noEmit` — clean, zero errors, strict mode

---

## Notes

- Redis fallback: if Upstash is unconfigured, app falls back to in-memory store (no conversation history persistence, but no crashes)
- SMS mock mode: if Twilio is unconfigured, SMS calls log to console instead of crashing
- Twilio signature validation: skipped if `TWILIO_AUTH_TOKEN` is placeholder (safe for dev, enforced in prod)
- Brain uses GPT-4o for financial/advice queries, GPT-4o-mini for greetings/classification (cost optimization)
- All user data files are gitignored (only example templates committed)
