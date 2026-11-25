import { z } from 'zod'
import { recipeIdSchema, recipeTextSchema } from '../../recipes/primitives.ts'
import { conversationsSchema } from '../../conversations/schema.ts'

export const knowledgeKinds = [
  'cloud-files', 'outlook', 'teams', 'fabric', 'connectors', 'dynamics', 'web', 'attachments',
] as const
export const knowledgeKindSchema = z.enum(knowledgeKinds)
export type KnowledgeKind = z.infer<typeof knowledgeKindSchema>
export const builderIconSchema = z.enum(['rle', 'expert', 'document'])
export const builderIdSchema = recipeIdSchema
export const builderTextSchema = recipeTextSchema
export const builderLimits = {
  recipes: 50, prompts: 12, sources: 10, skills: 20, rules: 30,
  name: 100, description: 1000, instructions: 16_000,
} as const

export const builderPromptSchema = z.strictObject({
  id: builderIdSchema,
  title: builderTextSchema(100, true),
  message: builderTextSchema(4000, true),
})

export const builderEditableProfileSchema = z.strictObject({
  name: builderTextSchema(builderLimits.name, true),
  description: builderTextSchema(builderLimits.description, true),
  instructions: builderTextSchema(builderLimits.instructions, true),
})

export const builderRecipeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  id: builderIdSchema,
  title: builderTextSchema(100),
  summary: builderTextSchema(1000),
  icon: builderIconSchema,
  profile: z.strictObject({
    name: builderTextSchema(builderLimits.name),
    description: builderTextSchema(builderLimits.description),
    instructions: builderTextSchema(builderLimits.instructions),
  }),
  sections: z.array(z.enum(['instructions', 'skills', 'knowledge', 'prompts'])).min(1).max(4),
  knowledge: z.array(z.strictObject({
    id: knowledgeKindSchema,
    label: builderTextSchema(100),
    enabled: z.boolean(),
    scope: z.enum(['work', 'web', 'attachments']),
  })).max(knowledgeKinds.length),
  sources: z.array(z.strictObject({
    id: builderIdSchema,
    title: builderTextSchema(160),
    kind: knowledgeKindSchema,
    content: builderTextSchema(12_000),
  })).max(builderLimits.sources),
  skills: z.array(z.strictObject({
    id: builderIdSchema,
    title: builderTextSchema(100),
    description: builderTextSchema(1000),
  })).max(builderLimits.skills),
  starterPrompts: z.array(builderPromptSchema).max(builderLimits.prompts),
  conversations: conversationsSchema.optional(),
  simulation: z.strictObject({
    fallback: builderTextSchema(12_000),
    rules: z.array(z.strictObject({
      id: builderIdSchema,
      keywords: z.array(builderTextSchema(80)).min(1).max(20),
      requiredSources: z.array(builderIdSchema).max(builderLimits.sources),
      requiredSkills: z.array(builderIdSchema).max(builderLimits.skills),
      text: builderTextSchema(12_000),
      sections: z.array(z.strictObject({
        title: builderTextSchema(200),
        items: z.array(builderTextSchema(4000)).max(20),
      })).max(9),
    })).max(builderLimits.rules),
  }),
}).superRefine((recipe, context) => {
  const unique = (values: string[], path: (string | number)[]) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', path, message: 'Duplicate identifiers or values are not allowed.' })
    }
  }
  unique(recipe.sections, ['sections'])
  for (const field of ['knowledge', 'sources', 'skills', 'starterPrompts'] as const) {
    unique(recipe[field].map(item => item.id), [field])
  }
  unique(recipe.simulation.rules.map(rule => rule.id), ['simulation', 'rules'])
  const kinds = new Set(recipe.knowledge.map(item => item.id))
  const sourceIds = new Set(recipe.sources.map(item => item.id))
  const skillIds = new Set(recipe.skills.map(item => item.id))
  recipe.knowledge.forEach((item, index) => {
    const expected = item.id === 'web' ? 'web' : item.id === 'attachments' ? 'attachments' : 'work'
    if (item.scope !== expected) {
      context.addIssue({ code: 'custom', path: ['knowledge', index, 'scope'], message: `Knowledge kind "${item.id}" requires scope "${expected}".` })
    }
  })
  recipe.sources.forEach((source, index) => {
    if (!kinds.has(source.kind)) {
      context.addIssue({ code: 'custom', path: ['sources', index, 'kind'], message: 'Source kind must have a knowledge row in this recipe.' })
    }
  })
  recipe.simulation.rules.forEach((rule, index) => {
    const path = ['simulation', 'rules', index]
    unique(rule.keywords.map(keyword => keyword.trim().toLowerCase()), [...path, 'keywords'])
    unique(rule.requiredSources, [...path, 'requiredSources'])
    unique(rule.requiredSkills, [...path, 'requiredSkills'])
    for (const [field, known] of [['requiredSources', sourceIds], ['requiredSkills', skillIds]] as const) {
      rule[field].forEach((id, referenceIndex) => {
        if (!known.has(id)) {
          context.addIssue({ code: 'custom', path: [...path, field, referenceIndex], message: `Unknown ${field === 'requiredSources' ? 'source' : 'skill'} reference "${id}".` })
        }
      })
    }
  })
})

export type BuilderRecipe = z.infer<typeof builderRecipeSchema>

export function loadRecipeCatalog(values: unknown[]): BuilderRecipe[] {
  if (values.length > builderLimits.recipes) throw new RangeError('Too many local builder recipes.')
  const recipes = values.map((value, index) => {
    const result = builderRecipeSchema.safeParse(value)
    if (!result.success) throw new TypeError(`Invalid builder recipe at index ${index}: ${result.error.message}`)
    return result.data
  })
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) {
    throw new TypeError('Duplicate builder recipe IDs are not allowed.')
  }
  return recipes
}
