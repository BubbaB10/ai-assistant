/**
 * User profile — stored in Redis, not on disk.
 * Disk storage = wiped on every Vercel deploy. Redis = persists forever.
 *
 * MEMORY INTEGRITY RULE:
 * Every write is verified (read-back check). If verification fails, the caller
 * receives { ok: false } and must alert the operator — never silently proceed.
 */

import { redisGetProfile, redisSetProfile, redisProfileExists, redisListProfiles, isRedisConfigured } from './redis'

export interface BudgetLimits {
  food: number
  restaurants: number
  entertainment: number
  shopping: number
  [key: string]: number
}

export interface UserProfile {
  phone: string
  name: string
  email: string
  channel: 'sms' | 'telegram' | 'whatsapp'
  telegramChatId?: string        // set when channel=telegram
  brand: 'assistant'
  occupation: string
  lifestyle: string              // free-form context paragraph about this person
  goals: string[]
  timezone: string
  onboardedAt: string
  lastSeen: string
  active: boolean
  tier: 'personal' | 'bundle'
  // Light financial context (not Bookkeeper — just awareness)
  monthlyIncome?: number
  spendingAwareness?: {
    trackCategories: string[]    // e.g. ['dining', 'entertainment']
    alertThreshold?: number      // alert when a category looks high
  }
  // Operator alert channel — where to page Bubba if something breaks
  operatorAlertPhone?: string
  // Memory integrity metadata
  memoryVersion: number          // increments on every profile save
  lastVerified?: string          // ISO timestamp of last successful read-back
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function loadProfile(phone: string): Promise<UserProfile | null> {
  if (!isRedisConfigured) {
    console.error('[profile] Redis not configured — cannot load profile for', phone)
    return null
  }
  return redisGetProfile<UserProfile>(phone)
}

export async function profileExists(phone: string): Promise<boolean> {
  if (!isRedisConfigured) return false
  return redisProfileExists(phone)
}

export async function listAllProfiles(): Promise<string[]> {
  return redisListProfiles()
}

// ─── Write (with integrity verification) ────────────────────────────────────

export interface SaveResult {
  ok: boolean
  verified: boolean
  error?: string
}

export async function saveProfile(profile: UserProfile): Promise<SaveResult> {
  if (!isRedisConfigured) {
    return { ok: false, verified: false, error: 'Redis not configured' }
  }

  const updated = {
    ...profile,
    memoryVersion: (profile.memoryVersion ?? 0) + 1,
    lastVerified: new Date().toISOString(),
  }

  const result = await redisSetProfile(profile.phone, updated)

  if (!result.ok) {
    return { ok: false, verified: false, error: 'Redis write failed' }
  }

  if (!result.verified) {
    return { ok: true, verified: false, error: 'Write succeeded but read-back mismatch — data may be corrupt' }
  }

  return { ok: true, verified: true }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createProfile(
  phone: string,
  name: string,
  email: string,
  channel: UserProfile['channel'] = 'sms',
  telegramChatId?: string
): Promise<{ profile: UserProfile; saved: SaveResult }> {
  const profile: UserProfile = {
    phone,
    name,
    email,
    channel,
    telegramChatId,
    brand: 'assistant',
    occupation: 'professional',
    lifestyle: `${name} is getting started with their AI assistant.`,
    goals: [],
    timezone: 'America/Chicago',
    onboardedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    active: true,
    tier: 'personal',
    memoryVersion: 0,
  }

  const saved = await saveProfile(profile)
  return { profile, saved }
}

// ─── Update helpers ───────────────────────────────────────────────────────────

export async function updateProfile(
  phone: string,
  updates: Partial<UserProfile>
): Promise<SaveResult> {
  const existing = await loadProfile(phone)
  if (!existing) return { ok: false, verified: false, error: 'Profile not found' }
  const merged = { ...existing, ...updates }
  return saveProfile(merged)
}

export async function touchLastSeen(phone: string): Promise<void> {
  const existing = await loadProfile(phone)
  if (!existing) return
  // Don't increment memoryVersion for lastSeen touches — it's noise
  await redisSetProfile(phone, { ...existing, lastSeen: new Date().toISOString() })
}
