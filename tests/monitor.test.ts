import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterMonitorSessions, getMonitorSnapshot, monitorAsOf, monitorPercentageChange,
  monitorRangeDays, monitorSampleSessions, summarizeMonitorSessions,
} from '../src/domain/monitor.ts'
import type { MonitorSampleSession } from '../src/domain/monitor.ts'
import { sumCreditRanges } from '../src/domain/credits.ts'

function sample(overrides: Partial<MonitorSampleSession> = {}): MonitorSampleSession {
  return {
    id: 'sample-test',
    startedAt: '2026-11-16T10:00:00.000Z',
    durationSeconds: 120,
    messages: 6,
    startedBy: 'Visitor 001',
    successful: true,
    reaction: 'positive',
    responseCounts: { light: 2, medium: 1, heavy: 0 },
    ...overrides,
  }
}

test('Monitor uses deterministic fictional records without exercise data or the current clock', () => {
  assert.equal(monitorAsOf, '2026-11-16')
  assert.equal(getMonitorSnapshot(7).summary.totalSessions, 42)
  assert.equal(getMonitorSnapshot(7).previousSummary.totalSessions, 35)
  assert.equal(new Set(monitorSampleSessions.map(session => session.id)).size, monitorSampleSessions.length)
  assert.ok(Object.isFrozen(monitorSampleSessions))
  for (const session of monitorSampleSessions) {
    assert.ok(session.id.startsWith('sample-session-'))
    assert.match(session.startedBy, /^Visitor \d{3}$/u)
    assert.ok(Object.isFrozen(session))
    assert.ok(Object.isFrozen(session.responseCounts))
    assert.equal(session.responseCounts.light + session.responseCounts.medium + session.responseCounts.heavy, Math.floor(session.messages / 2))
    assert.ok(Number.isFinite(Date.parse(session.startedAt)))
    assert.ok(session.durationSeconds > 0)
    assert.ok(session.messages > 0)
    if (session.comment) assert.ok(session.reaction)
  }
  assert.deepEqual(getMonitorSnapshot(7), getMonitorSnapshot(7))
})

test('date filtering includes the first midnight, excludes the next midnight, and sorts newest first', () => {
  const sessions = Object.freeze([
    sample({ id: 'end', startedAt: '2026-11-17T00:00:00.000Z' }),
    sample({ id: 'start', startedAt: '2026-11-10T00:00:00.000Z' }),
    sample({ id: 'before', startedAt: '2026-11-09T23:59:59.999Z' }),
    sample({ id: 'last', startedAt: '2026-11-16T23:59:59.999Z' }),
  ])
  assert.deepEqual(filterMonitorSessions(sessions, '2026-11-10T00:00:00.000Z', '2026-11-17T00:00:00.000Z').map(session => session.id), ['last', 'start'])
  assert.deepEqual(sessions.map(session => session.id), ['end', 'start', 'before', 'last'])
})

test('metrics, feedback, and credits are computed from the same records', () => {
  const result = summarizeMonitorSessions([
    sample(),
    sample({ id: 'two', durationSeconds: 180, successful: false, reaction: 'negative', responseCounts: { light: 3, medium: 0, heavy: 0 } }),
    sample({ id: 'three', durationSeconds: 60, reaction: null, responseCounts: { light: 1, medium: 2, heavy: 0 } }),
  ])
  assert.equal(result.totalSessions, 3)
  assert.equal(result.averageDurationSeconds, 120)
  assert.equal(result.successfulSessions, 2)
  assert.equal(result.successRate, 2 / 3 * 100)
  assert.deepEqual(result.reactions, { positive: 1, negative: 1, unrated: 1 })
  assert.deepEqual(result.creditEstimate.groups.map(group => group.count), [6, 3, 0])
  assert.deepEqual(result.creditEstimate.range, { min: 1500, max: 3300 })
})

test('each date range has a complete daily series and a separate, equally sized comparison period', () => {
  for (const days of monitorRangeDays) {
    const snapshot = getMonitorSnapshot(days)
    assert.equal(snapshot.dailyCredits.length, days)
    assert.equal(snapshot.dailyCredits[0].date, snapshot.startDate)
    assert.equal(snapshot.dailyCredits.at(-1)?.date, snapshot.endDate)
    assert.deepEqual(sumCreditRanges(snapshot.dailyCredits.map(day => day.range)), snapshot.summary.creditEstimate.range)
    for (const group of snapshot.summary.creditEstimate.groups) {
      assert.equal(snapshot.dailyCredits.reduce((sum, day) => sum + day.groups.find(item => item.profile === group.profile)!.count, 0), group.count)
    }
    assert.equal(snapshot.summary.reactions.positive + snapshot.summary.reactions.negative + snapshot.summary.reactions.unrated, snapshot.sessions.length)
    assert.equal(snapshot.changes.totalSessions, monitorPercentageChange(snapshot.summary.totalSessions, snapshot.previousSummary.totalSessions))
    assert.equal(snapshot.changes.averageDuration, monitorPercentageChange(snapshot.summary.averageDurationSeconds, snapshot.previousSummary.averageDurationSeconds))
    assert.equal(snapshot.changes.successRate, snapshot.summary.successRate - snapshot.previousSummary.successRate)
  }
  assert.equal(getMonitorSnapshot(7).startDate, '2026-11-10')
  assert.equal(getMonitorSnapshot(14).startDate, '2026-11-03')
  assert.equal(getMonitorSnapshot(30).startDate, '2026-10-18')
  assert.equal(getMonitorSnapshot(14).summary.totalSessions, 77)
  assert.equal(getMonitorSnapshot(7).changes.totalSessions, 20)
})

test('comparison-period boundaries do not double count sessions', () => {
  const snapshot = getMonitorSnapshot(7, [
    sample({ id: 'previous-start', startedAt: '2026-11-03T00:00:00.000Z' }),
    sample({ id: 'previous-end', startedAt: '2026-11-09T23:59:59.999Z' }),
    sample({ id: 'current-start', startedAt: '2026-11-10T00:00:00.000Z' }),
    sample({ id: 'excluded', startedAt: '2026-11-02T23:59:59.999Z' }),
  ])
  assert.equal(snapshot.summary.totalSessions, 1)
  assert.equal(snapshot.previousSummary.totalSessions, 2)
  assert.equal(snapshot.changes.totalSessions, -50)
})

test('empty periods produce finite zero metrics and zero-filled chart days', () => {
  const snapshot = getMonitorSnapshot(7, [])
  assert.equal(snapshot.summary.totalSessions, 0)
  assert.equal(snapshot.summary.averageDurationSeconds, 0)
  assert.equal(snapshot.summary.successRate, 0)
  assert.deepEqual(snapshot.summary.creditEstimate.range, { min: 0, max: 0 })
  assert.deepEqual(snapshot.changes, { totalSessions: 0, averageDuration: 0, successRate: 0 })
  assert.ok(snapshot.dailyCredits.every(day => day.range.min === 0 && day.range.max === 0))
  assert.equal(monitorPercentageChange(5, 0), null)
  assert.equal(monitorPercentageChange(0, 5), -100)
  assert.equal(monitorPercentageChange(10, 5), 100)
  assert.equal(getMonitorSnapshot(7, [sample()]).changes.totalSessions, null)
})

test('unsupported date ranges are rejected instead of displaying partial sample data', () => {
  // @ts-expect-error Validate values from runtime callers too.
  assert.throws(() => getMonitorSnapshot(90), /supported Monitor date range/u)
})

test('a Heavy sample makes the day and period open-ended, but not empty days', () => {
  const snapshot = getMonitorSnapshot(7, [sample({ responseCounts: { light: 2, medium: 0, heavy: 1 } })])
  assert.deepEqual(snapshot.summary.creditEstimate.range, { min: 700, max: null })
  assert.equal(snapshot.dailyCredits.at(-1)?.range.max, null)
  assert.ok(snapshot.dailyCredits.slice(0, -1).every(day => day.range.max === 0))
})
