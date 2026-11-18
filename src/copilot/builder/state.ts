import { z } from 'zod'
import type { AgentDefinition } from '../framework.ts'
import {
  builderEditableProfileSchema, builderIconSchema, builderIdSchema, builderLimits,
  builderPromptSchema, builderRecipeSchema, knowledgeKindSchema, knowledgeKinds, loadRecipeCatalog,
} from './schema.ts'
import type { BuilderRecipe } from './schema.ts'

export const builderModes = ['Auto', 'Quick response', 'Think deeper'] as const
export const builderStorageKey = 'copilot-agents-cookbook:builder-drafts:v1'
export const maxBuilderStorageLength = 1_000_000

export const builderDraftSchema = z.strictObject({
  recipeId: builderIdSchema,
  recipeRevision: z.number().int().positive(),
  profile: builderEditableProfileSchema,
  icon: builderIconSchema,
  mode: z.enum(builderModes),
  knowledge: z.array(z.strictObject({
    id: knowledgeKindSchema,
    enabled: z.boolean(),
    sourceIds: z.array(builderIdSchema).max(builderLimits.sources),
  })).max(knowledgeKinds.length),
  skillIds: z.array(builderIdSchema).max(builderLimits.skills),
  prompts: z.array(builderPromptSchema).max(builderLimits.prompts),
  status: z.enum(['draft', 'created']),
  updatedAt: z.iso.datetime({ offset: true }),
}).superRefine((draft, context) => {
  const unique = (values: string[], path: (string | number)[]) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', path, message: 'Duplicate draft identifiers are not allowed.' })
    }
  }
  unique(draft.knowledge.map(item => item.id), ['knowledge'])
  unique(draft.skillIds, ['skillIds'])
  unique(draft.prompts.map(item => item.id), ['prompts'])
  draft.knowledge.forEach((item, index) => unique(item.sourceIds, ['knowledge', index, 'sourceIds']))
})

export type BuilderDraft = z.infer<typeof builderDraftSchema>

function parseDraft(value: unknown): BuilderDraft {
  const result = builderDraftSchema.safeParse(value)
  if (!result.success) throw new TypeError(`Invalid builder draft: ${result.error.message}`)
  return result.data
}

export function createBuilderDraft(recipe: BuilderRecipe): BuilderDraft {
  const valid = builderRecipeSchema.parse(recipe)
  return {
    recipeId: valid.id,
    recipeRevision: valid.revision,
    profile: { ...valid.profile },
    icon: valid.icon,
    mode: 'Auto',
    knowledge: valid.knowledge.map(item => ({ id: item.id, enabled: item.enabled, sourceIds: [] })),
    skillIds: [],
    prompts: valid.starterPrompts.map(item => ({ ...item })),
    status: 'draft',
    updatedAt: new Date().toISOString(),
  }
}

export function validateBuilderDraft(recipe: BuilderRecipe, draft: BuilderDraft): BuilderDraft {
  const validRecipe = builderRecipeSchema.parse(recipe)
  const valid = parseDraft(draft)
  if (valid.recipeId !== validRecipe.id) throw new TypeError('Builder draft belongs to a different recipe.')
  if (valid.recipeRevision !== validRecipe.revision) {
    throw new TypeError(`Builder draft revision ${valid.recipeRevision} does not match recipe "${validRecipe.id}" revision ${validRecipe.revision}.`)
  }
  if (valid.knowledge.length !== validRecipe.knowledge.length ||
      valid.knowledge.some(item => !validRecipe.knowledge.some(row => row.id === item.id))) {
    throw new TypeError('Builder draft knowledge rows do not match its recipe.')
  }
  for (const row of valid.knowledge) {
    for (const id of row.sourceIds) {
      const source = validRecipe.sources.find(item => item.id === id)
      if (!source) throw new TypeError(`Unknown builder source reference "${id}".`)
      if (source.kind !== row.id) throw new TypeError(`Builder source "${id}" belongs to a different knowledge kind, not "${row.id}".`)
    }
  }
  if (valid.skillIds.some(id => !validRecipe.skills.some(skill => skill.id === id))) {
    throw new TypeError('Builder draft contains an unknown skill reference.')
  }
  if (valid.status === 'created') {
    const errors = validateForCreate(valid)
    if (errors.length) throw new TypeError(`Created builder draft is incomplete: ${errors.join(' ')}`)
  }
  return valid
}

export function validateForCreate(draft: BuilderDraft): string[] {
  const result = builderDraftSchema.safeParse(draft)
  if (!result.success) {
    return result.error.issues.map(issue => `Check ${issue.path.join('.') || 'agent settings'}: ${issue.message}`)
  }
  const errors: string[] = []
  if (!draft.profile.name.trim()) errors.push('Enter an agent name before creating the agent.')
  if (!draft.profile.instructions.trim()) errors.push('Add instructions before creating the agent.')
  draft.prompts.forEach((prompt, index) => {
    if (Boolean(prompt.title.trim()) !== Boolean(prompt.message.trim())) {
      errors.push(`Suggested prompt ${index + 1} needs both a title and a message, or leave both blank.`)
    }
  })
  return errors
}

export function toPreviewAgent(recipe: BuilderRecipe, draft: BuilderDraft): AgentDefinition {
  const valid = validateBuilderDraft(recipe, draft)
  const sources = recipe.sources.filter(source => {
    const row = valid.knowledge.find(item => item.id === source.kind)
    return row?.enabled && (row.sourceIds.length === 0 || row.sourceIds.includes(source.id))
  })
  const sourceIds = new Set(sources.map(source => source.id))
  const skillIds = new Set(valid.skillIds)
  return {
    id: `builder:${recipe.id}`,
    name: valid.profile.name.trim() || 'Untitled agent',
    description: valid.profile.description,
    icon: 'copilot',
    greeting: 'Local agent preview. Replies are scripted examples using fictional fixtures, not a live model. Edited instructions are saved as text, not executed. No Microsoft 365 data, tool calls, sending, or training is connected.',
    starters: valid.prompts.filter(prompt => prompt.title.trim() && prompt.message.trim())
      .map(prompt => ({ label: prompt.title, prompt: prompt.message })),
    sources: sources.map(source => ({ title: source.title, content: source.content })),
    fallback: `Local simulation: ${recipe.simulation.fallback}`,
    rules: recipe.simulation.rules.map(rule => {
      const missingSources = rule.requiredSources.filter(id => !sourceIds.has(id))
      const missingSkills = rule.requiredSkills.filter(id => !skillIds.has(id))
      const keywords = rule.keywords.map(keyword => keyword.trim().toLowerCase())
      if (!missingSources.length && !missingSkills.length) {
        return {
          keywords,
          text: `Local simulation: ${rule.text}`,
          sections: rule.sections.map(section => ({ title: section.title, items: [...section.items] })),
        }
      }
      return {
        keywords,
        text: 'Local simulation — configuration gap. This example needs the knowledge or skills listed below. No task, review, tool call, sending, or training was performed.',
        sections: [
          ...(missingSources.length ? [{
            title: 'Knowledge needed',
            items: missingSources.map(id => {
              const source = recipe.sources.find(item => item.id === id)!
              const row = valid.knowledge.find(item => item.id === source.kind)!
              const label = recipe.knowledge.find(item => item.id === source.kind)!.label
              return `${row.enabled ? 'Include' : `Enable ${label} and include`} "${source.title}"${row.enabled ? ` in ${label}` : ''}. Clear source selections to search all local fixtures of this kind; no real files are searched.`
            }),
          }] : []),
          ...(missingSkills.length ? [{
            title: 'Skills needed',
            items: missingSkills.map(id => `Select "${recipe.skills.find(skill => skill.id === id)!.title}" in Agents & Skills. This only enables a scripted local example, not a tool.`),
          }] : []),
        ],
      }
    }),
  }
}

const storageSchema = z.strictObject({
  version: z.literal(1),
  drafts: z.record(builderIdSchema, builderDraftSchema).refine(
    drafts => Object.keys(drafts).length <= builderLimits.recipes, 'Too many saved builder drafts.',
  ),
})

function parseStorage(value: unknown) {
  const result = storageSchema.safeParse(value)
  if (!result.success) throw new TypeError(`Saved builder drafts have an unsupported or invalid format: ${result.error.message}`)
  for (const [key, draft] of Object.entries(result.data.drafts)) {
    if (key !== draft.recipeId) throw new TypeError(`Saved builder draft key "${key}" does not match its recipe ID.`)
  }
  return result.data
}

// Full recipe-reference validation happens in validateBuilderDraft and decodeBuilderDrafts.
export function encodeBuilderDrafts(drafts: Record<string, BuilderDraft>): string {
  const raw = JSON.stringify(parseStorage({ version: 1, drafts }))
  if (raw.length > maxBuilderStorageLength) {
    throw new RangeError('Saved builder drafts exceed the local storage limit.')
  }
  return raw
}

// JSON.parse alone silently overwrites duplicate object keys, including recipe IDs.
function rejectDuplicateJsonKeys(raw: string): void {
  const stack: ({ keys: Set<string>; expectsKey: boolean } | null)[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]
    if (character === '"') {
      const start = index
      index += 1
      while (index < raw.length && raw[index] !== '"') {
        index += raw[index] === '\\' ? 2 : 1
      }
      const current = stack.at(-1)
      if (current?.expectsKey) {
        const key: string = JSON.parse(raw.slice(start, index + 1))
        if (current.keys.has(key)) throw new TypeError(`Saved builder drafts contain duplicate JSON key "${key}".`)
        current.keys.add(key)
        current.expectsKey = false
      }
    } else if (character === '{' || character === '[') {
      stack.push(character === '{' ? { keys: new Set(), expectsKey: true } : null)
      if (stack.length > 32) throw new TypeError('Saved builder drafts are nested too deeply.')
    } else if (character === '}' || character === ']') {
      stack.pop()
    } else if (character === ',') {
      const current = stack.at(-1)
      if (current) current.expectsKey = true
    }
  }
}

export function decodeBuilderDrafts(raw: string | null, recipes: readonly BuilderRecipe[]): Record<string, BuilderDraft> {
  if (raw === null) return {}
  if (raw.length > maxBuilderStorageLength) throw new RangeError('Saved builder drafts exceed the local storage limit.')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new SyntaxError('Saved builder drafts are not valid JSON.')
  }
  rejectDuplicateJsonKeys(raw)
  const { drafts } = parseStorage(value)
  const catalog = loadRecipeCatalog([...recipes])
  return Object.fromEntries(Object.entries(drafts).map(([key, draft]) => {
    const recipe = catalog.find(item => item.id === key)
    if (!recipe) throw new TypeError(`Saved builder draft references unknown recipe "${key}".`)
    return [key, validateBuilderDraft(recipe, draft)]
  }))
}

export type BuilderRoute =
  | { kind: 'chat' }
  | { kind: 'new-agent' }
  | { kind: 'builder'; recipeId: string }
  | { kind: 'not-found' }

export function readBuilderRoute(hash: string): BuilderRoute {
  if (hash === '' || hash === '#' || hash === '#/' || hash === '#/chat') return { kind: 'chat' }
  if (hash === '#/agents/new') return { kind: 'new-agent' }
  const match = /^#\/agents\/new\/([^/]+)$/.exec(hash)
  if (!match) return { kind: 'not-found' }
  try {
    const recipeId = decodeURIComponent(match[1])
    return builderIdSchema.safeParse(recipeId).success ? { kind: 'builder', recipeId } : { kind: 'not-found' }
  } catch {
    return { kind: 'not-found' }
  }
}
