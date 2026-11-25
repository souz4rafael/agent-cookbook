import type { ConversationRun } from './runtime.ts'

export function guidedMessages(run: ConversationRun | null) {
  return run?.messages.map((message, index) => ({
    id: `guided:${run.seed}:${index}:${message.stepId}`,
    role: message.role,
    text: message.text,
    ...(message.role === 'assistant' ? {
      reply: { text: message.text, sections: [], sources: [...message.simulation?.sources ?? []] },
    } : {}),
    trace: [...message.simulation?.trace ?? []],
  })) ?? []
}
