import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise20Regular, ChatAdd20Regular, Send20Regular, Stop20Filled } from '@fluentui/react-icons'
import { simulatedProvider } from '../framework.ts'
import type { ChatMessage } from '../framework.ts'
import type { BuilderRecipe } from './schema.ts'
import type { BuilderDraft } from './state.ts'
import { toPreviewAgent } from './state.ts'
import { BuilderIcon } from './BuilderIcon.tsx'
import { ConversationControls, ConversationReplies, GuidedConversationToggle } from '../../conversations/ConversationControls.tsx'
import { useGuidedConversation } from '../../conversations/useGuidedConversation.ts'
import { simulateCopilotConversation } from '../conversations.ts'

export function BuilderPreview({ recipe, draft }: { recipe: BuilderRecipe; draft: BuilderDraft }) {
  const agent = toPreviewAgent(recipe, draft)
  const guided = useGuidedConversation({
    conversations: agent.conversations ?? [], scope: `copilot-builder:${recipe.id}`,
    configuration: JSON.stringify([agent, draft.mode, draft.profile.instructions]),
    simulate: prompt => simulateCopilotConversation(agent, prompt, draft.mode, true),
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const visibleMessages: ChatMessage[] = guided.enabled ? guided.messages : messages
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [visibleMessages.length, pending, guided.enabled])

  function stop() {
    request.current?.abort()
    request.current = null
    setPending(false)
  }

  async function send(prompt = text) {
    if (guided.enabled) { if (guided.send(prompt)) setText(''); return }
    if (!prompt.trim() || request.current) return
    if (messages.length >= 50) { setError('Start a new preview chat to continue.'); return }
    const next: ChatMessage[] = [...messages, { id: crypto.randomUUID(), role: 'user', text: prompt.trim() }]
    const controller = new AbortController()
    request.current = controller
    setMessages(next)
    setText('')
    setPending(true)
    setError('')
    try {
      const reply = await simulatedProvider.respond({ agent, messages: next, useSources: true, style: draft.mode }, controller.signal)
      if (controller.signal.aborted || request.current !== controller) return
      setMessages([...next, { id: crypto.randomUUID(), role: 'assistant', text: reply.text, reply }])
    } catch (failure) {
      if (!controller.signal.aborted) setError(`Preview failed: ${failure instanceof Error ? failure.message : 'Unknown provider error'}`)
    } finally {
      if (request.current === controller) { request.current = null; setPending(false) }
    }
  }

  return <section className="cb-preview" aria-label={`${agent.name} preview`}>
    <div className="cb-preview-toolbar">
      <GuidedConversationToggle guided={guided} className="cb-button" onChange={() => {
        stop(); guided.setEnabled(!guided.enabled); setText(''); setError('')
      }} />
      <button className="cb-button" onClick={() => { stop(); if (guided.enabled) guided.reset(); else setMessages([]); setText(''); setError(''); input.current?.focus() }}><ChatAdd20Regular />New chat</button>
    </div>
    <div className={`cb-preview-conversation${visibleMessages.length || guided.enabled ? ' cb-preview-has-messages' : ''}`} role="region" aria-label="Agent preview conversation">
      <ConversationControls guided={guided} onStart={definition => {
        if (guided.start(definition)) setText('')
        requestAnimationFrame(() => input.current?.focus())
      }} />
      {!visibleMessages.length && !guided.enabled ? <div className="cb-preview-intro"><BuilderIcon icon={draft.icon} name={agent.name} /><h2>{agent.name}</h2><p>{agent.description}</p></div>
        : visibleMessages.map(message => <article key={message.id} className={message.role === 'user' ? 'cp-user-message' : 'cp-assistant-message'} aria-label={message.role === 'user' ? 'Your preview message' : 'Agent preview response'}>
          <p>{message.text}</p>
          {message.reply?.sections.map((section, index) => <section key={index}><h3>{section.title}</h3><ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>)}
          {!!message.reply?.sources.length && <small className="cb-preview-sources">Sample sources: {message.reply.sources.join(', ')}</small>}
        </article>)}
      {pending && <p role="status">Preparing a sample response...</p>}
      {error && <p role="alert" className="cb-error">{error}</p>}
      <ConversationReplies guided={guided} onSelect={value => { setText(value); input.current?.focus() }} />
      <div ref={end} />
    </div>
    <div className="cb-preview-input">
      {!guided.enabled && !!agent.starters.length && <div className="cb-preview-starters">{agent.starters.map((starter, index) => <button key={index} disabled={pending} onClick={() => void send(starter.prompt)}>{starter.label}</button>)}</div>}
      <form onSubmit={event => { event.preventDefault(); void send() }}>
        <textarea ref={input} aria-label="Message input box" placeholder="Type your message" rows={2} maxLength={guided.enabled ? 1000 : 4000} value={text} disabled={guided.enabled && !guided.canSend} onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
        <div><span className="cp-toolbar-spacer" />{pending
          ? <button className="cp-icon-button" type="button" aria-label="Stop preview response" onClick={stop}><Stop20Filled /></button>
          : <button className="cp-icon-button" aria-label="Send" disabled={!text.trim() || (guided.enabled && !guided.canSend)}><Send20Regular /></button>}</div>
      </form>
      <p className="cb-preview-disclaimer"><ArrowClockwise20Regular />Scripted preview. Configuration changes start a new test.</p>
    </div>
  </section>
}
