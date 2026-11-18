import manifest from './generated/recipes.json'
import { compiledRecipeSchema } from './domain/validation.ts'
import type { CompiledRecipe } from './domain/types.ts'

export const recipes: CompiledRecipe[] = compiledRecipeSchema.array().parse(manifest)
