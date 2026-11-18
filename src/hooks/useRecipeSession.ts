import { useCallback, useRef, useState } from 'react'
import {
  createSession, respond, selectKnowledge, selectTool,
  setConnection, setAgentIcon, toggleMessageReaction, updateProfile as changeProfile,
  recordCitationOpen, runLabExample, setLabInputs,
} from '../domain/engine.ts'
import { loadSession, saveSession } from '../domain/storage.ts'
import { confirmOfferedHandoff } from '../domain/actions.ts'
import { runEvaluation, saveEvaluation } from '../domain/evaluation.ts'
import type { AgentIcon, AgentProfile, ChatMessage, CompiledRecipe, MessageReaction, Session } from '../domain/types.ts'
import type { LabInputs } from '../domain/lab-types.ts'

function readInitialState(recipe: CompiledRecipe) {
  try {
    return loadSession(recipe, window.localStorage)
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    return {
      session: createSession(recipe),
      warning: 'Local storage is unavailable. Your progress will be kept only in this tab.',
    }
  }
}

export function useRecipeSession(recipe: CompiledRecipe) {
  const [initial] = useState(() => readInitialState(recipe))
  const [session, setSession] = useState(initial.session)
  const current = useRef(session)
  const [storageWarning, setStorageWarning] = useState<string | null>(initial.warning)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((change: (previous: Session) => Session) => {
    try {
      const next = change(current.current)
      current.current = next
      setSession(next)
      setError(null)
      try {
        setStorageWarning(saveSession(recipe, next, window.localStorage))
      } catch (cause) {
        if (!(cause instanceof DOMException)) throw cause
        setStorageWarning('Your browser blocked saving. Progress is available only in this tab.')
      }
      return true
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause
      setError(cause.message)
      return false
    }
  }, [recipe])

  const sendMessage = useCallback((text: string) => {
    apply(previous => {
      const response = respond(recipe, previous, text)
      const messages: ChatMessage[] = [
        ...previous.messages,
        { id: crypto.randomUUID(), role: 'user', text: text.trim() },
        { id: crypto.randomUUID(), role: 'assistant', text: response.text, response },
      ]
      const activity = response.citations.length > 0
        ? [...previous.activity, {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: 'answered' as const,
          text: `Source-grounded answer: ${response.citations.map(item => item.title).join(', ')}.`,
        }].slice(-100)
        : previous.activity
      return { ...previous, messages: messages.slice(-100), activity }
    })
  }, [apply, recipe])

  return {
    session, storageWarning, error,
    updateProfile: (patch: Partial<AgentProfile>) => apply(previous => changeProfile(recipe, previous, patch)),
    updateIcon: (icon: AgentIcon) => apply(previous => setAgentIcon(recipe, previous, icon)),
    connect: (connectionId: string, resourceId: string | null) =>
      apply(previous => setConnection(recipe, previous, connectionId, resourceId)),
    toggleKnowledge: (documentId: string, enabled: boolean) =>
      apply(previous => selectKnowledge(recipe, previous, documentId, enabled)),
    toggleTool: (toolId: string, enabled: boolean) =>
      apply(previous => selectTool(recipe, previous, toolId, enabled)),
    sendMessage,
    updateLabInputs: (inputs: LabInputs) => apply(previous => setLabInputs(recipe, previous, inputs)),
    runLab: () => apply(previous => runLabExample(recipe, previous)),
    openCitation: (documentId: string) => apply(previous => recordCitationOpen(recipe, previous, documentId)),
    reactToMessage: (messageId: string, value: MessageReaction) => apply(previous => toggleMessageReaction(recipe, previous, messageId, value)),
    saveEvaluation: (name: string) => apply(previous => saveEvaluation(recipe, previous, name)),
    runEvaluation: (name: string) => apply(previous => runEvaluation(recipe, saveEvaluation(recipe, previous, name))),
    confirmHandoff: (toolId: string, summary: string) =>
      apply(previous => confirmOfferedHandoff(recipe, previous, toolId, summary)),
    reset: () => apply(() => createSession(recipe)),
    clearChat: () => apply(previous => ({ ...previous, messages: [] })),
  }
}
