import type { CompiledRecipe } from './types.ts'
import { businessScenarios, getRecipeScenario } from '../content/scenarios.ts'

export const recipeDurationHint = 'Estimated at 1 minute per guided step. Your pace may vary.'

export function recipeDuration(recipe: Pick<CompiledRecipe, 'estimatedMinutes'>): string {
  return `${recipe.estimatedMinutes} min`
}

export function filterRecipes(recipes: CompiledRecipe[], query: string): CompiledRecipe[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return recipes.filter(recipe => {
    const scenario = getRecipeScenario(recipe)
    const text = [recipe.title, recipe.agent.name, recipe.summary, recipe.industry, ...recipe.learningGoals,
      ...(scenario ? [scenario.headline, scenario.group?.journey ?? '', ...Object.values(scenario.home)] : []),
    ].join(' ').toLowerCase()
    return terms.every(term => text.includes(term))
  })
}

export function orderHomeRecipes(recipes: CompiledRecipe[]): CompiledRecipe[] {
  const order = new Map(businessScenarios.map((scenario, index) => [scenario.recipeId, index]))
  return [...recipes].sort((a, b) => (order.get(a.id) ?? businessScenarios.length) - (order.get(b.id) ?? businessScenarios.length))
}

export function recipeLevel(recipe: Pick<CompiledRecipe, 'difficulty'>): string {
  return recipe.difficulty === 'beginner' ? 'Beginner' : 'Intermediate'
}
