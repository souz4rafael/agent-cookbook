import { z } from 'zod'
import { recipeIdSchema, recipeTextSchema } from '../../recipes/primitives.ts'

export const foundryRecipeLimits = { recipes: 100, drafts: 50, instructions: 24_000, storage: 2_000_000 } as const
export const foundryIdSchema = recipeIdSchema
export const toolIcons = ['bing', 'code', 'file', 'sharepoint', 'fabric', 'search', 'browser', 'openapi', 'github'] as const

const text = recipeTextSchema
const officialLink = z.url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password &&
    ['ai.azure.com', 'learn.microsoft.com', 'www.microsoft.com', 'aka.ms'].includes(url.hostname)
}, 'Reference links must be official HTTPS Microsoft URLs.')

const blockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('paragraph'), text: text(8000) }),
  z.strictObject({ kind: z.literal('list'), items: z.array(text(1000)).min(1).max(30) }),
])

export const foundryRecipeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  id: foundryIdSchema,
  title: text(120),
  publisher: text(100),
  createdOn: z.iso.date(),
  summary: text(1000),
  featuredOrder: z.number().int().nonnegative(),
  tools: z.array(z.strictObject({
    id: foundryIdSchema,
    name: text(100),
    icon: z.enum(toolIcons),
  })).max(20),
  sections: z.array(z.strictObject({
    id: foundryIdSchema,
    title: text(160),
    blocks: z.array(blockSchema).min(1).max(30),
  })).min(1).max(12),
  source: z.strictObject({
    url: officialLink,
    version: text(30),
    licenseText: text(2000),
    licenseLabel: text(160),
    licenseUrl: officialLink,
    disclaimer: text(4000),
    learnMoreUrl: officialLink,
  }),
  manifest: z.strictObject({
    defaultName: foundryIdSchema,
    instructions: text(foundryRecipeLimits.instructions),
    model: text(100),
    toolIds: z.array(foundryIdSchema).max(20),
  }),
}).superRefine((recipe, context) => {
  for (const [path, values] of [
    ['tools', recipe.tools.map(tool => tool.id)],
    ['sections', recipe.sections.map(section => section.id)],
    ['manifest.toolIds', recipe.manifest.toolIds],
  ] as const) {
    if (new Set(values).size !== values.length) context.addIssue({ code: 'custom', path: path.split('.'), message: 'Duplicate identifiers are not allowed.' })
  }
  if (recipe.manifest.toolIds.some(id => !recipe.tools.some(tool => tool.id === id))) {
    context.addIssue({ code: 'custom', path: ['manifest', 'toolIds'], message: 'Manifest references an unknown tool.' })
  }
})

export type FoundryRecipe = z.infer<typeof foundryRecipeSchema>
export type FoundryTool = FoundryRecipe['tools'][number]
export type FoundrySort = 'featured' | 'name-asc' | 'name-desc' | 'newest'

export function loadFoundryRecipes(values: unknown[]): FoundryRecipe[] {
  if (values.length > foundryRecipeLimits.recipes) throw new RangeError('Too many Foundry recipes.')
  const recipes = values.map((value, index) => {
    const result = foundryRecipeSchema.safeParse(value)
    if (!result.success) throw new TypeError(`Invalid Foundry recipe at index ${index}: ${result.error.message}`)
    return result.data
  })
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new TypeError('Duplicate Foundry recipe IDs.')
  return recipes
}

export function filterFoundryRecipes(recipes: readonly FoundryRecipe[], query: string, sort: FoundrySort): FoundryRecipe[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return recipes.filter(recipe => {
    const haystack = [recipe.title, recipe.publisher, recipe.summary, ...recipe.tools.map(tool => tool.name)].join(' ').toLowerCase()
    return terms.every(term => haystack.includes(term))
  }).sort((a, b) => {
    if (sort === 'name-asc') return a.title.localeCompare(b.title)
    if (sort === 'name-desc') return b.title.localeCompare(a.title)
    if (sort === 'newest') return b.createdOn.localeCompare(a.createdOn) || a.title.localeCompare(b.title)
    return a.featuredOrder - b.featuredOrder || a.title.localeCompare(b.title)
  })
}
