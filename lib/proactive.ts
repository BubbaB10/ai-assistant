/**
 * Proactive messaging — weekly summaries and lightweight nudges.
 * Profiles loaded from Redis (not disk).
 * Financial scope is light — no deep bookkeeper integration here.
 */

import { loadProfile, listAllProfiles } from './profile'
import { generateWeeklySummary } from './brain'
import { sendToUser } from './channels'

// Load all active user profiles from Redis
export async function getAllActiveProfiles() {
  const phones = await listAllProfiles()
  const profiles = []
  for (const phone of phones) {
    const profile = await loadProfile(phone)
    if (profile && profile.active) profiles.push(profile)
  }
  return profiles
}

// Send weekly summary to all active users
export async function sendWeeklySummaries(): Promise<void> {
  const profiles = await getAllActiveProfiles()
  console.log(`[proactive] Sending weekly summaries to ${profiles.length} users...`)
  for (const profile of profiles) {
    try {
      const summary = await generateWeeklySummary(profile)
      await sendToUser(profile, `Weekly check-in, ${profile.name}:\n${summary}`)
      console.log(`[proactive] Sent weekly summary to ${profile.phone}`)
    } catch (err) {
      console.error(`[proactive] Failed weekly summary for ${profile.phone}:`, err)
    }
  }
}
