import { useState } from 'react'
import type { ConversationDefinition } from './schema.ts'
import {
  advanceConversation, assertConversationRun, conversationSuggestions, decodeConversationRun,
  encodeConversationRun, startConversation,
} from './runtime.ts'
import type { ConversationRun, ConversationSimulator } from './runtime.ts'
import { guidedMessages } from './presentation.ts'

export interface GuidedConversationOptions {
  conversations: readonly ConversationDefinition[]
  scope: string
  configuration: string
  simulate?: ConversationSimulator
  persist?: boolean
}

interface GuidedState {
  identity: string
  enabled: boolean
  run: ConversationRun | null
  warning: string | null
  notice: string | null
  overrides: Record<string, Record<string, string>>
}

function initialState(options: GuidedConversationOptions): GuidedState {
  const state: GuidedState = {
    identity: `${options.scope}:${options.persist !== false}`, enabled: false,
    run: null, warning: null, notice: null, overrides: {},
  }
  if (options.persist === false || !options.conversations.length) return state
  try {
    const raw = window.localStorage.getItem(`agents-cookbook:conversations:v1:${options.scope}`)
    if (raw) state.run = decodeConversationRun(raw, options.conversations, options.configuration)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    state.warning = `Saved guided conversation could not be resumed. ${error.message}`
  }
  return state
}

export function useGuidedConversation(options: GuidedConversationOptions) {
  const { conversations, scope, configuration, simulate, persist = true } = options
  const identity = `${scope}:${persist}`
  const [stored, setState] = useState(() => initialState(options))
  const state = stored.identity === identity ? stored : initialState(options)
  // Switching agents or entering temporary chat must never expose another scope's run.
  if (state !== stored) setState(state)
  const definition = conversations.find(item => item.id === state.run?.conversationId)
  let stale = !!state.run && !definition
  if (state.run && definition) {
    try { assertConversationRun(definition, state.run, configuration) } catch (error) {
      if (!(error instanceof Error)) throw error
      stale = true
    }
  }

  function commit(run: ConversationRun | null) {
    let warning: string | null = null
    if (persist) {
      try {
        const key = `agents-cookbook:conversations:v1:${scope}`
        if (run) window.localStorage.setItem(key, encodeConversationRun(run))
        else window.localStorage.removeItem(key)
      } catch (error) {
        if (!(error instanceof Error)) throw error
        warning = `The conversation changed in this tab but browser storage could not be updated. ${error.message}`
      }
    }
    setState(current => ({ ...current, run, warning, notice: null }))
  }

  function start(item: ConversationDefinition): boolean {
    try {
      commit(startConversation(item, configuration, crypto.randomUUID(), simulate, state.overrides[item.id]))
      return true
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setState(current => ({ ...current, notice: `Could not start the conversation. ${error.message}` }))
      return false
    }
  }

  function send(value: string): boolean {
    if (!state.run || !definition) {
      setState(current => ({ ...current, notice: 'Choose a conversation starter before sending a reply.' }))
      return false
    }
    try {
      const result = advanceConversation(definition, state.run, value, configuration, simulate)
      if (result.accepted) commit(result.run)
      else setState(current => ({ ...current, notice: result.notice }))
      return result.accepted
    } catch (error) {
      if (!(error instanceof Error)) throw error
      setState(current => ({ ...current, notice: `The reply was not applied. ${error.message}` }))
      return false
    }
  }

  return {
    ...state,
    enabled: state.enabled && conversations.length > 0,
    available: conversations.length > 0,
    conversations, definition, stale, persist,
    messages: guidedMessages(state.run),
    suggestions: state.run && definition && !stale ? conversationSuggestions(definition, state.run) : [],
    canSend: !!state.run && state.run.currentStepId !== null && !stale,
    start, send,
    reset: () => commit(null),
    setEnabled: (enabled: boolean) => setState(current => ({ ...current, enabled, notice: null })),
    setVariant: (conversationId: string, stepId: string, variantId: string) => {
      setState(current => {
        const overrides = { ...current.overrides[conversationId] }
        if (variantId) overrides[stepId] = variantId
        else delete overrides[stepId]
        return { ...current, overrides: { ...current.overrides, [conversationId]: overrides } }
      })
    },
  }
}

export type GuidedConversation = ReturnType<typeof useGuidedConversation>
