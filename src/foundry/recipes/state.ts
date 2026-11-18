import { z } from 'zod'
import { recipeTextSchema } from '../../recipes/primitives.ts'
import { foundryIdSchema, foundryRecipeLimits, foundryRecipeSchema, loadFoundryRecipes } from './schema.ts'
import type { FoundryRecipe } from './schema.ts'

export const foundryDraftStorageKey = 'foundry-agents-cookbook:drafts:v1'

export type FoundryRoute = { kind: 'home' } | { kind: 'catalog' } | { kind: 'recipe'; recipeId: string } | { kind: 'not-found' }

export function readFoundryRoute(hash: string): FoundryRoute {
  if (['', '#', '#/', '#/home'].includes(hash)) return { kind: 'home' }
  if (hash === '#/catalog/agents') return { kind: 'catalog' }
  const match = /^#\/catalog\/agents\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(hash)
  if (match && foundryIdSchema.safeParse(match[1]).success) return { kind: 'recipe', recipeId: match[1] }
  return { kind: 'not-found' }
}

export function recipeHref(id: string) {
  return `#/catalog/agents/${foundryIdSchema.parse(id)}`
}

export const foundryDraftSchema = z.strictObject({
  id: z.uuid(),
  recipeId: foundryIdSchema,
  recipeRevision: z.number().int().positive(),
  name: foundryIdSchema,
  instructions: recipeTextSchema(foundryRecipeLimits.instructions),
  model: recipeTextSchema(100),
  toolIds: z.array(foundryIdSchema).max(20),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type FoundryDraft = z.infer<typeof foundryDraftSchema>

export function validateFoundryDraft(recipe: FoundryRecipe, value: unknown): FoundryDraft {
  const parsed = foundryDraftSchema.safeParse(value)
  if (!parsed.success) throw new TypeError(`Invalid local draft: ${parsed.error.message}`)
  const draft = parsed.data
  if (draft.recipeId !== recipe.id || draft.recipeRevision !== recipe.revision) {
    throw new TypeError('The local draft does not match this recipe revision. Its saved data has not been replaced.')
  }
  if (draft.model !== recipe.manifest.model) throw new TypeError('The local draft model does not match its manifest.')
  if (new Set(draft.toolIds).size !== draft.toolIds.length || draft.toolIds.some(id => !recipe.tools.some(tool => tool.id === id))) {
    throw new TypeError('The local draft contains duplicate or unknown tools.')
  }
  return draft
}

export function validateFoundryName(name: string, drafts: readonly FoundryDraft[], currentId?: string): string | null {
  if (!foundryIdSchema.safeParse(name).success) return 'Use 1-64 lowercase letters, numbers, and single hyphens between words.'
  if (drafts.some(draft => draft.id !== currentId && draft.name === name)) return 'An agent with this name already exists in your local Cookbook.'
  return null
}

export function createFoundryDraft(recipe: FoundryRecipe, name: string, drafts: readonly FoundryDraft[]): FoundryDraft {
  const valid = foundryRecipeSchema.parse(recipe)
  const error = validateFoundryName(name, drafts)
  if (error) throw new TypeError(error)
  if (drafts.length >= foundryRecipeLimits.drafts) throw new RangeError('This preview supports up to 50 local drafts.')
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(), recipeId: valid.id, recipeRevision: valid.revision, name,
    instructions: valid.manifest.instructions, model: valid.manifest.model, toolIds: [...valid.manifest.toolIds],
    createdAt: now, updatedAt: now,
  }
}

const storageSchema = z.strictObject({
  version: z.literal(1),
  drafts: z.array(foundryDraftSchema).max(foundryRecipeLimits.drafts),
})

function validateStore(value: unknown, recipes: readonly FoundryRecipe[]): FoundryDraft[] {
  const parsed = storageSchema.safeParse(value)
  if (!parsed.success) throw new TypeError('Saved Foundry drafts have an invalid or unsupported format.')
  const catalog = loadFoundryRecipes([...recipes])
  const { drafts } = parsed.data
  if (new Set(drafts.map(draft => draft.id)).size !== drafts.length || new Set(drafts.map(draft => draft.name)).size !== drafts.length) {
    throw new TypeError('Saved Foundry drafts have duplicate identifiers or names.')
  }
  return drafts.map(draft => {
    const recipe = catalog.find(recipe => recipe.id === draft.recipeId)
    if (!recipe) throw new TypeError(`Saved draft "${draft.name}" references a recipe that is no longer available.`)
    return validateFoundryDraft(recipe, draft)
  })
}

export function decodeFoundryDrafts(raw: string | null, recipes: readonly FoundryRecipe[]): FoundryDraft[] {
  if (raw === null) return []
  if (raw.length > foundryRecipeLimits.storage) throw new RangeError('Saved Foundry drafts exceed the storage limit.')
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new SyntaxError('Saved Foundry drafts are not valid JSON.')
  }
  return validateStore(value, recipes)
}

export function encodeFoundryDrafts(drafts: readonly FoundryDraft[], recipes: readonly FoundryRecipe[]): string {
  const raw = JSON.stringify({ version: 1, drafts: validateStore({ version: 1, drafts }, recipes) })
  if (raw.length > foundryRecipeLimits.storage) throw new RangeError('Saved Foundry drafts exceed the storage limit.')
  return raw
}
