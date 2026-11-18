import { loadFoundryRecipes } from './schema.ts'

const modules = import.meta.glob('../../../foundry/recipes/*.json', { eager: true, import: 'default' })

export const foundryRecipes = loadFoundryRecipes(Object.values(modules))

export function getFoundryRecipe(id: string) {
  return foundryRecipes.find(recipe => recipe.id === id)
}
