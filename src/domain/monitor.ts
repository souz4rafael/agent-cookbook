import { estimateCreditCounts } from './credits.ts'
import type { CreditCounts } from './credits.ts'

export const monitorAsOf = '2026-11-16'
export const monitorRangeDays = [7, 14, 30] as const
export type MonitorRangeDays = typeof monitorRangeDays[number]

export interface MonitorSampleSession {
  readonly id: string
  readonly startedAt: string
  readonly durationSeconds: number
  readonly messages: number
  readonly startedBy: string
  readonly successful: boolean
  readonly reaction: 'positive' | 'negative' | null
  readonly comment?: string
  readonly responseCounts: CreditCounts
}

const dayMilliseconds = 86_400_000
const endExclusive = Date.parse(`${monitorAsOf}T00:00:00.000Z`) + dayMilliseconds
const recentDailyCounts = [7, 6, 8, 5, 7, 5, 4, 6, 5, 6, 4, 6, 4, 4]
const positiveComments = [
  'The answer was clear and easy to follow.',
  'I found the information I needed.',
  'The next steps were helpful.',
]
const negativeComments = [
  'I would have liked a little more detail.',
  'I still needed help with my question.',
]

// Fixed fixtures, independent of the clock and the user's exercise session.
export const monitorSampleSessions: readonly MonitorSampleSession[] = Object.freeze(
  Array.from({ length: 60 }, (_, dayOffset) => {
    const date = endExclusive - (dayOffset + 1) * dayMilliseconds
    const count = recentDailyCounts[dayOffset] ?? 3 + dayOffset % 4
    return Array.from({ length: count }, (_, index): MonitorSampleSession => {
      const seed = dayOffset * 11 + index + 1
      const successful = seed % (dayOffset < 7 ? 13 : 7) !== 0
      const reaction = seed % 4 === 0 ? null : successful ? 'positive' : 'negative'
      const messages = 4 + seed % 9
      const comments = reaction === 'positive' ? positiveComments : negativeComments
      return Object.freeze({
        id: `sample-session-${new Date(date).toISOString().slice(0, 10)}-${index + 1}`,
        startedAt: new Date(date + (540 + index * 37 + dayOffset % 17) * 60_000).toISOString(),
        durationSeconds: (dayOffset < 7 ? 120 : 165) + seed * 23 % 190,
        messages,
        startedBy: `Visitor ${String((dayOffset * 7 + index) % 28 + 1).padStart(3, '0')}`,
        successful,
        reaction,
        ...(reaction && seed % 3 === 1 ? { comment: comments[seed % comments.length] } : {}),
        responseCounts: Object.freeze({
          light: Math.floor(messages / 2) - (seed % 3 === 0 ? 1 : 0),
          medium: seed % 3 === 0 ? 1 : 0,
          heavy: 0,
        }),
      })
    })
  }).flat(),
)

export function filterMonitorSessions(
  sessions: readonly MonitorSampleSession[],
  startInclusive: string,
  endExclusive: string,
): MonitorSampleSession[] {
  return sessions
    .filter(session => session.startedAt >= startInclusive && session.startedAt < endExclusive)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export function summarizeMonitorSessions(sessions: readonly MonitorSampleSession[]) {
  const counts = { light: 0, medium: 0, heavy: 0 }
  const reactions = { positive: 0, negative: 0, unrated: 0 }
  let durationSeconds = 0
  let successful = 0
  for (const session of sessions) {
    durationSeconds += session.durationSeconds
    if (session.successful) successful += 1
    reactions[session.reaction ?? 'unrated'] += 1
    counts.light += session.responseCounts.light
    counts.medium += session.responseCounts.medium
    counts.heavy += session.responseCounts.heavy
  }
  return {
    totalSessions: sessions.length,
    averageDurationSeconds: sessions.length ? durationSeconds / sessions.length : 0,
    successRate: sessions.length ? successful / sessions.length * 100 : 0,
    successfulSessions: successful,
    creditEstimate: estimateCreditCounts(counts),
    reactions,
  }
}

export function monitorPercentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous * 100
}

export function getMonitorSnapshot(days: MonitorRangeDays, source = monitorSampleSessions) {
  if (!monitorRangeDays.includes(days)) throw new RangeError('Choose a supported Monitor date range.')
  const start = endExclusive - days * dayMilliseconds
  const previousStart = start - days * dayMilliseconds
  const startAt = new Date(start).toISOString()
  const sessions = filterMonitorSessions(source, startAt, new Date(endExclusive).toISOString())
  const previousSessions = filterMonitorSessions(source, new Date(previousStart).toISOString(), startAt)
  const summary = summarizeMonitorSessions(sessions)
  const previousSummary = summarizeMonitorSessions(previousSessions)
  const dailyCredits = Array.from({ length: days }, (_, index) => {
    const date = new Date(start + index * dayMilliseconds).toISOString().slice(0, 10)
    const daily = summarizeMonitorSessions(sessions.filter(session => session.startedAt.startsWith(date)))
    return { date, ...daily.creditEstimate }
  })
  return {
    startDate: startAt.slice(0, 10),
    endDate: monitorAsOf,
    sessions,
    summary,
    previousSummary,
    dailyCredits,
    changes: {
      totalSessions: monitorPercentageChange(summary.totalSessions, previousSummary.totalSessions),
      averageDuration: monitorPercentageChange(summary.averageDurationSeconds, previousSummary.averageDurationSeconds),
      successRate: summary.successRate - previousSummary.successRate,
    },
  }
}
