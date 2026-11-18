import { z } from 'zod'

export interface ReplySection {
  title: string
  items: string[]
}

export interface ChatReply {
  text: string
  sections: ReplySection[]
  sources: string[]
}

export interface AgentDefinition {
  id: string
  name: string
  description: string
  greeting: string
  icon: 'copilot' | 'citizen' | 'meeting' | 'writing' | 'research'
  starters: { label: string; prompt: string }[]
  sources: { title: string; content: string }[]
  rules: { keywords: string[]; text: string; sections: ReplySection[] }[]
  fallback: string
}

export type ResponseStyle = 'Auto' | 'Quick response' | 'Think deeper'

export interface ChatRequest {
  agent: AgentDefinition
  messages: ChatMessage[]
  useSources: boolean
  style: ResponseStyle
}

// The shell depends on this boundary, not on a specific model or transport.
export interface ChatProvider {
  respond(request: ChatRequest, signal: AbortSignal): Promise<ChatReply>
}

const replySchema = z.strictObject({
  text: z.string().max(20_000),
  sections: z.array(z.strictObject({
    title: z.string().max(200),
    items: z.array(z.string().max(4000)).max(20),
  })).max(10),
  sources: z.array(z.string().max(200)).max(10),
})

const messageSchema = z.strictObject({
  id: z.string().min(1).max(100),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(20_000),
  reply: replySchema.optional(),
  reaction: z.enum(['like', 'dislike']).optional(),
}).refine(message => message.role !== 'user' || (
  message.text.length <= 4000 && message.reply === undefined && message.reaction === undefined
)).refine(message => message.reply === undefined || message.text === message.reply.text)

export type ChatMessage = z.infer<typeof messageSchema>

const conversationSchema = z.strictObject({
  id: z.string().min(1).max(100),
  agentId: z.string().min(1).max(100),
  title: z.string().min(1).max(80),
  updatedAt: z.iso.datetime(),
  temporary: z.boolean(),
  messages: z.array(messageSchema).min(1).max(100),
})

export type Conversation = z.infer<typeof conversationSchema>
export const historyKey = 'copilot-agents-cookbook:chats:v1'
export const maxConversations = 40
export const maxMessages = 100

const historySchema = z.strictObject({
  version: z.literal(1),
  conversations: z.array(conversationSchema).max(maxConversations),
})

export function decodeHistory(raw: string | null, agents: readonly AgentDefinition[]): Conversation[] {
  if (raw === null) return []
  if (raw.length > 2_000_000) throw new RangeError('Saved chats exceed the local storage limit.')
  const parsed = historySchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new TypeError('Saved chats have an unsupported or invalid format.')
  const conversations = parsed.data.conversations
  if (conversations.some(chat => chat.temporary || !agents.some(agent => agent.id === chat.agentId)) ||
      new Set(conversations.map(chat => chat.id)).size !== conversations.length ||
      conversations.some(chat => new Set(chat.messages.map(message => message.id)).size !== chat.messages.length)) {
    throw new TypeError('Saved chats contain invalid agent or conversation references.')
  }
  return conversations
}

export function encodeHistory(conversations: Conversation[]): string {
  const value = historySchema.parse({ version: 1, conversations: conversations.filter(chat => !chat.temporary) })
  const raw = JSON.stringify(value)
  if (raw.length > 2_000_000) throw new RangeError('Local history is full. Delete an older chat to save new conversations.')
  return raw
}

export function conversationTitle(text: string): string {
  const title = text.trim().replace(/\s+/g, ' ')
  return title.length > 64 ? `${title.slice(0, 61)}...` : title
}

export function replyToText(reply: ChatReply): string {
  return [reply.text, ...reply.sections.map(section => `${section.title}\n${section.items.map(item => `- ${item}`).join('\n')}`),
    ...(reply.sources.length ? [`Sample sources: ${reply.sources.join(', ')}`] : [])].join('\n\n')
}

export function simulateReply(request: ChatRequest): ChatReply {
  const { agent, messages, useSources, style } = request
  const prompt = messages.findLast(message => message.role === 'user')?.text.trim().toLowerCase() ?? ''
  if (!prompt) throw new Error('A user message is required.')
  if (!useSources && agent.id !== 'copilot') {
    return {
      text: 'Sample context is turned off. I cannot ground this answer in the recipe documents.',
      sections: [{ title: 'Try this', items: ['Turn Work IQ back on to use this agent\'s fictional sample context. No Microsoft 365 data is connected.'] }],
      sources: [],
    }
  }
  const previous = messages.findLast(message => message.role === 'assistant')?.reply
  if (previous && /\b(shorter|concise|brief|resum|mais curto)\b/.test(prompt)) {
    return {
      text: previous.text,
      sections: previous.sections.slice(0, 1).map(section => ({ ...section, items: section.items.slice(0, 2) })),
      sources: useSources ? [...previous.sources] : [],
    }
  }
  const rule = agent.rules.find(item => item.keywords.some(keyword => prompt.includes(keyword)))
  if (!rule) return { text: agent.fallback, sections: [], sources: [] }
  const sections = style === 'Quick response'
    ? rule.sections.slice(0, 1).map(section => ({ ...section, items: section.items.slice(0, 2) }))
    : rule.sections.map(section => ({ ...section, items: [...section.items] }))
  if (style === 'Think deeper') sections.push({
    title: 'Before you use this',
    items: ['Confirm the source information and assumptions.', 'Review the draft with a person before taking action. This is a scripted example, not a live AI answer.'],
  })
  return { text: rule.text, sections, sources: useSources ? agent.sources.map(source => source.title) : [] }
}

export const simulatedProvider: ChatProvider = {
  async respond(request, signal) {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, 700)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    signal.throwIfAborted()
    return simulateReply(request)
  },
}
