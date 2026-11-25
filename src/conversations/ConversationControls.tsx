import { ArrowRightRegular, Chat20Regular } from '@fluentui/react-icons'
import type { GuidedConversation } from './useGuidedConversation.ts'
import type { ConversationDefinition } from './schema.ts'
import './conversations.css'

export function GuidedConversationToggle({ guided, onChange, className }: {
  guided: GuidedConversation
  onChange: () => void
  className?: string
}) {
  if (!guided.available) return null
  return <button type="button" className={className} role="switch" aria-checked={guided.enabled}
    title="Use a guided conversation in this chat" onClick={onChange}>
    <Chat20Regular aria-hidden="true" />Guided conversations
  </button>
}

export function ConversationControls({ guided, onStart }: {
  guided: GuidedConversation
  onStart: (definition: ConversationDefinition) => void
}) {
  if (!guided.enabled) return null
  const definition = guided.definition
  const starters = <div className="welcome-suggestions conversation-bubbles" role="group" aria-label="Conversation starters">
    {guided.conversations.map(item => <button type="button" key={item.id} onClick={() => onStart(item)}
      title={`${item.title}. Starts a new guided conversation.`}><span>{item.starter.label}</span><ArrowRightRegular aria-hidden="true" /></button>)}
  </div>
  return <div className="conversation-controls">
    {!guided.run && <p className="conversation-note">Choose an example to start a guided conversation.</p>}
    {guided.run ? <>
      <div className="conversation-heading"><strong>{guided.definition?.title ?? 'Saved conversation'}</strong>
        {definition && <button type="button" onClick={() => onStart(definition)}>Restart conversation</button>}</div>
      <details><summary>Conversation starters</summary>{starters}</details>
    </> : starters}
    <details className="conversation-options">
      <summary>Conversation options</summary>
      <p className="conversation-note">Fictional scripts only; no real actions or learning milestones are completed. Turn off guided mode to return to your regular chat.</p>
      <details className="conversation-variants">
      <summary>Message variants</summary>
      <p className="conversation-note">Variants stay fixed for a run. Changes below apply on start or restart.</p>
      {guided.conversations.flatMap(item => item.steps.flatMap(step => step.role === 'assistant' && step.variants ? [
        <label key={`${item.id}:${step.id}`}>{item.title} / {step.id}
          <select value={guided.overrides[item.id]?.[step.id] ?? ''}
            onChange={event => guided.setVariant(item.id, step.id, event.target.value)}>
            <option value="">Automatic (stable per run)</option>
            {step.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.id}: {variant.text}</option>)}
          </select>
        </label>,
      ] : []))}
      </details>
    </details>
    {guided.warning && <p role="alert" className="conversation-notice">{guided.warning}</p>}
    {guided.stale && <p role="alert" className="conversation-notice">Configuration changed. Restart before continuing; previous messages have not been recalculated.</p>}
  </div>
}

export function ConversationReplies({ guided, onSelect }: {
  guided: GuidedConversation
  onSelect: (text: string) => void
}) {
  if (!guided.enabled) return null
  return <div className="conversation-replies">
    {guided.notice && <p role="alert" className="conversation-notice">{guided.notice}</p>}
    {guided.run?.currentStepId === null && <p role="status" className="conversation-note">Conversation ended. Restart or choose another starter. This is not an evaluation result.</p>}
    {!!guided.suggestions.length && <div className="welcome-suggestions conversation-bubbles" role="group" aria-label="Suggested replies">
      {guided.suggestions.map(value => <button type="button" key={value} onClick={() => onSelect(value)}><span>{value}</span><ArrowRightRegular aria-hidden="true" /></button>)}
    </div>}
  </div>
}
