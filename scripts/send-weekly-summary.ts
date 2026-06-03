/**
 * Weekly summary script — run Sunday night (e.g., 9pm CT)
 * Cron: 0 21 * * 0
 *
 * Usage: npx tsx scripts/send-weekly-summary.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { sendWeeklySummaries } from '../lib/proactive'

async function main() {
  console.log('=== Weekly Summary Job ===')
  console.log(`Started at: ${new Date().toISOString()}`)

  try {
    await sendWeeklySummaries()
    console.log('Done.')
  } catch (err) {
    console.error('Weekly summary job failed:', err)
    process.exit(1)
  }
}

main()
