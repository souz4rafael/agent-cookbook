import { z } from 'zod'
import { recipeIdSchema, recipeTextSchema } from '../recipes/primitives.ts'

const id = recipeIdSchema
const text = recipeTextSchema(4000)
const variableId = id.refine(value => !['constructor', 'prototype'].includes(value), 'Reserved variable name.')
export const conversationValueSchema = z.union([recipeTextSchema(1000, true), z.number().finite(), z.boolean()])
const navigation = { next: id.optional(), end: z.literal(true).optional() }
const variantSchema = z.strictObject({ id, text })
const choiceSchema = z.strictObject({
  id, label: recipeTextSchema(200),
  acceptedTexts: z.array(recipeTextSchema(1000)).max(12).optional(),
  next: id,
})
const inputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'), variable: variableId, example: recipeTextSchema(1000),
    minLength: z.number().int().min(1).max(1000),
    maxLength: z.number().int().min(1).max(1000),
  }),
  z.strictObject({
    type: z.literal('number'), variable: variableId, example: recipeTextSchema(100),
    min: z.number().finite(), max: z.number().finite(),
  }),
])

export const conversationStepSchema = z.discriminatedUnion('role', [
  z.strictObject({
    id, role: z.literal('assistant'), ...navigation,
    text: text.optional(),
    variants: z.array(variantSchema).min(2).max(12).optional(),
  }),
  z.strictObject({
    id, role: z.literal('user'), ...navigation,
    choices: z.array(choiceSchema).min(1).max(12).optional(),
    input: inputSchema.optional(),
  }),
  // Simulation is terminal: a blocked result must never fall through to a scripted success.
  z.strictObject({ id, role: z.literal('simulation'), prompt: text, end: z.literal(true) }),
])

export function normalizeConversationText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export const conversationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  id,
  title: recipeTextSchema(140),
  mode: z.enum(['guided', 'simulated']),
  starter: z.strictObject({ label: recipeTextSchema(200), prompt: recipeTextSchema(1000) }),
  variationPolicy: z.literal('stable-per-session'),
  onUnexpectedInput: z.literal('stay-and-guide'),
  variables: z.record(variableId, conversationValueSchema).refine(values => Object.keys(values).length <= 20, 'Too many variables.'),
  steps: z.array(conversationStepSchema).min(1).max(60),
}).superRefine((conversation, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message })
  const ids = new Set(conversation.steps.map(step => step.id))
  if (ids.size !== conversation.steps.length) issue(['steps'], 'Step IDs must be unique.')
  const placeholders = (value: string, path: (string | number)[]) => {
    for (const match of value.matchAll(/\{\{([^{}]+)\}\}/gu)) {
      if (!Object.hasOwn(conversation.variables, match[1])) issue(path, `Unknown variable "${match[1]}".`)
    }
    if (/[{}]/u.test(value.replace(/\{\{[^{}]+\}\}/gu, ''))) issue(path, 'Use {{variable-id}} for placeholders; other braces are not supported.')
  }
  placeholders(conversation.starter.prompt, ['starter', 'prompt'])
  conversation.steps.forEach((step, index) => {
    const path = ['steps', index]
    if (step.role === 'simulation') {
      if (conversation.mode !== 'simulated') issue(path, 'Simulation steps require simulated mode.')
      placeholders(step.prompt, [...path, 'prompt'])
      return
    }
    if (step.end && step.next) issue(path, 'Choose either next or end, not both.')
    if (step.next && !ids.has(step.next)) issue([...path, 'next'], 'Unknown destination.')
    if (step.role === 'assistant') {
      if ((step.text !== undefined) === (step.variants !== undefined)) issue(path, 'Provide text OR variants.')
      if (step.text) placeholders(step.text, [...path, 'text'])
      if (step.variants) {
        if (new Set(step.variants.map(item => item.id)).size !== step.variants.length) issue([...path, 'variants'], 'Variant IDs must be unique.')
        step.variants.forEach((variant, variantIndex) => placeholders(variant.text, [...path, 'variants', variantIndex, 'text']))
      }
    } else {
      if ((step.choices !== undefined) === (step.input !== undefined)) issue(path, 'Provide choices OR an input.')
      if (step.choices) {
        if (step.next || step.end) issue(path, 'Each choice supplies its own destination.')
        const accepted = new Map<string, string>()
        const choices = new Set<string>()
        step.choices.forEach((choice, choiceIndex) => {
          if (choices.has(choice.id)) issue([...path, 'choices', choiceIndex], 'Choice IDs must be unique.')
          choices.add(choice.id)
          if (!ids.has(choice.next)) issue([...path, 'choices', choiceIndex, 'next'], 'Unknown destination.')
          for (const value of [choice.label, ...choice.acceptedTexts ?? []]) {
            const normalized = normalizeConversationText(value)
            const owner = accepted.get(normalized)
            if (owner && owner !== choice.id) issue([...path, 'choices', choiceIndex], 'Choices must not accept the same normalized text.')
            accepted.set(normalized, choice.id)
          }
        })
      }
      if (step.input) {
        const input = step.input
        if (!Object.hasOwn(conversation.variables, input.variable) || typeof conversation.variables[input.variable] !== (input.type === 'text' ? 'string' : 'number')) {
          issue([...path, 'input', 'variable'], 'Input needs a declared variable of the same type.')
        }
        if (input.type === 'text') {
          if (input.minLength > input.maxLength || input.example.trim().length < input.minLength || input.example.trim().length > input.maxLength) {
            issue([...path, 'input'], 'Invalid text limits or example.')
          }
        } else if (input.min > input.max || !isConversationNumber(input.example) || Number(input.example) < input.min || Number(input.example) > input.max) {
          issue([...path, 'input'], 'Invalid numeric limits or example.')
        }
      }
    }
  })
  if (conversation.mode === 'simulated' && !conversation.steps.some(step => step.role === 'simulation')) {
    issue(['mode'], 'Simulated mode needs a simulation step.')
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(stepId: string): void {
    if (visiting.has(stepId)) { issue(['steps'], 'Cycles are not supported; every path must terminate.'); return }
    if (visited.has(stepId)) return
    const index = conversation.steps.findIndex(step => step.id === stepId)
    if (index < 0) return
    const step = conversation.steps[index]
    visiting.add(stepId)
    const targets = step.role === 'user' && step.choices ? step.choices.map(choice => choice.next)
      : step.end ? [] : [step.next ?? conversation.steps[index + 1]?.id].filter(value => value !== undefined)
    targets.forEach(visit)
    visiting.delete(stepId)
    visited.add(stepId)
  }
  visit(conversation.steps[0].id)
  if (visited.size !== ids.size) issue(['steps'], 'Every step must be reachable from the first step.')
})

export function isConversationNumber(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(value.trim()) && Number.isFinite(Number(value))
}

export const conversationsSchema = z.array(conversationSchema).min(1).max(20).superRefine((items, context) => {
  if (new Set(items.map(item => item.id)).size !== items.length) {
    context.addIssue({ code: 'custom', message: 'Conversation IDs must be unique.' })
  }
  if (new Set(items.map(item => normalizeConversationText(item.starter.prompt))).size !== items.length) {
    context.addIssue({ code: 'custom', message: 'Conversation starter prompts must be unique.' })
  }
})

export type ConversationDefinition = z.infer<typeof conversationSchema>
export type ConversationStep = ConversationDefinition['steps'][number]
export type ConversationValues = ConversationDefinition['variables']
