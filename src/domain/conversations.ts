import { respond } from './engine.ts'
import type { CompiledRecipe, Session } from './types.ts'
import type { SimulationReply } from '../conversations/runtime.ts'

export function simulateStudioConversation(recipe: CompiledRecipe, session: Session, prompt: string): SimulationReply {
  const response = respond(recipe, session, prompt)
  return {
    text: response.text + (response.draft ? `\n\n${response.draft.title}\n${response.draft.body}` : '') +
      (response.toolId ? '\n\nNo action was executed. Return to the regular recipe preview to review and confirm a simulated request.' : ''),
    sources: response.citations.map(citation => citation.title),
    trace: response.trace,
  }
}
