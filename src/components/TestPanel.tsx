import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowRightRegular as ArrowRight, CheckmarkCircleRegular as CheckCircle2, ChevronDownRegular as ChevronDown,
  DocumentTextRegular as FileText, History20Regular as History, InfoRegular as Info,
  AddSquare20Regular, Play20Regular, Stop20Regular, ArrowRepeatAll20Regular,
  SendRegular as Send, ShieldCheckmarkRegular as ShieldCheck, FlowRegular as Workflow,
} from '@fluentui/react-icons'
import type { ChatMessage, CompiledRecipe, GuideCondition, MessageReaction, Session, TestResponse } from '../domain/types.ts'
import { getAvailableKnowledge, getConfigurationFingerprint, isToolAvailable } from '../domain/engine.ts'
import { Modal } from './Modal.tsx'
import { CreditEstimate } from './CreditEstimate.tsx'
import { estimateConversation, estimateResponses } from '../domain/credits.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { PopupMenu } from './PopupMenu.tsx'
import { PreviewHistory } from './PreviewHistory.tsx'
import { MessageActions } from './MessageActions.tsx'
import { LabResultDetails, ReviewableDraft } from './InteractiveLab.tsx'
import { defaultLabInputs, inputsEqual } from '../domain/lab.ts'
import { ConversationControls, ConversationReplies, GuidedConversationToggle } from '../conversations/ConversationControls.tsx'
import { useGuidedConversation } from '../conversations/useGuidedConversation.ts'
import { simulateStudioConversation } from '../domain/conversations.ts'
import { useReviewCue } from './reviewCue.ts'

export interface HandoffOffer { messageId: string; toolId: string; summary: string }

function hasCurrentInputs(response: TestResponse | undefined, recipe: CompiledRecipe, session: Session, fingerprint: string) {
  return !response?.lab || (!!recipe.lab && response.lab.fingerprint === fingerprint
    && inputsEqual(recipe.lab, response.lab.inputs, session.labInputs ?? defaultLabInputs(recipe.lab)))
}

function matchesAction(cue: GuideCondition | null, response?: TestResponse) {
  return cue?.type === 'action-confirmed' && response?.kind === 'handoff-ready'
    && response.toolId === cue.toolId && response.lab?.outcomeId === cue.outcomeId
}

export function TestPanel({ active, recipe, session, sendMessage, clearChat, onDocument, onCitation, onHandoff, onReact, onGuidedExample }: {
  active: boolean
  recipe: CompiledRecipe
  session: Session
  sendMessage: (text: string) => void
  clearChat: () => void
  onDocument: (documentId: string) => void
  onHandoff: (offer: HandoffOffer) => void
  onReact: (messageId: string, value: MessageReaction) => void
  onCitation: (documentId: string) => void
  onGuidedExample?: (caseId: string) => void
}) {
  const [message, setMessage] = useState('')
  const [debug, setDebug] = useState(true)
  const [showHistory, setShowHistory] = useState(false)
  const [showTriggers, setShowTriggers] = useState(false)
  const [welcomeReaction, setWelcomeReaction] = useState<MessageReaction>()
  const triggerButton = useRef<HTMLButtonElement>(null)
  const triggerMenuId = useId()
  const fingerprint = getConfigurationFingerprint(session)
  const reviewCue = useReviewCue()
  const previewCue = active && (reviewCue?.type === 'event' || reviewCue?.type === 'citation-opened' || reviewCue?.type === 'action-confirmed') ? reviewCue : null
  const guided = useGuidedConversation({
    conversations: recipe.conversations ?? [], scope: `studio:${recipe.id}`, configuration: fingerprint,
    simulate: prompt => simulateStudioConversation(recipe, session, prompt),
  })
  // A Review jump returns to ordinary Preview without restarting the separate scripted conversation.
  const cueKey = previewCue && JSON.stringify(previewCue)
  const [lastCueKey, setLastCueKey] = useState(cueKey)
  if (lastCueKey !== cueKey) {
    setLastCueKey(cueKey)
    if (previewCue && showHistory) setShowHistory(false)
    if (previewCue && guided.enabled) { guided.setEnabled(false); setMessage('') }
  }
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(() => session.messages.at(-1)?.response?.lab?.fingerprint ?? (session.messages.length > 0 ? null : fingerprint))
  const historyIsStale = session.messages.length > 0 && testedFingerprint !== fingerprint
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const messages: ChatMessage[] = guided.enabled ? guided.messages : session.messages
  const latestMessage = messages.at(-1)
  const latestResponse = latestMessage?.response
  const currentInputs = hasCurrentInputs(latestResponse, recipe, session, fingerprint)
  const latestCanHandoff = !!latestResponse?.toolId && currentInputs && isToolAvailable(recipe, session, latestResponse.toolId)
  const cue = !guided.enabled && !showHistory ? previewCue : null
  const citationTarget = cue?.type === 'citation-opened' && getAvailableKnowledge(recipe, session).some(doc => doc.id === cue.documentId)
    ? messages.findLast(item => item.response?.lab?.fingerprint === fingerprint && item.response.citations.some(citation => citation.documentId === cue.documentId))
    : undefined
  const actionTarget = latestCanHandoff && matchesAction(cue, latestResponse)
  const example = onGuidedExample && !citationTarget && !actionTarget && (cue?.type === 'citation-opened' || cue?.type === 'action-confirmed')
    ? recipe.lab?.cases.find(item => !item.disabledKnowledge?.length && !item.disabledTools?.length
      && (cue.type === 'citation-opened' ? item.expected.documentIds.includes(cue.documentId)
        : item.expected.kind === 'handoff-ready' && item.expected.toolId === cue.toolId && item.expected.outcomeId === cue.outcomeId))
    : undefined
  const name = session.profile.name.trim() || 'Your agent'
  const welcomeText = `Hello! I’m ${name}. What would you like to try?`
  useEffect(() => { if (active && log.current) log.current.scrollTop = log.current.scrollHeight }, [latestMessage?.id, active, guided.enabled])
  function send(text: string) {
    if (guided.enabled) {
      if (guided.send(text)) setMessage('')
      input.current?.focus()
      return
    }
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
          <GuidedConversationToggle guided={guided} className="button quiet small"
            onChange={() => { guided.setEnabled(!guided.enabled); setMessage(''); setShowHistory(false) }} />
          {!guided.enabled && <CreditEstimate estimate={estimateConversation(session.messages)} scope="Conversation responses" basisNote="Only retained conversation responses are included, not a lifetime total. New chat starts a new estimate. Editing settings does not reclassify previously recorded responses." />}
          <button type="button" className="button quiet small" onClick={() => { if (guided.enabled) guided.reset(); else clearChat(); setWelcomeReaction(undefined); setTestedFingerprint(fingerprint); setMessage(''); input.current?.focus() }}><AddSquare20Regular aria-hidden="true" />New chat</button>
          {!guided.enabled && <button type="button" className="button quiet small" onClick={() => setShowHistory(true)}><History aria-hidden="true" />History</button>}
          <button ref={triggerButton} className="icon-button" type="button" aria-label="Triggers" title="Triggers" aria-haspopup="menu" aria-expanded={showTriggers} aria-controls={triggerMenuId} onClick={() => setShowTriggers(!showTriggers)}><Play20Regular aria-hidden="true" /></button>
          <label className="switch-label"><span>Debug mode</span><input type="checkbox" role="switch" checked={debug} onChange={event => setDebug(event.target.checked)} /><span className="switch-track" aria-hidden="true" /></label>
        </div>
      </header>
      <PopupMenu id={triggerMenuId} label="Trigger monitoring" open={showTriggers} anchorRef={triggerButton} onClose={() => setShowTriggers(false)}>
        <button role="menuitem" type="button" disabled title="Triggers are not simulated in this recipe."><Play20Regular aria-hidden="true" />Start monitoring</button>
        <button role="menuitem" type="button" disabled><Stop20Regular aria-hidden="true" />Stop monitoring</button>
        <button role="menuitem" type="button" disabled><ArrowRepeatAll20Regular aria-hidden="true" />Replay last event</button>
      </PopupMenu>
      {!guided.enabled && historyIsStale && <div className="history-notice" role="status"><Info fontSize={16} aria-hidden="true" /><p>Earlier messages may reflect a previous configuration. Send a new question to test the current settings. Previous responses are not recalculated.</p></div>}
      <div className="preview-log" ref={log} role="log" aria-label="Preview conversation" aria-live="polite" aria-relevant="additions text">
        <ConversationControls guided={guided} onStart={definition => {
          if (guided.start(definition)) setMessage('')
          requestAnimationFrame(() => input.current?.focus())
        }} />
        {!guided.enabled && messages.length === 0 && <div className="preview-welcome"><div className="message-author"><span className="tiny-agent"><AgentIconGraphic icon={session.agentIcon} size={15} /></span><strong>{name}</strong></div><p>{welcomeText}</p><MessageActions key={welcomeText} text={welcomeText} reaction={welcomeReaction} onReact={value => setWelcomeReaction(previous => previous === value ? undefined : value)} /><p className="welcome-hint">Choose an example or ask a question.</p><div className="welcome-suggestions">{recipe.test.suggestedQuestions.map(question => <button key={question} type="button" onClick={() => send(question)}>{question}<ArrowRight fontSize={14} aria-hidden="true" /></button>)}</div></div>}
        {messages.map((item, index) => {
          const response = item.response
          const guidedMessage = guided.enabled ? guided.messages[index] : undefined
          const trace = guidedMessage?.trace ?? response?.trace ?? []
          const toolId = response?.toolId
          const isLatest = item.id === latestMessage?.id
          const canHandoff = isLatest && latestCanHandoff
          return <article key={item.id} className={`chat-message ${item.role}`}>
            <div className="message-author">{item.role === 'user' ? <strong>You</strong> : <><span className="tiny-agent"><AgentIconGraphic icon={session.agentIcon} size={15} /></span><strong>{name}</strong></>}</div>
            <div className="message-body"><p>{response?.text ?? item.text}</p>
              {!!guidedMessage?.reply?.sources.length && <p className="conversation-note">Sources: {guidedMessage.reply.sources.join(' | ')}</p>}
              {!!response?.citations.length && <div className="citations"><span>Sources</span>{response.citations.map((citation, citationIndex) => <button key={`${citation.documentId}-${citationIndex}`} type="button" className="citation"
                data-review-cue={(item === citationTarget && cue?.type === 'citation-opened' && citation.documentId === cue.documentId) || undefined}
                onClick={() => response.lab ? onCitation(citation.documentId) : onDocument(citation.documentId)} disabled={!recipe.knowledge.some(document => document.id === citation.documentId)} title={citation.excerpt}><FileText fontSize={13} aria-hidden="true" /><span>{citationIndex + 1}. {citation.title}</span></button>)}</div>}
              {response?.lab && <LabResultDetails response={response} />}
              {response?.draft && <ReviewableDraft response={response} onReview={canHandoff && toolId ? summary => onHandoff({ messageId: item.id, toolId, summary }) : undefined} />}
              {response?.kind === 'handoff-ready' && toolId && <div className="message-handoff"><button className="button secondary small" type="button" disabled={!canHandoff}
                data-review-cue={(isLatest && actionTarget) || undefined}
                onClick={() => onHandoff({ messageId: item.id, toolId, summary: response.draft?.body ?? (recipe.facts.some(fact => fact.toolId === toolId) ? response.text.slice(0, 2000) : session.messages[index - 1]?.role === 'user' ? session.messages[index - 1].text.slice(0, 2000) : '') })}>Create simulated request <ArrowRight fontSize={14} aria-hidden="true" /></button><span className="field-hint">{!isLatest ? 'This earlier offer is closed. Run or ask again to start another request.' : !currentInputs ? 'Inputs or configuration changed. Run the example again before confirming.' : !canHandoff ? 'The tool is unavailable. Check its connection, enabled state and required knowledge.' : 'You review and confirm before a local record is created.'}</span></div>}
            </div>
            {item.role === 'assistant' && <MessageActions text={response?.text ?? item.text} reaction={item.reaction} onReact={guided.enabled ? undefined : value => onReact(item.id, value)} />}
            {item.role === 'assistant' && response && <CreditEstimate estimate={estimateResponses([response])} scope="This response" />}
            {debug && !!trace.length && <details className="trace"><summary><Workflow fontSize={14} aria-hidden="true" />How this response was produced<ChevronDown fontSize={13} aria-hidden="true" /></summary><ol>{trace.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol><p>A record of executed rules, not an AI’s chain of thought.</p></details>}
          </article>
        })}
        <ConversationReplies guided={guided} onSelect={text => { setMessage(text); input.current?.focus() }} />
      </div>
      <div className="preview-composer-area">
        {example && onGuidedExample && <button className="button secondary small" type="button" data-review-cue={true}
          onClick={() => onGuidedExample(example.id)}>Prepare example: {example.title}</button>}
        {!guided.enabled && session.messages.length > 0 && !!recipe.test.suggestedQuestions.length && <details className="question-menu"><summary>Example questions <ChevronDown fontSize={14} aria-hidden="true" /></summary><div className="welcome-suggestions">{recipe.test.suggestedQuestions.map(question => <button type="button" key={question} onClick={() => send(question)}>{question}<ArrowRight fontSize={13} aria-hidden="true" /></button>)}</div></details>}
        <form className="chat-form" onSubmit={event => { event.preventDefault(); send(message) }}>
          <label htmlFor="test-message" className="sr-only">Preview message</label>
          <div className="chat-composer"><textarea id="test-message" ref={input} data-review-cue={cue?.type === 'event' || undefined} placeholder={`Message ${name}`} value={message} maxLength={guided.enabled ? 1000 : 2000} disabled={guided.enabled && !guided.canSend} rows={1} onChange={event => setMessage(event.target.value)} aria-describedby="chat-input-help" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(message) } }} /><button type="submit" className="send-button" disabled={!message.trim() || (guided.enabled && !guided.canSend)} aria-label="Send message" title="Send message"><Send fontSize={18} aria-hidden="true" /></button></div>
          <div className="composer-help" id="chat-input-help"><span>Enter to send · Shift + Enter for a new line</span><span>{message.length}/{guided.enabled ? 1000 : 2000}</span></div>
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
  const cue = useReviewCue()
  const tool = recipe.tools.find(item => item.id === offer.toolId)
  const response = session.messages.at(-1)?.response
  const currentInputs = hasCurrentInputs(response, recipe, session, getConfigurationFingerprint(session))
  const available = !!tool && currentInputs && isToolAvailable(recipe, session, tool.id) && session.messages.at(-1)?.id === offer.messageId
  const actionTarget = available && response?.toolId === offer.toolId && matchesAction(cue, response) && !confirming
  const canConfirm = available && !!summary.trim() && !confirming
  const connection = recipe.connections.find(item => item.id === tool?.connectionId)
  const resource = connection?.resources.find(item => item.id === tool?.resourceId)
  return (
    <Modal title="Review simulated request" eyebrow="CONFIRM BEFORE CONTINUING" onClose={onClose}>
      <div className="modal-body"><div className="callout accent"><ShieldCheck fontSize={20} aria-hidden="true" /><p>Nothing will be sent. This record stays in this browser. Use fictional information only, without names, personal documents, or private data.</p></div><dl className="review-list"><div><dt>Tool</dt><dd>{tool?.title ?? 'Tool unavailable'}</dd></div><div><dt>Fictional destination</dt><dd>{resource?.label ?? 'Unavailable'}</dd></div></dl><div className="field"><div className="field-label"><label htmlFor="handoff-summary">Request summary</label><span>{summary.length}/6000</span></div><textarea id="handoff-summary" rows={8} value={summary} data-review-cue={(actionTarget && !summary.trim()) || undefined} onChange={event => setSummary(event.target.value)} maxLength={6000} placeholder="Describe a fictional situation to hand off." /></div>{!available && <p className="error-notice" role="alert">This offer is no longer available. Review the tool and run the example again.</p>}</div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="button" disabled={!canConfirm} data-review-cue={(actionTarget && canConfirm) || undefined} onClick={() => { if (!canConfirm) return; setConfirming(true); if (!onConfirm(offer.toolId, summary.trim())) setConfirming(false) }}><CheckCircle2 fontSize={16} aria-hidden="true" />Confirm simulated request</button></div>
    </Modal>
  )
}
