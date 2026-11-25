import { useState } from 'react'
import {
  ArrowLeftRegular as ArrowLeft, ArrowRightRegular as ArrowRight, CheckmarkRegular as Check,
  CheckmarkCircleRegular as CheckCircle2, DatabaseRegular as Database, InfoRegular as Info,
  LinkRegular as Link2, PlugConnectedRegular as Plug, ShieldCheckmarkRegular as ShieldCheck, PlugDisconnectedRegular as Unplug,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Connection, Session } from '../domain/types.ts'
import { Modal } from './Modal.tsx'
import { useReviewCue } from './reviewCue.ts'

// Only the in-flight wizard request carries guidance; the recipe connection is unchanged.
export type WizardConnection = Connection & {
  chooserReview?: {
    item?: { type: 'knowledge' | 'tool'; id: string; resourceId: string }
    onReturn: () => void
  }
}

export function ConnectionCard({ connection, resourceId, onConnect, onDisconnect, reviewActive }: {
  connection: Connection
  resourceId?: string
  onConnect: () => void
  onDisconnect: () => void
  reviewActive?: boolean
}) {
  const resource = connection.resources.find(item => item.id === resourceId)
  return (
    <article className="connection-card">
      <div className="connection-card-main">
        <span className="square-icon"><Plug fontSize={20} aria-hidden="true" /></span>
        <div className="connection-copy">
          <div className="item-title"><h4>{connection.title}</h4><span className={`status-label${resource ? ' success' : ''}`}>{resource && <CheckCircle2 fontSize={13} aria-hidden="true" />}{resource ? 'Connected in simulation' : 'Not connected'}</span></div>
          <p>{connection.description}</p>
          {resource && <p className="resource-label"><Database fontSize={14} aria-hidden="true" />{resource.label}<span>· {connection.accountLabel}</span></p>}
        </div>
      </div>
      <div className="connection-actions">
        <button className={`button small ${resource ? 'secondary' : 'primary'}`} type="button" data-review-cue={reviewActive || undefined} onClick={onConnect} aria-label={`${resource ? 'Change connection' : 'Connect'}: ${connection.title}`}><Link2 fontSize={14} aria-hidden="true" />{resource ? 'Change' : 'Connect'}</button>
        {resource && <button className="button small quiet" type="button" onClick={onDisconnect} aria-label={`Disconnect ${connection.title}`}><Unplug fontSize={14} aria-hidden="true" />Disconnect</button>}
      </div>
    </article>
  )
}

export function ConnectionWizard({ connection, currentResource, onClose, onConnect }: {
  connection: WizardConnection
  currentResource?: string
  onClose: () => void
  onConnect: (resourceId: string) => void
}) {
  const [stage, setStage] = useState(0)
  const [selectedId, setSelectedId] = useState(currentResource ?? '')
  const selected = connection.resources.find(resource => resource.id === selectedId)
  const cue = useReviewCue()
  const target = connection.chooserReview?.item
  const matchesItem = target && (
    (cue?.type === 'knowledge' && target.type === 'knowledge' && cue.documentId === target.id)
    || (cue?.type === 'tool' && target.type === 'tool' && cue.toolId === target.id)
  )
  const reviewing = (cue?.type === 'connection' && cue.connectionId === connection.id) || matchesItem
  const requiredResource = matchesItem ? target.resourceId : undefined
  const selectionMatchesCue = !!selected && (requiredResource === undefined || selected.id === requiredResource)
  function close() {
    connection.chooserReview?.onReturn()
    onClose()
  }
  return (
    <Modal title={`Connect ${connection.title}`} eyebrow="SIMULATED CONNECTION" onClose={close}>
      <ol className="wizard-progress" aria-label="Connection steps">{['Fictional account', 'Resource', 'Review'].map((label, index) => <li key={label} className={index === stage ? 'current' : index < stage ? 'complete' : ''} aria-current={index === stage ? 'step' : undefined}><span>{index < stage ? <Check fontSize={13} aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
      <div className="modal-body wizard-body" aria-live="polite">
        {stage === 0 && <>
          <div className="wizard-intro-icon"><ShieldCheck fontSize={30} aria-hidden="true" /></div>
          <h3>A fictional account. No sign-in.</h3>
          <p>Explore a connection using the recipe’s example data. No email address, password, or permissions are needed.</p>
          <div className="account-preview"><span className="avatar"><Plug fontSize={18} aria-hidden="true" /></span><div><strong>{connection.accountLabel}</strong><span>Fictional identity for this recipe only</span></div><span className="simulation-badge">SIMULATION</span></div>
          <div className="callout"><Info fontSize={17} aria-hidden="true" /><div><strong>In the real product</strong><p>{connection.realWorldNote}</p></div></div>
        </>}
        {stage === 1 && <>
          <h3>Choose a fictional resource</h3>
          <p>Connecting a resource does not automatically add its sources or enable a tool.</p>
          <fieldset className="resource-options" data-review-cue={(reviewing && !requiredResource && !selected && connection.resources.length > 0) || undefined}>
            <legend className="sr-only">Available resource</legend>
            {connection.resources.map(resource => <label className={`resource-option${selectedId === resource.id ? ' selected' : ''}`} key={resource.id} data-review-cue={(requiredResource === resource.id && selectedId !== resource.id) || undefined}><input type="radio" name={`resource-${connection.id}`} value={resource.id} checked={selectedId === resource.id} onChange={() => setSelectedId(resource.id)} /><span><strong>{resource.label}</strong><span>{resource.description}</span></span><Database fontSize={19} aria-hidden="true" /></label>)}
            {connection.resources.length === 0 && <p>No resources are available in this recipe.</p>}
          </fieldset>
        </>}
        {stage === 2 && selected && <>
          <h3>Review your connection</h3>
          <p>Nothing outside this browser will be accessed or changed.</p>
          <dl className="review-list"><div><dt>Connection</dt><dd>{connection.title}</dd></div><div><dt>Fictional account</dt><dd>{connection.accountLabel}</dd></div><div><dt>Resource</dt><dd>{selected.label}</dd></div></dl>
          <div className="callout accent"><CheckCircle2 fontSize={18} aria-hidden="true" /><p>After connecting, select the sources or enable the tool, then add your selection to the agent.</p></div>
        </>}
      </div>
      <div className="modal-footer">
        <button className="button secondary" type="button" data-review-cue={(reviewing && stage === 2 && !selectionMatchesCue) || undefined} onClick={stage === 0 ? close : () => setStage(stage - 1)}>{stage > 0 && <ArrowLeft fontSize={15} aria-hidden="true" />}{stage === 0 ? 'Cancel' : 'Back'}</button>
        <button className="button primary" type="button" data-review-cue={(reviewing && (stage === 0 || selectionMatchesCue)) || undefined} disabled={stage > 0 && !selected} onClick={() => {
          if (stage < 2) setStage(stage + 1)
          else if (selected) { connection.chooserReview?.onReturn(); onConnect(selected.id) }
        }}>
          {stage === 0 ? 'Continue with fictional account' : stage === 1 ? 'Review connection' : 'Connect in simulation'}{stage < 2 ? <ArrowRight fontSize={16} aria-hidden="true" /> : <Check fontSize={16} aria-hidden="true" />}
        </button>
      </div>
    </Modal>
  )
}

export function DocumentViewer({ document, recipe, session, onClose }: {
  document: CompiledRecipe['knowledge'][number]
  recipe: CompiledRecipe
  session: Session
  onClose: () => void
}) {
  const connection = recipe.connections.find(item => item.id === document.connectionId)
  const resource = connection?.resources.find(item => item.id === document.resourceId)
  const isAvailable = session.connections[document.connectionId] === document.resourceId && session.enabledKnowledge.includes(document.id)
  return (
    <Modal title={document.title} eyebrow="FICTIONAL SOURCE · ORIGINAL TEXT" onClose={onClose} wide>
      <div className="modal-body document-body"><div className="document-metadata"><span>{resource?.label}</span><span>{isAvailable ? 'Available to the current preview' : 'Not selected in the current configuration'}</span></div><p className="document-summary">{document.summary}</p><pre className="source-content">{document.content}</pre></div>
      <div className="modal-footer"><p className="fine-print">Example content, not guidance for a real case.</p><button className="button secondary" type="button" onClick={onClose}>Close source</button></div>
    </Modal>
  )
}
