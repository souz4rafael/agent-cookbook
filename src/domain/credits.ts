import { getEvaluationRows } from './evaluation.ts'
import type { ChatMessage, CompiledRecipe, Session, TestResponse } from './types.ts'

export interface CreditRange { readonly min: number; readonly max: number | null }
export type CreditProfile = 'light' | 'medium' | 'heavy'
export type CreditCounts = Readonly<Record<CreditProfile, number>>
export interface CreditEstimate {
  readonly count: number
  readonly range: CreditRange
  readonly groups: readonly { profile: CreditProfile; count: number; range: CreditRange }[]
  readonly reason?: string
}

export const creditModel = {
  version: '2026-11-17.1',
  reviewedAt: '17 November 2026',
  billingUrl: 'https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/billing-credit-overview',
  estimatorUrl: 'https://nptnlopppecostweb.azurewebsites.net/#/estimator',
  githubEstimatorUrl: 'https://microsoft.github.io/copilot-studio-estimator/',
  basis: 'The Microsoft-linked estimator publishes Light (100-300), Medium (300-500) and Heavy (500+) credits per interaction. These are whole-task planning bands, covering model, tool and harness work together, not charges to add for each source, token or tool call.',
} as const

// Published bands; the response-to-tier mapping below is an explicit Cookbook assumption.
export const creditProfiles = {
  light: {
    label: 'Light',
    range: { min: 100, max: 300 },
    description: 'A bounded question, lookup or short response. Used when no Medium or Heavy rule matches, including missing-source and out-of-scope responses.',
  },
  medium: {
    label: 'Medium',
    range: { min: 300, max: 500 },
    description: 'Used for at least 3 cited sources, at least 3 recommendations, or a draft supported by at least 3 rule checks. This is our proxy for broader synthesis or structured reasoning with multiple outputs.',
  },
  heavy: {
    label: 'Heavy',
    range: { min: 500, max: null },
    description: 'Used only when a response combines at least 5 cited sources, at least 8 rule checks and a draft. This is our proxy for broad aggregation and deep analysis. There is no published upper bound.',
  },
} as const satisfies Record<CreditProfile, { label: string; range: CreditRange; description: string }>

export const creditProfileKeys: readonly CreditProfile[] = ['light', 'medium', 'heavy']

function assertCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Response counts must be non-negative safe integers.')
}

export function sumCreditRanges(ranges: readonly CreditRange[]): CreditRange {
  return ranges.reduce<CreditRange>((sum, range) => ({
    min: sum.min + range.min,
    max: sum.max === null || range.max === null ? null : sum.max + range.max,
  }), { min: 0, max: 0 })
}

export function estimateCreditCounts(counts: CreditCounts): CreditEstimate {
  const groups = creditProfileKeys.map(profile => {
    const count = counts[profile]
    assertCount(count)
    const unit = creditProfiles[profile].range
    return { profile, count, range: { min: count * unit.min, max: count === 0 ? 0 : unit.max === null ? null : count * unit.max } }
  })
  return { count: groups.reduce((sum, group) => sum + group.count, 0), range: sumCreditRanges(groups.map(group => group.range)), groups }
}

export function classifyCreditResponse(response: TestResponse): { profile: CreditProfile; reason: string } {
  const sources = new Set(response.citations.map(citation => citation.documentId)).size
  const checks = response.lab?.checks.length ?? 0
  const recommendations = response.lab?.recommendations.length ?? 0
  const draft = !!response.draft
  if (response.kind === 'missing-knowledge' || response.kind === 'out-of-scope') {
    return { profile: 'light', reason: 'A bounded missing-source or out-of-scope response; no completed synthesis or action is assumed.' }
  }
  const profile = sources >= 5 && checks >= 8 && draft ? 'heavy'
    : sources >= 3 || recommendations >= 3 || (checks >= 3 && draft) ? 'medium' : 'light'
  return {
    profile,
    reason: `${sources} distinct cited source(s), ${checks} rule check(s), ${recommendations} recommendation(s), and ${draft ? 'one reviewable draft' : 'no draft'}. ${response.toolId ? 'A tool is proposed, not executed or counted as another interaction.' : 'No tool execution is counted.'}`,
  }
}

export function estimateResponses(responses: readonly TestResponse[]): CreditEstimate {
  const counts = { light: 0, medium: 0, heavy: 0 }
  const classified = responses.map(classifyCreditResponse)
  for (const response of classified) counts[response.profile] += 1
  return { ...estimateCreditCounts(counts), ...(classified.length === 1 ? { reason: classified[0].reason } : {}) }
}

export function estimateConversation(messages: readonly ChatMessage[]): CreditEstimate {
  return estimateResponses(messages.flatMap(message => message.role === 'assistant' && message.response ? [message.response] : []))
}

export function getRecipeCreditBaseline(recipe: CompiledRecipe, session: Session) {
  const rows = getEvaluationRows(recipe, session).filter(row => {
    const testCase = recipe.lab?.cases.find(item => item.id === row.caseId)
    return !testCase?.disabledKnowledge?.length && !testCase?.disabledTools?.length
  })
  return {
    estimate: estimateResponses(rows.map(row => row.response)),
    blockedCount: rows.filter(row => row.response.kind === 'missing-knowledge' || row.response.kind === 'handoff-blocked' || row.response.kind === 'out-of-scope').length,
  }
}

export function projectCredits(estimate: CreditEstimate, responses: number): CreditRange {
  assertCount(responses)
  if (responses === 0) return { min: 0, max: 0 }
  if (!estimate.count) throw new RangeError('A monthly projection needs at least one baseline response.')
  return {
    min: estimate.range.min / estimate.count * responses,
    max: estimate.range.max === null ? null : estimate.range.max / estimate.count * responses,
  }
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export function formatCreditRange(range: CreditRange): string {
  const min = numberFormat.format(Math.floor(range.min * 10) / 10)
  if (range.max === null) return `${min}+`
  const max = numberFormat.format(Math.ceil(range.max * 10) / 10)
  return min === max ? min : `${min}\u2013${max}`
}
