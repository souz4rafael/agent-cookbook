import { useId, useRef, useState } from 'react'
import {
  ArrowDownRegular, ArrowDownloadRegular, ArrowUpRegular, ChevronDownRegular,
  CommentRegular, DismissRegular, InfoRegular, ThumbDislikeRegular, ThumbLikeRegular,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Session } from '../domain/types.ts'
import { getAvailableKnowledge } from '../domain/engine.ts'
import {
  getMonitorSnapshot, monitorRangeDays,
} from '../domain/monitor.ts'
import type { MonitorRangeDays, MonitorSampleSession } from '../domain/monitor.ts'
import { creditProfiles, formatCreditRange, getRecipeCreditBaseline } from '../domain/credits.ts'
import { CreditEstimate, CreditEstimateInfo } from './CreditEstimate.tsx'
import { InfoPopover } from './InfoPopover.tsx'
import { Modal } from './Modal.tsx'
import './MonitorPanel.css'

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const shortDateFormat = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', timeZone: 'UTC' })
const chartDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const sessionDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const activityDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const initialSessionCount = 6
const profileChartClasses = { light: 'answers', medium: 'actions', heavy: 'other' } as const
const sampleCreditNote = 'These are fictional sample counts, not your exercise activity. Each pair of sample messages represents one response, rounded down. Selected sample sessions include one Medium response; all remaining responses are Light. No Heavy responses are assumed in this sample.'

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds)
  const minutes = Math.floor(rounded / 60)
  return minutes ? `${minutes} min ${rounded % 60} sec` : `${rounded} sec`
}

function formatActivityTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? activityDateFormat.format(date) : 'Time unavailable'
}

function MetricChange({ value, lowerIsBetter = false, points = false }: { value: number | null; lowerIsBetter?: boolean; points?: boolean }) {
  if (value === null) return <span className="monitor-change">No prior data</span>
  const rounded = Math.round(value * 10) / 10
  const positive = rounded > 0
  const improved = lowerIsBetter ? rounded < 0 : positive
  const Arrow = positive ? ArrowUpRegular : ArrowDownRegular
  return (
    <span className={`monitor-change${rounded ? improved ? ' is-improved' : ' is-decreased' : ''}`}
      aria-label={`${numberFormat.format(Math.abs(rounded))} ${points ? 'percentage points' : 'percent'} ${rounded === 0 ? 'change' : positive ? 'increase' : 'decrease'} from the previous period`}>
      {rounded !== 0 ? <Arrow fontSize={12} aria-hidden="true" /> : <span aria-hidden="true">—</span>}
      <span>{numberFormat.format(Math.abs(rounded))}{points ? ' pp' : '%'}</span>
    </span>
  )
}

function CreditChart({ snapshot }: { snapshot: ReturnType<typeof getMonitorSnapshot> }) {
  const titleId = useId()
  const maximum = Math.max(1, ...snapshot.dailyCredits.map(day => day.range.max ?? day.range.min))
  const slot = 560 / snapshot.dailyCredits.length
  const barWidth = Math.min(24, slot * .6)
  return (
    <div className="monitor-credit-chart">
      <svg viewBox="0 0 560 82" preserveAspectRatio="none" role="img" aria-labelledby={titleId}>
        <title id={titleId}>Daily estimated credits consumption, {formatCreditRange(snapshot.summary.creditEstimate.range)} credits from {chartDateFormat.format(new Date(snapshot.startDate))} to {chartDateFormat.format(new Date(snapshot.endDate))}. Solid bars show lower bounds; shading extends to upper bounds.</title>
        <line x1="0" x2="560" y1="79" y2="79" className="monitor-chart-baseline" />
        {snapshot.dailyCredits.map((day, index) => {
          let bottom = 78
          return (
            <g key={day.date}>
              <title>{chartDateFormat.format(new Date(day.date))}: {formatCreditRange(day.range)} credits</title>
              <rect className="monitor-chart-range" x={index * slot + (slot - barWidth) / 2}
                y={78 - (day.range.max ?? day.range.min) / maximum * 68} width={barWidth} height={(day.range.max ?? day.range.min) / maximum * 68} rx="1" />
              {day.groups.map(group => {
                const height = group.range.min / maximum * 68
                bottom -= height
                return <rect key={group.profile} className={`monitor-chart-${profileChartClasses[group.profile]}`}
                  x={index * slot + (slot - barWidth) / 2} y={bottom} width={barWidth} height={height} rx="1" />
              })}
              {day.range.max === null && <text x={index * slot + slot / 2} y={bottom - 2} textAnchor="middle" className="monitor-chart-open-bound">+</text>}
            </g>
          )
        })}
      </svg>
      <div className="monitor-chart-dates"><span>{chartDateFormat.format(new Date(snapshot.startDate))}</span><span>{chartDateFormat.format(new Date(snapshot.endDate))}</span></div>
      <p className="monitor-chart-note">Solid: lower bound. Shaded: upper bound. +: no published upper bound.</p>
    </div>
  )
}

function ExerciseHistory({ recipe, session, onClose }: { recipe: CompiledRecipe; session: Session; onClose: () => void }) {
  const sources = getAvailableKnowledge(recipe, session).length
  return (
    <Modal title="Your exercise activity" eyebrow="LOCAL HISTORY" onClose={onClose} wide className="monitor-history-dialog">
      <div className="modal-body">
        <p>These are your actions in this browser, separate from the sample analytics. Requests remain local simulations; nothing is sent to a service.</p>
        <dl className="monitor-local-summary">
          <div><dt>Questions asked</dt><dd>{session.messages.filter(message => message.role === 'user').length}</dd></div>
          <div><dt>Active sources</dt><dd>{sources}</dd></div>
          <div><dt>Simulated requests</dt><dd>{session.cases.length}</dd></div>
        </dl>
        <section className="monitor-history-section" aria-labelledby="monitor-exercise-requests">
          <h3 id="monitor-exercise-requests">Simulated requests <span>{session.cases.length}</span></h3>
          {session.cases.length === 0
            ? <p className="monitor-history-empty">No requests yet. Confirm a simulated tool action in Preview to create a local record.</p>
            : <ul className="monitor-request-list">{[...session.cases].reverse().map(item => (
              <li key={item.id}>
                <div className="monitor-request-heading"><strong>{item.id}</strong><time dateTime={item.at}>{formatActivityTime(item.at)}</time></div>
                <p>{item.summary}</p>
                <span>{recipe.tools.find(tool => tool.id === item.toolId)?.title ?? item.toolId}</span>
              </li>
            ))}</ul>}
        </section>
        <section className="monitor-history-section" aria-labelledby="monitor-exercise-history">
          <h3 id="monitor-exercise-history">Activity history <span>{session.activity.length}</span></h3>
          {session.activity.length === 0
            ? <p className="monitor-history-empty">Your activity will appear here. Connect a resource or start a conversation in Preview.</p>
            : <ol className="monitor-history-items">{[...session.activity].reverse().map(activity => (
              <li key={activity.id}><p>{activity.text}</p><time dateTime={activity.at}>{formatActivityTime(activity.at)}</time></li>
            ))}</ol>}
        </section>
        <p className="fine-print">Activity times use your local time zone.</p>
      </div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Close</button></div>
    </Modal>
  )
}

function FeedbackComments({ sessions, onClose }: { sessions: readonly MonitorSampleSession[]; onClose: () => void }) {
  const comments = sessions.filter(session => session.comment)
  return (
    <Modal title="Feedback comments" eyebrow="SAMPLE FEEDBACK" onClose={onClose} className="monitor-feedback-dialog">
      <div className="modal-body">
        <p>Fictional feedback for the selected date range.</p>
        {comments.length === 0 ? <p className="monitor-history-empty">No comments in this date range.</p> : (
          <ul className="monitor-feedback-list">{comments.map(session => (
            <li key={session.id}>
              <div>{session.reaction === 'positive' ? <ThumbLikeRegular fontSize={16} aria-hidden="true" /> : <ThumbDislikeRegular fontSize={16} aria-hidden="true" />}
                <strong>{session.startedBy}</strong><span className="sr-only">{session.reaction} reaction</span>
                <time dateTime={session.startedAt}>{chartDateFormat.format(new Date(session.startedAt))}</time>
              </div>
              <p>{session.comment}</p>
            </li>
          ))}</ul>
        )}
      </div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Close</button></div>
    </Modal>
  )
}

export function MonitorPanel({ recipe, session }: { recipe: CompiledRecipe; session: Session }) {
  const [days, setDays] = useState<MonitorRangeDays>(7)
  const [showBanner, setShowBanner] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [dialog, setDialog] = useState<'history' | 'feedback' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const rangeId = useId()
  const volumeId = useId()
  const [monthlyVolume, setMonthlyVolume] = useState('1000')
  const volume = /^\d{1,7}$/.test(monthlyVolume) && Number(monthlyVolume) <= 1_000_000 ? Number(monthlyVolume) : null
  const baseline = getRecipeCreditBaseline(recipe, session)
  const snapshot = getMonitorSnapshot(days)
  const { summary, changes } = snapshot
  const visibleSessions = showAll ? snapshot.sessions : snapshot.sessions.slice(0, initialSessionCount)
  const reactionCount = summary.reactions.positive + summary.reactions.negative
  const positiveRate = reactionCount ? summary.reactions.positive / reactionCount * 100 : 0

  function changeRange(value: string) {
    const selected = monitorRangeDays.find(range => range === Number(value))
    if (selected) {
      setDays(selected)
      setShowAll(false)
    }
  }

  return (
    <section className="monitor-panel" aria-labelledby="monitor-title">
      {showBanner && <aside className="monitor-banner" aria-label="About this Monitor example">
        <InfoRegular fontSize={20} aria-hidden="true" />
        <div><strong>See what Monitor can tell you</strong><p>Explore an example of a published agent’s performance. Your own exercise is tracked separately in activity history.</p></div>
        <button className="icon-button" type="button" aria-label="Dismiss Monitor information" onClick={() => { setShowBanner(false); heading.current?.focus() }}>
          <DismissRegular fontSize={17} aria-hidden="true" />
        </button>
      </aside>}
      <div className="monitor-heading">
        <div className="monitor-title-group"><h1 id="monitor-title" ref={heading} tabIndex={-1}>Monitor</h1><span className="monitor-sample-chip">Sample data</span></div>
        <div className="monitor-toolbar">
          <span className="monitor-download" title="Analytics download is not available in this local example.">
            <button type="button" className="icon-button" disabled aria-label="Download analytics (not available in this example)">
              <ArrowDownloadRegular fontSize={19} aria-hidden="true" />
            </button>
          </span>
          <label className="monitor-range" htmlFor={rangeId}>
            <span className="sr-only">Analytics date range</span>
            <select id={rangeId} value={days} onChange={event => changeRange(event.target.value)}>
              {monitorRangeDays.map(range => {
                const dates = getMonitorSnapshot(range)
                return <option key={range} value={range}>Last {range} days ({shortDateFormat.format(new Date(dates.startDate))} - {shortDateFormat.format(new Date(dates.endDate))})</option>
              })}
            </select>
            <ChevronDownRegular fontSize={15} aria-hidden="true" />
          </label>
        </div>
      </div>

      <section className="monitor-card monitor-overview" aria-labelledby="monitor-overview-title">
        <div className="monitor-card-heading">
          <h2 id="monitor-overview-title">Overview</h2>
          <InfoPopover title="Overview">
            <p>The Overview, feedback, chart and sessions are fictional examples, fixed to November 16, 2026. They are never added to your exercise history. The separate monthly projection uses your current recipe settings.</p>
            <p>Success rate is the share of sessions marked successful. Changes compare with the preceding {days} days; success rate uses percentage points. Credit ranges use the same Light, Medium and Heavy bands as Preview, applied to this sample response mix.</p>
          </InfoPopover>
        </div>
        <dl className="monitor-metrics">
          <div><dt>Total sessions</dt><dd>{numberFormat.format(summary.totalSessions)}<MetricChange value={changes.totalSessions} /></dd></div>
          <div><dt>Avg duration</dt><dd>{formatDuration(summary.averageDurationSeconds)}<MetricChange value={changes.averageDuration} lowerIsBetter /></dd></div>
          <div><dt>Success rate</dt><dd>{numberFormat.format(summary.successRate)}%<MetricChange value={changes.successRate} points /></dd></div>
          <div><dt>Estimated credits consumption</dt><dd>{formatCreditRange(summary.creditEstimate.range)}<CreditEstimateInfo estimate={summary.creditEstimate} scope="Selected sample period" basisNote={sampleCreditNote} /></dd></div>
        </dl>
      </section>

      <div className="monitor-insights-grid">
        <section className="monitor-card monitor-reactions" aria-labelledby="monitor-reactions-title">
          <div className="monitor-card-heading">
            <h2 id="monitor-reactions-title">Reactions</h2>
            <InfoPopover title="Reactions"><p>Feedback is counted once per session. The positive rate uses only sessions with a positive or negative reaction; sessions without feedback are excluded.</p></InfoPopover>
            <button className="icon-button monitor-comment-button" type="button" onClick={() => setDialog('feedback')} aria-label="View feedback comments" title="View feedback comments"><CommentRegular fontSize={19} aria-hidden="true" /></button>
          </div>
          <div className="monitor-reactions-body">
            <div className="monitor-reaction-ring">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="monitor-ring-track" cx="60" cy="60" r="48" strokeWidth="10" />
                <circle className="monitor-ring-value" cx="60" cy="60" r="48" strokeWidth="10" pathLength="100"
                  strokeDasharray={`${positiveRate} ${100 - positiveRate}`} transform="rotate(-90 60 60)" />
              </svg>
              <div><strong>{Math.round(positiveRate)}%</strong><span>Positive</span></div>
            </div>
            <div className="monitor-reaction-details">
              <dl>
                <div><dt><ThumbLikeRegular fontSize={17} aria-hidden="true" />Positive</dt><dd>{summary.reactions.positive}</dd></div>
                <div><dt><ThumbDislikeRegular fontSize={17} aria-hidden="true" />Negative</dt><dd>{summary.reactions.negative}</dd></div>
                <div className="monitor-unrated"><dt>No feedback</dt><dd>{summary.reactions.unrated}</dd></div>
              </dl>
              <p>{reactionCount} of {summary.totalSessions} sessions included feedback</p>
            </div>
          </div>
        </section>
        <section className="monitor-card monitor-credits" aria-labelledby="monitor-credits-title">
          <div className="monitor-card-heading">
            <h2 id="monitor-credits-title">Estimated credits consumption</h2>
            <CreditEstimateInfo estimate={summary.creditEstimate} scope="Selected sample period" basisNote={sampleCreditNote} />
          </div>
          <CreditChart snapshot={snapshot} />
          <dl className="monitor-credit-legend">{summary.creditEstimate.groups.map(group => (
            <div key={group.profile}><dt><span className={`monitor-credit-dot monitor-chart-${profileChartClasses[group.profile]}`} />{creditProfiles[group.profile].label}</dt><dd>{formatCreditRange(group.range)}</dd></div>
          ))}</dl>
        </section>
      </div>

      <section className="monitor-card credit-projection" aria-labelledby={`${volumeId}-title`}>
        <div className="monitor-card-heading"><h2 id={`${volumeId}-title`}>Explore this recipe's monthly consumption</h2></div>
        <p>Separate from the sample analytics above. Uses {baseline.estimate.count} recipe scenarios with your current settings, equally weighted. Cases that deliberately disconnect knowledge or disable tools are excluded. This is an editable planning assumption, not a forecast of your users' behaviour.</p>
        {baseline.blockedCount > 0 && <p role="status">{baseline.blockedCount} baseline response(s) are blocked or out of scope. Review your connections and scenario mix before using this as an operational estimate.</p>}
        <div className="credit-projection-controls">
          <label htmlFor={volumeId}>Responses per month<input id={volumeId} type="number" min="0" max="1000000" step="1" value={monthlyVolume}
            aria-invalid={volume === null} aria-describedby={volume === null ? `${volumeId}-error` : undefined} onChange={event => setMonthlyVolume(event.target.value)} /></label>
          {volume !== null && <CreditEstimate estimate={baseline.estimate} monthlyResponses={volume} scope="Monthly recipe projection"
            basisNote={`The baseline gives equal weight to ${baseline.estimate.count} recipe scenarios with your current settings. Deliberate disconnected-source and disabled-tool test fixtures are excluded. ${baseline.blockedCount} included response(s) are blocked or out of scope; review your configuration and mix before operational planning.`} />}
        </div>
        {volume === null && <p id={`${volumeId}-error`} className="error-notice" role="alert">Enter a whole number from 0 to 1,000,000 responses.</p>}
      </section>

      <section className="monitor-sessions" aria-labelledby="monitor-sessions-title">
        <div className="monitor-sessions-heading">
          <div className="monitor-card-heading"><h2 id="monitor-sessions-title">Sessions</h2><InfoPopover title="Sessions"><p>Sessions in the selected date range, newest first. Times are shown in UTC. Select View activity history for your actual local exercise records, including simulated requests.</p></InfoPopover></div>
          <div className="monitor-session-actions">
            <button className="monitor-history-button" type="button" onClick={() => setDialog('history')}>View activity history</button>
            <button className="button secondary monitor-see-all" type="button" aria-expanded={showAll} aria-controls="monitor-session-table"
              disabled={snapshot.sessions.length <= initialSessionCount} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `See all (${snapshot.sessions.length})`}
            </button>
          </div>
        </div>
        <div className="monitor-table-scroll" role="region" aria-label="Sessions table" tabIndex={0}>
          <table id="monitor-session-table" className="monitor-session-table">
            <caption className="sr-only">Fictional sessions from {snapshot.startDate} through {snapshot.endDate}. Times are in UTC. Showing {visibleSessions.length} of {snapshot.sessions.length} sessions.</caption>
            <thead><tr>
              <th scope="col" aria-sort="descending"><span>Start time <ArrowDownRegular fontSize={13} aria-hidden="true" /></span></th>
              <th scope="col">Duration</th><th scope="col">Messages</th><th scope="col">Started by</th>
            </tr></thead>
            <tbody>{visibleSessions.map(item => (
              <tr key={item.id}>
                <td><time dateTime={item.startedAt}>{sessionDateFormat.format(new Date(item.startedAt))}</time></td>
                <td>{formatDuration(item.durationSeconds)}</td>
                <td>{item.messages}</td>
                <td><span className="monitor-visitor"><span className="monitor-visitor-icon" aria-hidden="true">V</span>{item.startedBy}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="monitor-table-summary" role="status">Showing {visibleSessions.length} of {snapshot.sessions.length} sessions<span>Times in UTC</span></p>
      </section>
      {dialog === 'history' && <ExerciseHistory recipe={recipe} session={session} onClose={() => setDialog(null)} />}
      {dialog === 'feedback' && <FeedbackComments sessions={snapshot.sessions} onClose={() => setDialog(null)} />}
    </section>
  )
}
