import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowRightRegular as ArrowRight, CheckmarkCircleRegular as CheckCircle2, ChevronDownRegular as ChevronDown,
  DocumentTextRegular as FileText, History20Regular as History, InfoRegular as Info,
  AddSquare20Regular, Play20Regular, Stop20Regular, ArrowRepeatAll20Regular,
  SendRegular as Send, ShieldCheckmarkRegular as ShieldCheck, FlowRegular as Workflow,
} from '@fluentui/react-icons'
import type { CompiledRecipe, MessageReaction, Session } from '../domain/types.ts'
import { getConfigurationFingerprint, isToolAvailable } from '../domain/engine.ts'
import { Modal } from './Modal.tsx'
import { CreditEstimate } from './CreditEstimate.tsx'
import { estimateConversation, estimateResponses } from '../domain/credits.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { PopupMenu } from './PopupMenu.tsx'
import { PreviewHistory } from './PreviewHistory.tsx'
import { MessageActions } from './MessageActions.tsx'
import { LabResultDetails, ReviewableDraft } from './InteractiveLab.tsx'
import { defaultLabInputs, inputsEqual } from '../domain/lab.ts'

export interface HandoffOffer { messageId: string; toolId: string; summary: string }

export function TestPanel({ active, recipe, session, sendMessage, clearChat, onDocument, onCitation, onHandoff, onReact }: {
  active: boolean
  recipe: CompiledRecipe
  session: Session
  sendMessage: (text: string) => void
  clearChat: () => void
  onDocument: (documentId: string) => void
  onHandoff: (offer: HandoffOffer) => void
  onReact: (messageId: string, value: MessageReaction) => void
  onCitation: (documentId: string) => void
}) {
  const [message, setMessage] = useState('')
  const [debug, setDebug] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showTriggers, setShowTriggers] = useState(false)
  const [welcomeReaction, setWelcomeReaction] = useState<MessageReaction>()
  const triggerButton = useRef<HTMLButtonElement>(null)
  const triggerMenuId = useId()
  const fingerprint = getConfigurationFingerprint(session)
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(() => session.messages.at(-1)?.response?.lab?.fingerprint ?? (session.messages.length > 0 ? null : fingerprint))
  const historyIsStale = session.messages.length > 0 && testedFingerprint !== fingerprint
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const latestMessage = session.messages.at(-1)
  const name = session.profile.name.trim() || 'Your agent'
  const welcomeText = `Hello! I’m ${name}. What would you like to try?`
  useEffect(() => { if (active && log.current) log.current.scrollTop = log.current.scrollHeight }, [latestMessage?.id, active])
  function send(text: string) {
    if (!text.trim() || text.length > 2000) return
    sendMessage(text.trim())
    setTestedFingerprint(fingerprint)
    setMessage('')
    input.current?.focus()
  }
  if (showHistory) return <PreviewHistory active={active} session={session} onBack={() => setShowHistory(false)} />
  return (
    <section className="preview-page" hidden={!active} aria-label="Agent preview">
      <header className="preview-toolbar">
        <h1>{name}</h1>
        <div className="preview-toolbar-actions">
          <CreditEstimate estimate={estimateConversation(session.messages)} scope="Conversation responses" basisNote="Only retained conversation responses are included, not a lifetime total. New chat starts a new estimate. Editing settings does not reclassify previously recorded responses." />
          <button type="button" className="button quiet small" onClick={() => { clearChat(); setWelcomeReaction(undefined); setTestedFingerprint(fingerprint); setMessage(''); input.current?.focus() }}><AddSquare20Regular aria-hidden="true" />New chat</button>
          <button type="button" className="button quiet small" onClick={() => setShowHistory(true)}><History aria-hidden="true" />History</button>
          <button ref={triggerButton} className="icon-button" type="button" aria-label="Triggers" title="Triggers" aria-haspopup="menu" aria-expanded={showTriggers} aria-controls={triggerMenuId} onClick={() => setShowTriggers(!showTriggers)}><Play20Regular aria-hidden="true" /></button>
          <label className="switch-label"><span>Debug mode</span><input type="checkbox" role="switch" checked={debug} onChange={event => setDebug(event.target.checked)} /><span className="switch-track" aria-hidden="true" /></label>
        </div>
      </header>
      <PopupMenu id={triggerMenuId} label="Trigger monitoring" open={showTriggers} anchorRef={triggerButton} onClose={() => setShowTriggers(false)}>
        <button role="menuitem" type="button" disabled title="Triggers are not simulated in this recipe."><Play20Regular aria-hidden="true" />Start monitoring</button>
        <button role="menuitem" type="button" disabled><Stop20Regular aria-hidden="true" />Stop monitoring</button>
        <button role="menuitem" type="button" disabled><ArrowRepeatAll20Regular aria-hidden="true" />Replay last event</button>
      </PopupMenu>
      {historyIsStale && <div className="history-notice" role="status"><Info fontSize={16} aria-hidden="true" /><p>Earlier messages may reflect a previous configuration. Send a new question to test the current settings. Previous responses are not recalculated.</p></div>}
      <div className="preview-log" ref={log} role="log" aria-label="Preview conversation" aria-live="polite" aria-relevant="additions text">
        {session.messages.length === 0 && <div className="preview-welcome"><div className="message-author"><span className="tiny-agent"><AgentIconGraphic icon={session.agentIcon} size={15} /></span><strong>{name}</strong></div><p>{welcomeText}</p><MessageActions key={welcomeText} text={welcomeText} reaction={welcomeReaction} onReact={value => setWelcomeReaction(previous => previous === value ? undefined : value)} /><p className="welcome-hint">Choose an example or ask a question.</p><div className="welcome-suggestions">{recipe.test.suggestedQuestions.map(question => <button key={question} type="button" onClick={() => send(question)}>{question}<ArrowRight fontSize={14} aria-hidden="true" /></button>)}</div></div>}
        {session.messages.map((item, index) => {
          const response = item.response
          const toolId = response?.toolId
          const isLatest = item.id === latestMessage?.id
          const currentInputs = !response?.lab || (!!recipe.lab && response.lab.fingerprint === fingerprint && inputsEqual(recipe.lab, response.lab.inputs, session.labInputs ?? defaultLabInputs(recipe.lab)))
          const canHandoff = !!toolId && isLatest && currentInputs && isToolAvailable(recipe, session, toolId)
          return <article key={item.id} className={`chat-message ${item.role}`}>
            <div className="message-author">{item.role === 'user' ? <strong>You</strong> : <><span className="tiny-agent"><AgentIconGraphic icon={session.agentIcon} size={15} /></span><strong>{name}</strong></>}</div>
            <div className="message-body"><p>{response?.text ?? item.text}</p>
              {!!response?.citations.length && <div className="citations"><span>Sources</span>{response.citations.map((citation, citationIndex) => <button key={`${citation.documentId}-${citationIndex}`} type="button" className="citation" onClick={() => response.lab ? onCitation(citation.documentId) : onDocument(citation.documentId)} disabled={!recipe.knowledge.some(document => document.id === citation.documentId)} title={citation.excerpt}><FileText fontSize={13} aria-hidden="true" /><span>{citationIndex + 1}. {citation.title}</span></button>)}</div>}
              {response?.lab && <LabResultDetails response={response} />}
              {response?.draft && <ReviewableDraft response={response} onReview={canHandoff && toolId ? summary => onHandoff({ messageId: item.id, toolId, summary }) : undefined} />}
              {response?.kind === 'handoff-ready' && toolId && <div className="message-handoff"><button className="button secondary small" type="button" disabled={!canHandoff} onClick={() => onHandoff({ messageId: item.id, toolId, summary: response.draft?.body ?? (recipe.facts.some(fact => fact.toolId === toolId) ? response.text.slice(0, 2000) : session.messages[index - 1]?.role === 'user' ? session.messages[index - 1].text.slice(0, 2000) : '') })}>Create simulated request <ArrowRight fontSize={14} aria-hidden="true" /></button><span className="field-hint">{!isLatest ? 'This earlier offer is closed. Run or ask again to start another request.' : !currentInputs ? 'Inputs or configuration changed. Run the example again before confirming.' : !canHandoff ? 'The tool is unavailable. Check its connection, enabled state and required knowledge.' : 'You review and confirm before a local record is created.'}</span></div>}
            </div>
            {item.role === 'assistant' && <MessageActions text={response?.text ?? item.text} reaction={item.reaction} onReact={value => onReact(item.id, value)} />}
            {item.role === 'assistant' && response && <CreditEstimate estimate={estimateResponses([response])} scope="This response" />}
            {debug && !!response?.trace.length && <details className="trace"><summary><Workflow fontSize={14} aria-hidden="true" />How this response was produced<ChevronDown fontSize={13} aria-hidden="true" /></summary><ol>{response.trace.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol><p>A record of executed rules, not an AI’s chain of thought.</p></details>}
          </article>
        })}
      </div>
      <div className="preview-composer-area">
        {session.messages.length > 0 && !!recipe.test.suggestedQuestions.length && <details className="question-menu"><summary>Example questions <ChevronDown fontSize={14} aria-hidden="true" /></summary><div className="welcome-suggestions">{recipe.test.suggestedQuestions.map(question => <button type="button" key={question} onClick={() => send(question)}>{question}<ArrowRight fontSize={13} aria-hidden="true" /></button>)}</div></details>}
        <form className="chat-form" onSubmit={event => { event.preventDefault(); send(message) }}>
          <label htmlFor="test-message" className="sr-only">Preview message</label>
          <div className="chat-composer"><textarea id="test-message" ref={input} placeholder={`Message ${name}`} value={message} maxLength={2000} rows={1} onChange={event => setMessage(event.target.value)} aria-describedby="chat-input-help" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(message) } }} /><button type="submit" className="send-button" disabled={!message.trim()} aria-label="Send message" title="Send message"><Send fontSize={18} aria-hidden="true" /></button></div>
          <div className="composer-help" id="chat-input-help"><span>Enter to send · Shift + Enter for a new line</span><span>{message.length}/2000</span></div>
        </form>
        <p className="preview-disclaimer">Use fictional information only. Do not enter personal data.</p>
      </div>
    </section>
  )
}

export function HandoffDialog({ offer, recipe, session, onClose, onConfirm }: {
  offer: HandoffOffer
  recipe: CompiledRecipe
  session: Session
  onClose: () => void
  onConfirm: (toolId: string, summary: string) => boolean
}) {
  const [summary, setSummary] = useState(offer.summary)
  const [confirming, setConfirming] = useState(false)
  const tool = recipe.tools.find(item => item.id === offer.toolId)
  const response = session.messages.at(-1)?.response
  const currentInputs = !response?.lab || (!!recipe.lab && response.lab.fingerprint === getConfigurationFingerprint(session) && inputsEqual(recipe.lab, response.lab.inputs, session.labInputs ?? defaultLabInputs(recipe.lab)))
  const available = !!tool && currentInputs && isToolAvailable(recipe, session, tool.id) && session.messages.at(-1)?.id === offer.messageId
  const connection = recipe.connections.find(item => item.id === tool?.connectionId)
  const resource = connection?.resources.find(item => item.id === tool?.resourceId)
  return (
    <Modal title="Review simulated request" eyebrow="CONFIRM BEFORE CONTINUING" onClose={onClose}>
      <div className="modal-body"><div className="callout accent"><ShieldCheck fontSize={20} aria-hidden="true" /><p>Nothing will be sent. This record stays in this browser. Use fictional information only, without names, personal documents, or private data.</p></div><dl className="review-list"><div><dt>Tool</dt><dd>{tool?.title ?? 'Tool unavailable'}</dd></div><div><dt>Fictional destination</dt><dd>{resource?.label ?? 'Unavailable'}</dd></div></dl><div className="field"><div className="field-label"><label htmlFor="handoff-summary">Request summary</label><span>{summary.length}/6000</span></div><textarea id="handoff-summary" rows={8} value={summary} onChange={event => setSummary(event.target.value)} maxLength={6000} placeholder="Describe a fictional situation to hand off." /></div>{!available && <p className="error-notice" role="alert">This offer is no longer available. Review the tool and run the example again.</p>}</div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="button" disabled={!available || !summary.trim() || confirming} onClick={() => { if (!available || !summary.trim() || confirming) return; setConfirming(true); if (!onConfirm(offer.toolId, summary.trim())) setConfirming(false) }}><CheckCircle2 fontSize={16} aria-hidden="true" />Confirm simulated request</button></div>
    </Modal>
  )
}
