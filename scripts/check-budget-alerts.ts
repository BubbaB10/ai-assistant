/**
 * Budget alerts script — run daily (e.g., 10am CT)
 * Cron: 0 10 * * *
 *
 * Usage: npx tsx scripts/check-budget-alerts.ts
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { checkAndSendBudgetAlerts } from '../lib/proactive'

async function main() {
  console.log('=== Budget Alert Check ===')
  console.log(`Started at: ${new Date().toISOString()}`)

  const threshold = parseFloat(process.env.BUDGET_ALERT_THRESHOLD || '0.8')
  console.log(`Alert threshold: ${threshold * 100}%`)

  try {
    await checkAndSendBudgetAlerts(threshold)
    console.log('Done.')
  } catch (err) {
    console.error('Budget alert job failed:', err)
    process.exit(1)
  }
}

main()
