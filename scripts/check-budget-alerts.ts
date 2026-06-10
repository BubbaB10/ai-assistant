/**
 * Lightweight spending nudge script — runs daily via cron.
 * Light financial scope only — not replacing Bookkeeper.
 */
import { sendWeeklySummaries } from '../lib/proactive'

// For now this just triggers weekly summaries
// Deep budget analysis belongs in AI Bookkeeper
async function main() {
  console.log('[check-budget-alerts] Running lightweight spending nudge check...')
  await sendWeeklySummaries()
  console.log('[check-budget-alerts] Done.')
}

main().catch(console.error)
