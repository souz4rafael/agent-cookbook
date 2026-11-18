import { useEffect, useRef, useState } from 'react'
import { ArrowClockwise20Regular, ChatAdd20Regular, Send20Regular, Stop20Filled } from '@fluentui/react-icons'
import { simulatedProvider } from '../framework.ts'
import type { ChatMessage } from '../framework.ts'
import type { BuilderRecipe } from './schema.ts'
import type { BuilderDraft } from './state.ts'
import { toPreviewAgent } from './state.ts'
import { BuilderIcon } from './BuilderIcon.tsx'

export function BuilderPreview({ recipe, draft }: { recipe: BuilderRecipe; draft: BuilderDraft }) {
  const agent = toPreviewAgent(recipe, draft)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length, pending])

  function stop() {
    request.current?.abort()
    request.current = null
    setPending(false)
  }

  async function send(prompt = text) {
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
    <div className="cb-preview-toolbar"><button className="cb-button" onClick={() => { stop(); setMessages([]); setError(''); input.current?.focus() }}><ChatAdd20Regular />New chat</button></div>
    <div className={`cb-preview-conversation${messages.length ? ' cb-preview-has-messages' : ''}`} role="region" aria-label="Agent preview conversation">
      {!messages.length ? <div className="cb-preview-intro"><BuilderIcon icon={draft.icon} name={agent.name} /><h2>{agent.name}</h2><p>{agent.description}</p></div>
        : messages.map(message => <article key={message.id} className={message.role === 'user' ? 'cp-user-message' : 'cp-assistant-message'} aria-label={message.role === 'user' ? 'Your preview message' : 'Agent preview response'}>
          <p>{message.text}</p>
          {message.reply?.sections.map((section, index) => <section key={index}><h3>{section.title}</h3><ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>)}
          {!!message.reply?.sources.length && <small className="cb-preview-sources">Sample sources: {message.reply.sources.join(', ')}</small>}
        </article>)}
      {pending && <p role="status">Preparing a sample response...</p>}
      {error && <p role="alert" className="cb-error">{error}</p>}
      <div ref={end} />
    </div>
    <div className="cb-preview-input">
      {!!agent.starters.length && <div className="cb-preview-starters">{agent.starters.map((starter, index) => <button key={index} disabled={pending} onClick={() => void send(starter.prompt)}>{starter.label}</button>)}</div>}
      <form onSubmit={event => { event.preventDefault(); void send() }}>
        <textarea ref={input} aria-label="Message input box" placeholder="Type your message" rows={2} maxLength={4000} value={text} onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
        <div><span className="cp-toolbar-spacer" />{pending
          ? <button className="cp-icon-button" type="button" aria-label="Stop preview response" onClick={stop}><Stop20Filled /></button>
          : <button className="cp-icon-button" aria-label="Send" disabled={!text.trim()}><Send20Regular /></button>}</div>
      </form>
      <p className="cb-preview-disclaimer"><ArrowClockwise20Regular />Scripted preview. Configuration changes start a new test.</p>
    </div>
  </section>
}
