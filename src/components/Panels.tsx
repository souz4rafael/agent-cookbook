import { useState } from 'react'
import {
  ArrowRightRegular as ArrowRight, ArrowUpRightRegular as ArrowUpRight, CheckmarkRegular as Check,
  ClockRegular as Clock3, ArrowDownloadRegular as Download,
  TaskListSquareLtrRegular as ListChecks, ShieldCheckmarkRegular as ShieldCheck,
} from '@fluentui/react-icons'
import type { AgentProfile, CompiledRecipe, Session } from '../domain/types.ts'
import { getAvailableKnowledge, isToolAvailable } from '../domain/engine.ts'
import { createImplementationBrief } from '../domain/export.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { implementationReferences } from '../content/implementation-references.ts'
import { InstructionEditor } from './InstructionEditor.tsx'
import { useReviewCue } from './reviewCue.ts'

interface ConfigurationProps { recipe: CompiledRecipe; session: Session }

export function BuildEditor({ recipe, session, updateProfile, onChangeIcon }: ConfigurationProps & {
  updateProfile: (patch: Partial<AgentProfile>) => boolean
  onChangeIcon: () => void
}) {
  const editable = (key: keyof AgentProfile) => recipe.editable.includes(key)
  const guideProfile = useReviewCue()?.type === 'profile-edited'
  return (
    <div className="build-editor">
      <div className="agent-identity"><button type="button" className="agent-large-icon" onClick={onChangeIcon} aria-label="Change agent icon" title="Change agent icon"><AgentIconGraphic icon={session.agentIcon} size={36} /></button><div><label className="sr-only" htmlFor="agent-name">Agent name</label><input id="agent-name" className="agent-name-input" data-review-cue={(guideProfile && editable('name')) || undefined} value={session.profile.name} maxLength={100} readOnly={!editable('name')} onChange={event => updateProfile({ name: event.target.value })} aria-describedby="agent-name-help" /><span id="agent-name-help" className="identity-hint">{editable('name') ? 'Your agent · editable draft' : 'Name defined by this recipe'}<span>{session.profile.name.length}/100</span></span></div></div>
      <InstructionEditor recipe={recipe} value={session.profile.instructions} onChange={instructions => updateProfile({ instructions })} />
    </div>
  )
}

export function PreviewSettings({ recipe, session, updateProfile }: ConfigurationProps & {
  updateProfile: (patch: Partial<AgentProfile>) => void
}) {
  const editable = (key: keyof AgentProfile) => recipe.editable.includes(key)
  const guideBehavior = useReviewCue()?.type === 'behavior-edited'
  return (
    <>
      <p className="field-hint">These exercise settings change the tone and detail of deterministic responses. They are not additional controls in Copilot Studio.</p>
      <div className="behaviour-content" data-review-cue={guideBehavior || undefined}>
          <fieldset className="segmented-field" disabled={!editable('tone')}><legend>Conversation tone</legend><div className="segmented-options">{([{ value: 'friendly', title: 'Friendly', detail: 'Warm and approachable' }, { value: 'formal', title: 'Formal', detail: 'Professional and direct' }] as const).map(item => <label key={item.value} className={session.profile.tone === item.value ? 'selected' : ''}><input type="radio" name="agent-tone" checked={session.profile.tone === item.value} onChange={() => updateProfile({ tone: item.value })} /><span><strong>{item.title}</strong><span>{item.detail}</span></span>{session.profile.tone === item.value && <Check fontSize={14} aria-hidden="true" />}</label>)}</div>{!editable('tone') && <p className="field-hint">Defined by this recipe.</p>}</fieldset>
          <fieldset className="segmented-field" disabled={!editable('detail')}><legend>Response detail</legend><div className="segmented-options">{([{ value: 'concise', title: 'Concise', detail: 'Straight to the point' }, { value: 'detailed', title: 'Detailed', detail: 'More context from the source' }] as const).map(item => <label key={item.value} className={session.profile.detail === item.value ? 'selected' : ''}><input type="radio" name="agent-detail" checked={session.profile.detail === item.value} onChange={() => updateProfile({ detail: item.value })} /><span><strong>{item.title}</strong><span>{item.detail}</span></span>{session.profile.detail === item.value && <Check fontSize={14} aria-hidden="true" />}</label>)}</div>{!editable('detail') && <p className="field-hint">Defined by this recipe.</p>}</fieldset>
      </div>
    </>
  )
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date) : 'Time unavailable'
}

export function ActivityPanel({ recipe, session }: ConfigurationProps) {
  return (
    <section className="workspace-page" aria-labelledby="monitor-title">
      <div className="workspace-page-heading"><div><h1 id="monitor-title">Monitor this exercise</h1><p>Local activity, not production analytics.</p></div><span className="scope-pill"><ShieldCheck fontSize={14} aria-hidden="true" />This browser only</span></div>
      <div className="local-metrics"><div><span>Questions in this chat</span><strong>{session.messages.filter(message => message.role === 'user').length}</strong></div><div><span>Active sources</span><strong>{getAvailableKnowledge(recipe, session).length}</strong></div><div><span>Simulated requests</span><strong>{session.cases.length}</strong></div></div>
      <div className="monitor-columns">
        <section className="content-section" aria-labelledby="cases-title"><div className="section-title-row"><h2 id="cases-title">Simulated requests</h2><span className="count-badge">{session.cases.length}</span></div>{session.cases.length === 0 ? <div className="empty-state"><ListChecks fontSize={28} aria-hidden="true" /><h3>No requests yet</h3><p>Confirm a simulated tool action in Preview to create a local record here.</p></div> : <div className="card-stack">{[...session.cases].reverse().map(item => <article className="case-card" key={item.id}><div className="section-title-row"><strong>{item.id}</strong><span className="simulation-badge">SIMULATED</span></div><p>{item.summary}</p><div className="case-meta"><span>{recipe.tools.find(tool => tool.id === item.toolId)?.title ?? item.toolId}</span><time dateTime={item.at}>{formatTime(item.at)}</time></div></article>)}</div>}</section>
        <section className="content-section" aria-labelledby="history-title"><div className="section-title-row"><h2 id="history-title">Activity history</h2><Clock3 fontSize={17} aria-hidden="true" /></div>{session.activity.length === 0 ? <div className="empty-state"><Clock3 fontSize={27} aria-hidden="true" /><h3>Your activity will appear here</h3><p>Connect a resource or run a conversation in Preview.</p></div> : <ol className="activity-list">{[...session.activity].reverse().map(activity => <li key={activity.id}><span className="timeline-dot" /><div><p>{activity.text}</p><time dateTime={activity.at}>{formatTime(activity.at)}</time></div></li>)}</ol>}</section>
      </div>
      <p className="fine-print">Times record activity in this exercise. Requests and receipts remain simulations; nothing is sent to a real service.</p>
    </section>
  )
}

export function ImplementationPanel({ recipe, session, onPreview }: ConfigurationProps & { onPreview: () => void }) {
  const [downloadMessage, setDownloadMessage] = useState('')
  function download() {
    try {
      const blob = new Blob([createImplementationBrief(recipe, session)], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `agent-cookbook-${recipe.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-implementation-brief.txt`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadMessage('Brief download requested. Check your browser’s downloads.')
    } catch { setDownloadMessage('The file could not be created. Please try again in this browser.') }
  }
  const sourceCount = getAvailableKnowledge(recipe, session).length
  const toolCount = recipe.tools.filter(tool => isToolAvailable(recipe, session, tool.id)).length
  return (
    <div className="implementation-content">
      <div className="callout accent"><ShieldCheck fontSize={22} aria-hidden="true" /><div><strong>No real publication takes place here.</strong><p>This is an educational publishing preview. Download a planning brief or continue testing. No agent is deployed, no account is accessed, and no data is uploaded.</p></div></div>
      <div className="publication-summary"><span className="square-icon"><AgentIconGraphic icon={session.agentIcon} /></span><div><h3>{session.profile.name}</h3><p>{sourceCount} active {sourceCount === 1 ? 'source' : 'sources'} · {toolCount} enabled {toolCount === 1 ? 'tool' : 'tools'}</p></div><span className="draft-badge">Draft</span></div>
      <div className="publish-actions"><button className="button primary" type="button" onClick={download}><Download fontSize={16} aria-hidden="true" />Download brief .txt</button><button className="button secondary" type="button" onClick={onPreview}>Open Preview <ArrowRight fontSize={16} aria-hidden="true" /></button></div>
      <p className="fine-print">A configuration and prerequisites document, not an importable or published agent.</p><p className="download-status" role="status">{downloadMessage}</p>
      <h3 className="implementation-heading">Before building in the real product</h3>
      <ol className="implementation-list">{recipe.implementation.map((item, index) => <li key={`${index}-${item.title}`}><span>{index + 1}</span><div><h4>{item.title}</h4><p>{item.description}</p></div></li>)}</ol>
      <h3 className="implementation-heading">Official implementation references</h3>
      <ul className="implementation-references">{implementationReferences.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}<span className="sr-only"> (opens in a new tab)</span></a></li>)}</ul>
      <p className="fine-print">These guides include standard-harness instructions. Screen names and availability vary by harness and environment; this simulator is not an exact product walkthrough.</p>
      <div className="callout"><ShieldCheck fontSize={19} aria-hidden="true" /><p>Verify sources, privacy, permissions, and your organisation’s policies. High-impact or sensitive decisions require human review.</p></div>
      <div className="handoff-links"><a className="button secondary" href="https://copilotstudio.microsoft.com" target="_blank" rel="noopener noreferrer">Open Copilot Studio <ArrowUpRight fontSize={15} aria-hidden="true" /><span className="sr-only"> (new tab)</span></a><a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">Recipe reference <ArrowUpRight fontSize={13} aria-hidden="true" /><span className="sr-only"> (new tab)</span></a></div>
      <p className="fine-print">Copilot Studio is an external Microsoft product and may require an account, licence, and permissions. This cookbook is independent.</p>
    </div>
  )
}
