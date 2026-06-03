/**
 * Context builder — assembles the right tier 1/2/3 context for each query
 */

import { UserProfile } from './profile'
import { loadBookkeeperData, formatFinancialSnapshot, formatRecentTransactions, checkBudgetAlerts } from './bookkeeper'
import { QueryType } from './classify'

export interface AssembledContext {
  systemPrompt: string
  tier2Data: string | null
  useExpensiveModel: boolean
}

export function buildSystemPrompt(
  profile: UserProfile,
  tier2Data: string | null,
  budgetAlerts: string[]
): string {
  const { name, occupation, lifestyle, goals } = profile

  const goalsList = goals.length > 0
    ? goals.map(g => `• ${g}`).join('\n')
    : '• Not yet set'

  const alertSection = budgetAlerts.length > 0
    ? `\nBudget alerts:\n${budgetAlerts.map(a => `⚠️ ${a}`).join('\n')}`
    : ''

  const financialSection = tier2Data
    ? `\nCurrent financial snapshot:\n${tier2Data}${alertSection}`
    : alertSection
      ? `\nCurrent financial snapshot:\n(No bookkeeper data on file yet)${alertSection}`
      : '\nCurrent financial snapshot:\n(No bookkeeper data on file yet — user needs to connect their bank)'

  return `You are ${name}'s personal AI assistant. You know them well.

About ${name}: ${lifestyle} They work as ${occupation}.

Goals ${name} is working toward:
${goalsList}
${financialSection}

You communicate by SMS. Rules:
- Keep replies under 160 characters when possible (one SMS). Never exceed 320 characters.
- Be direct, warm, and specific. Use their actual numbers when available.
- Never give tax or legal advice. Say "talk to your accountant on that one."
- If data is missing or stale, say so honestly.
- Sound like a smart friend, not a corporate bot.
- Never start a reply with "I" — lead with the answer.
- No bullet points or markdown — SMS only gets plain text.`
}

export async function assembleContext(
  profile: UserProfile,
  queryType: QueryType
): Promise<AssembledContext> {
  let tier2Data: string | null = null
  let budgetAlerts: string[] = []
  let useExpensiveModel = false

  // Load bookkeeper data for financial/budget queries
  if (['financial', 'budget', 'goal'].includes(queryType)) {
    const bkData = loadBookkeeperData(profile.phone)
    if (bkData) {
      if (queryType === 'financial') {
        tier2Data = formatFinancialSnapshot(bkData) + '\n\nRecent transactions:\n' + formatRecentTransactions(bkData)
      } else if (queryType === 'budget') {
        tier2Data = formatFinancialSnapshot(bkData)
        budgetAlerts = checkBudgetAlerts(bkData, profile.budgetLimits)
      } else if (queryType === 'goal') {
        tier2Data = formatFinancialSnapshot(bkData)
      }
    }
    useExpensiveModel = true // financial queries need GPT-4o
  }

  // Always check budget alerts for financial queries
  if (queryType === 'financial' || queryType === 'budget') {
    const bkData = loadBookkeeperData(profile.phone)
    if (bkData && budgetAlerts.length === 0) {
      budgetAlerts = checkBudgetAlerts(bkData, profile.budgetLimits)
    }
  }

  // Advice queries use expensive model for quality
  if (queryType === 'advice') {
    useExpensiveModel = true
  }

  // Greetings/unknown use cheap model
  if (queryType === 'greeting' || queryType === 'unknown') {
    useExpensiveModel = false
  }

  const systemPrompt = buildSystemPrompt(profile, tier2Data, budgetAlerts)

  return { systemPrompt, tier2Data, useExpensiveModel }
}
