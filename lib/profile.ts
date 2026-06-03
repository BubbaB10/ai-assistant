/**
 * User profile loader/writer
 * Profiles stored at: data/users/+1XXXXXXXXXX.json
 */

import fs from 'fs'
import path from 'path'

export interface BudgetLimits {
  food: number
  restaurants: number
  entertainment: number
  transportation: number
  shopping: number
  [key: string]: number
}

export interface UserProfile {
  phone: string
  name: string
  email: string
  brand: 'planner' | 'admin'
  occupation: string
  lifestyle: string
  goals: string[]
  monthlyIncome: number
  budgetLimits: BudgetLimits
  timezone: string
  onboardedAt: string
  active: boolean
  tier: 'personal' | 'bundle'
}

const DATA_DIR = path.join(process.cwd(), 'data', 'users')

function phoneToFilename(phone: string): string {
  // Normalize phone: strip spaces/dashes, ensure starts with +
  const normalized = phone.replace(/[\s\-\(\)]/g, '')
  return `${normalized}.json`
}

export function loadProfile(phone: string): UserProfile | null {
  try {
    const filePath = path.join(DATA_DIR, phoneToFilename(phone))
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

export function saveProfile(profile: UserProfile): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  const filePath = path.join(DATA_DIR, phoneToFilename(profile.phone))
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8')
}

export function createProfile(
  phone: string,
  name: string,
  email: string
): UserProfile {
  const profile: UserProfile = {
    phone,
    name,
    email,
    brand: 'planner',
    occupation: 'professional',
    lifestyle: `${name} is building a better financial future.`,
    goals: [],
    monthlyIncome: 0,
    budgetLimits: {
      food: 500,
      restaurants: 300,
      entertainment: 200,
      transportation: 400,
      shopping: 300,
    },
    timezone: 'America/Chicago',
    onboardedAt: new Date().toISOString(),
    active: true,
    tier: 'personal',
  }
  saveProfile(profile)
  return profile
}

export function updateProfileGoals(phone: string, goals: string[]): void {
  const profile = loadProfile(phone)
  if (!profile) return
  profile.goals = goals
  saveProfile(profile)
}

export function profileExists(phone: string): boolean {
  const filePath = path.join(DATA_DIR, phoneToFilename(phone))
  return fs.existsSync(filePath)
}
