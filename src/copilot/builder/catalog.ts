import { loadRecipeCatalog } from './schema.ts'
import type { BuilderRecipe } from './schema.ts'

const modules = import.meta.glob('../../../copilot/recipes/*.json', { eager: true, import: 'default' })

export const builderRecipes: BuilderRecipe[] = loadRecipeCatalog(Object.values(modules))

export function getBuilderRecipe(id: string): BuilderRecipe {
  const recipe = builderRecipes.find(item => item.id === id)
  if (!recipe) throw new Error(`Unknown builder recipe "${id}".`)
  return recipe
}
