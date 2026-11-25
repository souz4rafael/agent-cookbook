import { z } from 'zod'
import { recipeIdSchema } from '../recipes/primitives.ts'
import { conversationSchema, conversationValueSchema, isConversationNumber, normalizeConversationText } from './schema.ts'
import type { ConversationDefinition, ConversationStep, ConversationValues } from './schema.ts'

const replySchema = z.strictObject({
  text: z.string().min(1).max(20_000),
  sources: z.array(z.string().max(200)).max(40),
  trace: z.array(z.string().max(2000)).max(80),
})
export type SimulationReply = z.infer<typeof replySchema>
export type ConversationSimulator = (prompt: string) => SimulationReply

const runSchema = z.strictObject({
  version: z.literal(1),
  conversationId: recipeIdSchema,
  revision: z.number().int().positive(),
  definition: z.string().max(262_144),
  configuration: z.string().max(100_000),
  seed: z.string().min(1).max(100),
  currentStepId: recipeIdSchema.nullable(),
  variables: z.record(recipeIdSchema, conversationValueSchema),
  variants: z.record(recipeIdSchema, recipeIdSchema),
  messages: z.array(z.strictObject({
    role: z.enum(['user', 'assistant']),
    stepId: recipeIdSchema,
    text: z.string().min(1).max(20_000),
    variantId: recipeIdSchema.optional(),
    simulation: replySchema.optional(),
  })).min(1).max(121),
})
export type ConversationRun = z.infer<typeof runSchema>
export const maxConversationSave = 1_000_000

export function renderConversationText(text: string, variables: ConversationValues): string {
  return text.replace(/\{\{([^{}]+)\}\}/gu, (_, name: string) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Unknown conversation variable "${name}".`)
    return String(variables[name])
  })
}

function hash(value: string): number {
  let result = 2166136261
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

function nextStep(definition: ConversationDefinition, step: ConversationStep): string | null {
  if (step.end) return null
  return step.next ?? definition.steps[definition.steps.findIndex(item => item.id === step.id) + 1]?.id ?? null
}

function drain(definition: ConversationDefinition, run: ConversationRun, simulate?: ConversationSimulator): ConversationRun {
  const next = structuredClone(run)
  for (let count = 0; next.currentStepId !== null; count++) {
    if (count >= definition.steps.length) throw new Error('Conversation did not reach a user step or an ending.')
    const step = definition.steps.find(item => item.id === next.currentStepId)
    if (!step) throw new Error('Unknown conversation step. Restart this conversation.')
    if (step.role === 'user') break
    if (step.role === 'simulation') {
      if (!simulate) throw new Error('This portal does not support simulated conversation steps.')
      const reply = replySchema.parse(simulate(renderConversationText(step.prompt, next.variables)))
      next.messages.push({ role: 'assistant', stepId: step.id, text: reply.text, simulation: reply })
    } else {
      const variantId = next.variants[step.id]
      const text = step.text ?? step.variants?.find(item => item.id === variantId)?.text
      if (text === undefined) throw new Error('Unknown message variant. Restart this conversation.')
      next.messages.push({
        role: 'assistant', stepId: step.id, text: renderConversationText(text, next.variables),
        ...(variantId ? { variantId } : {}),
      })
    }
    next.currentStepId = nextStep(definition, step)
  }
  return next
}

export function startConversation(
  definition: ConversationDefinition, configuration: string, seed: string,
  simulate?: ConversationSimulator, overrides: Record<string, string> = {},
): ConversationRun {
  const valid = conversationSchema.parse(definition)
  const variants: Record<string, string> = {}
  for (const [stepId, variantId] of Object.entries(overrides)) {
    const step = valid.steps.find(item => item.id === stepId)
    if (step?.role !== 'assistant' || !step.variants?.some(variant => variant.id === variantId)) {
      throw new Error(`Unknown variant override "${stepId}:${variantId}".`)
    }
  }
  for (const step of valid.steps) {
    if (step.role === 'assistant' && step.variants) {
      variants[step.id] = overrides[step.id] ?? step.variants[hash(`${seed}:${valid.id}:${step.id}`) % step.variants.length].id
    }
  }
  const run: ConversationRun = {
    version: 1, conversationId: valid.id, revision: valid.revision, definition: JSON.stringify(valid),
    configuration, seed, currentStepId: valid.steps[0].id, variables: { ...valid.variables }, variants,
    messages: [{ role: 'user', stepId: 'starter', text: renderConversationText(valid.starter.prompt, valid.variables) }],
  }
  return runSchema.parse(drain(valid, run, simulate))
}

export function assertConversationRun(definition: ConversationDefinition, run: ConversationRun, configuration: string): void {
  if (run.conversationId !== definition.id || run.revision !== definition.revision ||
      run.definition !== JSON.stringify(conversationSchema.parse(definition)) || run.configuration !== configuration) {
    throw new Error('The recipe or configuration changed. Restart the guided conversation; previous messages are not recalculated.')
  }
}

export function conversationSuggestions(definition: ConversationDefinition, run: ConversationRun): string[] {
  const step = definition.steps.find(item => item.id === run.currentStepId)
  return step?.role === 'user' ? step.choices?.map(choice => choice.label) ?? (step.input ? [step.input.example] : []) : []
}

export function advanceConversation(
  definition: ConversationDefinition, run: ConversationRun, input: string, configuration: string,
  simulate?: ConversationSimulator,
): { run: ConversationRun; notice: string | null; accepted: boolean } {
  assertConversationRun(definition, run, configuration)
  if (run.currentStepId === null) return { run, notice: 'This conversation has ended. Restart it or choose another starter.', accepted: false }
  const step = definition.steps.find(item => item.id === run.currentStepId)
  if (step?.role !== 'user') throw new Error('The conversation is not waiting for a user response.')
  const value = input.trim()
  if (!value || value.length > 1000) return { run, notice: 'Enter between 1 and 1,000 characters, using fictional information only.', accepted: false }
  let destination = nextStep(definition, step)
  const variables = { ...run.variables }
  if (step.choices) {
    const choice = step.choices.find(item => [item.label, ...item.acceptedTexts ?? []]
      .some(text => normalizeConversationText(text) === normalizeConversationText(value)))
    if (!choice) return { run, notice: 'That reply is not part of this scripted step. Choose a suggested reply to continue; no step has advanced.', accepted: false }
    destination = choice.next
  } else if (step.input) {
    const field = step.input
    if (field.type === 'number') {
      if (!isConversationNumber(value) || Number(value) < field.min || Number(value) > field.max) {
        return { run, notice: `Enter a fictional number from ${field.min} to ${field.max}.`, accepted: false }
      }
      variables[field.variable] = Number(value)
    } else {
      if (value.length < field.minLength || value.length > field.maxLength) {
        return { run, notice: `Enter fictional text between ${field.minLength} and ${field.maxLength} characters.`, accepted: false }
      }
      variables[field.variable] = value
    }
  }
  const next: ConversationRun = {
    ...run, variables, currentStepId: destination,
    messages: [...run.messages, { role: 'user', stepId: step.id, text: value }],
  }
  return { run: runSchema.parse(drain(definition, next, simulate)), notice: null, accepted: true }
}

export function encodeConversationRun(run: ConversationRun): string {
  const raw = JSON.stringify(runSchema.parse(run))
  if (raw.length > maxConversationSave) throw new RangeError('This conversation exceeds the local storage limit.')
  return raw
}

export function decodeConversationRun(raw: string, definitions: readonly ConversationDefinition[], configuration: string): ConversationRun {
  if (raw.length > maxConversationSave) throw new RangeError('Saved conversation exceeds the local storage limit.')
  const result = runSchema.safeParse(JSON.parse(raw))
  if (!result.success) throw new TypeError('The saved conversation has an invalid format. Restart to replace it.')
  const run = result.data
  const definition = definitions.find(item => item.id === run.conversationId)
  if (!definition) throw new TypeError('The saved conversation is no longer available. Restart to replace it.')
  assertConversationRun(definition, run, configuration)
  const current = definition.steps.find(step => step.id === run.currentStepId)
  if (run.currentStepId !== null && current?.role !== 'user') throw new TypeError('Saved conversation has an invalid current step.')
  const expectedVariants = definition.steps.filter(step => step.role === 'assistant' && step.variants)
  if (Object.keys(run.variants).length !== expectedVariants.length || expectedVariants.some(step =>
    step.role !== 'assistant' || !step.variants?.some(variant => variant.id === run.variants[step.id]))) {
    throw new TypeError('Saved conversation has invalid variants.')
  }
  if (Object.keys(run.variables).length !== Object.keys(definition.variables).length ||
      Object.entries(run.variables).some(([key, value]) => !Object.hasOwn(definition.variables, key) || typeof value !== typeof definition.variables[key])) {
    throw new TypeError('Saved conversation has invalid variables.')
  }
  if (run.messages[0].role !== 'user' || run.messages[0].stepId !== 'starter' ||
      run.messages.slice(1).some(message => {
        const step = definition.steps.find(item => item.id === message.stepId)
        return !step || message.role !== (step.role === 'user' ? 'user' : 'assistant') ||
          (message.simulation !== undefined) !== (step.role === 'simulation') ||
          (message.variantId !== undefined && message.variantId !== run.variants[message.stepId])
      })) throw new TypeError('Saved conversation has invalid message references.')
  // Replay only local transitions, reusing stored results rather than rerunning a simulator.
  const results = run.messages.flatMap(message => message.simulation ? [message.simulation] : [])
  let resultIndex = 0
  const replaySimulation: ConversationSimulator = () => {
    const result = results[resultIndex++]
    if (!result) throw new TypeError('Saved conversation is missing its simulation result.')
    return result
  }
  let replayed = startConversation(definition, configuration, run.seed, replaySimulation, run.variants)
  for (const message of run.messages.slice(1).filter(item => item.role === 'user')) {
    const result = advanceConversation(definition, replayed, message.text, configuration, replaySimulation)
    if (!result.accepted) throw new TypeError('Saved conversation contains an invalid user reply.')
    replayed = result.run
  }
  if (resultIndex !== results.length || JSON.stringify(replayed) !== JSON.stringify(run)) {
    throw new TypeError('Saved conversation does not match its recorded path. Restart to replace it.')
  }
  return run
}
