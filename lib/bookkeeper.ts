/**
 * Bookkeeper data loader
 * Reads financial data from: data/bookkeeper/+1XXXXXXXXXX.json
 * Populated by the Bookkeeper product (separate system)
 */

import fs from 'fs'
import path from 'path'

export interface CategorySpend {
  food: number
  restaurants: number
  entertainment: number
  transportation: number
  shopping: number
  utilities: number
  rent: number
  subscriptions: number
  other: number
  [key: string]: number
}

export interface Transaction {
  date: string
  description: string
  amount: number
  category: string
}

export interface BookkeeperData {
  lastUpdated: string
  currentMonth: {
    income: number
    expenses: number
    net: number
    byCategory: CategorySpend
  }
  recentTransactions: Transaction[]
  lastMonthSummary: {
    income: number
    expenses: number
    net: number
  }
}

const DATA_DIR = path.join(process.cwd(), 'data', 'bookkeeper')

function phoneToFilename(phone: string): string {
  const normalized = phone.replace(/[\s\-\(\)]/g, '')
  return `${normalized}.json`
}

export function loadBookkeeperData(phone: string): BookkeeperData | null {
  try {
    const filePath = path.join(DATA_DIR, phoneToFilename(phone))
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as BookkeeperData
  } catch {
    return null
  }
}

export function formatFinancialSnapshot(data: BookkeeperData): string {
  const { currentMonth, lastMonthSummary } = data
  const lines: string[] = []

  lines.push(`This month: $${currentMonth.income.toFixed(0)} in, $${currentMonth.expenses.toFixed(0)} out, $${currentMonth.net >= 0 ? '+' : ''}${currentMonth.net.toFixed(0)} net`)

  const categories = Object.entries(currentMonth.byCategory)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)

  if (categories.length > 0) {
    lines.push(`Top spend: ${categories.map(([cat, amt]) => `${cat} $${amt.toFixed(0)}`).join(', ')}`)
  }

  if (lastMonthSummary.income > 0) {
    lines.push(`Last month: $${lastMonthSummary.income.toFixed(0)} in, $${lastMonthSummary.expenses.toFixed(0)} out`)
  }

  return lines.join('\n')
}

export function formatRecentTransactions(data: BookkeeperData, limit = 5): string {
  const recent = data.recentTransactions.slice(0, limit)
  if (recent.length === 0) return 'No recent transactions on file.'

  return recent
    .map(t => `${t.date} | ${t.description} | $${Math.abs(t.amount).toFixed(2)} (${t.category})`)
    .join('\n')
}

export function checkBudgetAlerts(
  data: BookkeeperData,
  budgetLimits: Record<string, number>,
  threshold = 0.8
): string[] {
  const alerts: string[] = []
  const { byCategory } = data.currentMonth

  for (const [category, limit] of Object.entries(budgetLimits)) {
    const spent = byCategory[category] ?? 0
    const pct = spent / limit
    if (pct >= threshold) {
      const remaining = limit - spent
      if (remaining <= 0) {
        alerts.push(`Over budget on ${category} by $${Math.abs(remaining).toFixed(0)}`)
      } else {
        alerts.push(`${Math.round(pct * 100)}% of ${category} budget used ($${remaining.toFixed(0)} left)`)
      }
    }
  }

  return alerts
}
