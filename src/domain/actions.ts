import { emptyLearningEvidence, executeHandoff, getConfigurationFingerprint, respond, respondLab } from './engine.ts'
import { defaultLabInputs, inputsEqual } from './lab.ts'
import type { CompiledRecipe, Session } from './types.ts'

export function confirmOfferedHandoff(recipe: CompiledRecipe, session: Session, toolId: string, summary: string): Session {
  const offer = session.messages.at(-1)?.response
  if (offer?.kind !== 'handoff-ready' || offer.toolId !== toolId) {
    throw new Error('This handoff offer is no longer active. Ask for human support again before confirming.')
  }
  if (offer.lab) {
    if (!recipe.lab || offer.lab.fingerprint !== getConfigurationFingerprint(session)
      || !inputsEqual(recipe.lab, offer.lab.inputs, session.labInputs ?? defaultLabInputs(recipe.lab))) {
      throw new Error('The inputs or configuration changed. Run the example again before confirming.')
    }
    const current = respondLab(recipe, session, offer.lab.inputs)
    if (current.kind !== 'handoff-ready' || current.toolId !== toolId || current.lab?.outcomeId !== offer.lab.outcomeId) {
      throw new Error('This action is no longer available. Run the example again before confirming.')
    }
    const result = executeHandoff(recipe, session, toolId, summary)
    const evidence = session.learningEvidence ?? emptyLearningEvidence()
    const fingerprint = getConfigurationFingerprint(session)
    return { ...result, learningEvidence: { ...evidence, actions: [
      ...evidence.actions.filter(item => item.fingerprint === fingerprint && !(item.toolId === toolId && item.outcomeId === offer.lab!.outcomeId)),
      { toolId, outcomeId: offer.lab.outcomeId, fingerprint },
    ] } }
  }
  if (recipe.facts.some(fact => fact.toolId === toolId)) {
    const request = session.messages.at(-2)
    if (request?.role !== 'user' || respond(recipe, session, request.text).toolId !== toolId) {
      throw new Error('The sample or routing configuration changed. Run the example again before confirming.')
    }
  }
  return executeHandoff(recipe, session, toolId, summary)
}
