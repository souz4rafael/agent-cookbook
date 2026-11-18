import { useEffect, useRef, useState } from 'react'
import { chatAgents, getChatAgent } from './agents.ts'
import { conversationTitle, decodeHistory, encodeHistory, historyKey, maxConversations, maxMessages, simulatedProvider } from './framework.ts'
import type { ChatProvider, Conversation, ResponseStyle } from './framework.ts'

function readHistory(): { conversations: Conversation[]; warning: string | null } {
  try {
    return { conversations: decodeHistory(window.localStorage.getItem(historyKey), chatAgents), warning: null }
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError ||
      (error instanceof DOMException && error.name === 'SecurityError'))) throw error
    return { conversations: [], warning: `Saved history could not be loaded: ${error.message} New chats will only be saved after you reset history in Settings.` }
  }
}

export function useChat(provider: ChatProvider = simulatedProvider) {
  const [loaded] = useState(readHistory)
  const [conversations, setConversations] = useState(loaded.conversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState('copilot')
  const [temporary, setTemporary] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(loaded.warning)
  const [storageEnabled, setStorageEnabled] = useState(!loaded.warning)
  const [useSources, setUseSources] = useState(true)
  const [style, setStyle] = useState<ResponseStyle>('Auto')
  const request = useRef<AbortController | null>(null)
  const conversation = conversations.find(chat => chat.id === activeId)
  const agent = getChatAgent(conversation?.agentId ?? agentId)

  useEffect(() => {
    if (!storageEnabled) return
    try {
      window.localStorage.setItem(historyKey, encodeHistory(conversations))
      // oxlint-disable-next-line react/set-state-in-effect -- Surface the result of synchronizing with browser storage.
      setStorageWarning(null)
    } catch (error) {
      if (!(error instanceof RangeError || (error instanceof DOMException &&
        ['QuotaExceededError', 'SecurityError'].includes(error.name)))) throw error
      setStorageWarning(`Chats are available in this tab but could not be saved: ${error.message}`)
    }
  }, [conversations, storageEnabled])

  useEffect(() => () => request.current?.abort(), [])

  function cancel() {
    request.current?.abort()
    request.current = null
    setPending(false)
  }

  function newChat(nextAgentId = 'copilot', isTemporary = false) {
    getChatAgent(nextAgentId)
    cancel()
    setConversations(current => current.filter(chat => !chat.temporary))
    setActiveId(null)
    setAgentId(nextAgentId)
    setTemporary(isTemporary)
    setNotice(null)
  }

  function openChat(id: string) {
    const saved = conversations.find(chat => chat.id === id)
    if (!saved) throw new Error('The selected conversation no longer exists.')
    cancel()
    setConversations(current => current.filter(chat => !chat.temporary || chat.id === id))
    setActiveId(id)
    setAgentId(saved.agentId)
    setTemporary(saved.temporary)
    setNotice(null)
  }

  async function respond(next: Conversation) {
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setNotice(null)
    try {
      const reply = await provider.respond({ agent: getChatAgent(next.agentId), messages: next.messages, useSources, style }, controller.signal)
      if (controller.signal.aborted || request.current !== controller) return
      setConversations(current => current.map(chat => chat.id === next.id ? {
        ...chat, updatedAt: new Date().toISOString(),
        messages: [...chat.messages, { id: crypto.randomUUID(), role: 'assistant', text: reply.text, reply }],
      } : chat))
    } catch (error) {
      if (!controller.signal.aborted) {
        setNotice(`The response could not be completed. ${error instanceof Error ? error.message : 'The provider returned an unknown error.'} You can retry below.`)
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }

  function send(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > 4000) {
      setNotice('Enter a message between 1 and 4,000 characters.')
      return false
    }
    if (request.current) {
      setNotice('Wait for this response or stop it before sending another message.')
      return false
    }
    if (conversation && conversation.messages.length > maxMessages - 2) {
      setNotice('This conversation has reached its limit. Start a new chat to continue.')
      return false
    }
    if (!conversation && !temporary && conversations.filter(chat => !chat.temporary).length >= maxConversations) {
      setNotice('Local history is full. Delete a conversation from Search before starting another.')
      return false
    }
    const next: Conversation = {
      id: conversation?.id ?? crypto.randomUUID(),
      agentId: agent.id,
      title: conversation?.title ?? conversationTitle(trimmed),
      updatedAt: new Date().toISOString(),
      temporary,
      messages: [...(conversation?.messages ?? []), { id: crypto.randomUUID(), role: 'user', text: trimmed }],
    }
    setConversations(current => [next, ...current.filter(chat => chat.id !== next.id)])
    setActiveId(next.id)
    void respond(next)
    return true
  }

  function retry() {
    if (!conversation || request.current) return
    const lastUser = conversation.messages.findLastIndex(message => message.role === 'user')
    if (lastUser < 0) throw new Error('No message is available to retry.')
    const next = { ...conversation, messages: conversation.messages.slice(0, lastUser + 1) }
    setConversations(current => current.map(chat => chat.id === next.id ? next : chat))
    void respond(next)
  }

  function react(messageId: string, reaction: 'like' | 'dislike') {
    setConversations(current => current.map(chat => chat.id !== activeId ? chat : {
      ...chat, messages: chat.messages.map(message => message.id !== messageId || message.role !== 'assistant' ? message : {
        ...message, reaction: message.reaction === reaction ? undefined : reaction,
      }),
    }))
  }

  function deleteChat(id: string) {
    if (activeId === id) newChat()
    setConversations(current => current.filter(chat => chat.id !== id))
  }

  function resetHistory() {
    newChat()
    setConversations([])
    setStorageEnabled(true)
    setStorageWarning(null)
  }

  return {
    conversations, conversation, agent, temporary, pending, notice, storageWarning, useSources, style,
    setNotice, setUseSources, setStyle, newChat, openChat, send, retry, react, deleteChat, resetHistory,
    stop: () => { cancel(); setNotice('Response stopped. You can retry the last message.'); },
  }
}
