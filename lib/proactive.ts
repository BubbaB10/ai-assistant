/**
 * Proactive messaging — pre-computed summaries and budget alerts
 * These are triggered by cron jobs (scripts/)
 */

import { UserProfile, loadProfile } from './profile'
import { loadBookkeeperData, checkBudgetAlerts } from './bookkeeper'
import { generateWeeklySummary } from './brain'
import { sendSMS } from './sms'
import fs from 'fs'
import path from 'path'

const USERS_DIR = path.join(process.cwd(), 'data', 'users')

// Load all active user profiles
export function getAllActiveProfiles(): UserProfile[] {
  if (!fs.existsSync(USERS_DIR)) return []

  const files = fs.readdirSync(USERS_DIR).filter(f => f.endsWith('.json') && f !== 'example.json')
  const profiles: UserProfile[] = []

  for (const file of files) {
    const phone = file.replace('.json', '')
    const profile = loadProfile(phone)
    if (profile && profile.active) {
      profiles.push(profile)
    }
  }

  return profiles
}

// Send weekly summary to all active users
export async function sendWeeklySummaries(): Promise<void> {
  const profiles = getAllActiveProfiles()
  console.log(`Sending weekly summaries to ${profiles.length} users...`)

  for (const profile of profiles) {
    try {
      const summary = await generateWeeklySummary(profile)
      const prefix = `Weekly wrap, ${profile.name}:\n`
      await sendSMS(profile.phone, prefix + summary)
      console.log(`Sent weekly summary to ${profile.phone}`)
    } catch (err) {
      console.error(`Failed to send weekly summary to ${profile.phone}:`, err)
    }
  }
}

// Check budget alerts for all users and send if needed
export async function checkAndSendBudgetAlerts(threshold = 0.8): Promise<void> {
  const profiles = getAllActiveProfiles()
  console.log(`Checking budget alerts for ${profiles.length} users...`)

  for (const profile of profiles) {
    try {
      const bkData = loadBookkeeperData(profile.phone)
      if (!bkData) continue

      const alerts = checkBudgetAlerts(bkData, profile.budgetLimits, threshold)
      if (alerts.length === 0) continue

      const alertMsg = `Heads up, ${profile.name}: ${alerts[0]}${alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ''}`
      await sendSMS(profile.phone, alertMsg)
      console.log(`Sent budget alert to ${profile.phone}: ${alerts.length} alerts`)
    } catch (err) {
      console.error(`Failed to send budget alert to ${profile.phone}:`, err)
    }
  }
}

// Weekend spending heads-up (Friday 5pm)
export async function sendWeekendHeadsUp(): Promise<void> {
  const profiles = getAllActiveProfiles()

  for (const profile of profiles) {
    try {
      const bkData = loadBookkeeperData(profile.phone)
      if (!bkData) continue

      // Calculate remaining discretionary budget
      const discretionaryCategories = ['restaurants', 'entertainment', 'shopping']
      let totalLimit = 0
      let totalSpent = 0

      for (const cat of discretionaryCategories) {
        totalLimit += profile.budgetLimits[cat] ?? 0
        totalSpent += bkData.currentMonth.byCategory[cat] ?? 0
      }

      const remaining = totalLimit - totalSpent
      const msg = remaining > 0
        ? `Weekend incoming, ${profile.name}! You've got $${remaining.toFixed(0)} left in discretionary budget. Spend it well.`
        : `Heads up, ${profile.name}: discretionary budget is tapped out this month. This weekend = free activities only!`

      await sendSMS(profile.phone, msg)
    } catch (err) {
      console.error(`Failed to send weekend heads-up to ${profile.phone}:`, err)
    }
  }
}
