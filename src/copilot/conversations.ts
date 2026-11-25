import { replyToText, simulateReply } from './framework.ts'
import type { AgentDefinition, ResponseStyle } from './framework.ts'
import type { SimulationReply } from '../conversations/runtime.ts'

export function simulateCopilotConversation(agent: AgentDefinition, prompt: string, style: ResponseStyle, useSources: boolean): SimulationReply {
  const reply = simulateReply({
    agent, style, useSources,
    messages: [{ id: 'guided-prompt', role: 'user', text: prompt }],
  })
  return {
    text: replyToText({ ...reply, sources: [] }),
    sources: reply.sources,
    trace: ['Executed the existing local keyword-rule simulator with the current configuration. No model or external tool was called.'],
  }
}
