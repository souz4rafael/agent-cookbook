import type { CompiledRecipe } from './types.ts'
import { businessScenarios, getBusinessScenarios, getRecipeScenario, getScenarioRecipe } from '../content/scenarios.ts'
import type { BusinessScenario } from '../content/scenarios.ts'

export interface ScenarioEntry {
  id: string
  name: string
  icon: CompiledRecipe['accentIcon']
  story?: BusinessScenario
  recipe?: CompiledRecipe
}

export function entryForRecipe(recipe: CompiledRecipe): ScenarioEntry {
  return { id: recipe.id, name: recipe.title, icon: recipe.accentIcon, story: getRecipeScenario(recipe), recipe }
}

export function getScenarioEntries(recipes: CompiledRecipe[], includeDrafts = false): ScenarioEntry[] {
  const stories = getBusinessScenarios(recipes, includeDrafts)
  const entries = stories.map(story => ({
    id: story.id, name: story.name, icon: story.icon, story, recipe: getScenarioRecipe(story, recipes, includeDrafts),
  }))
  // Recipes without editorial stories were discoverable on Home too.
  const linked = new Set(stories.map(story => story.recipeId))
  return [...entries, ...recipes.filter(recipe => (recipe.status === 'published' || includeDrafts) && !linked.has(recipe.id)).map(entryForRecipe)]
}

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

const difficultyLevels = { beginner: 'Beginner', intermediate: 'Intermediate' } satisfies Record<CompiledRecipe['difficulty'], string>
const difficultyOrder = Object.values(difficultyLevels)

export function recipeLevel(recipe: Pick<CompiledRecipe, 'difficulty'>): string {
  return difficultyLevels[recipe.difficulty]
}

export function recipeHarness({ harnessFeatures }: Pick<CompiledRecipe, 'harnessFeatures'>) {
  if (harnessFeatures?.additionalSettingsWebBrowsing) return 'Copilot Chat'
  return harnessFeatures?.topics ? 'Standard Harness' : 'Copilot Harness'
}

type Classification = Pick<CompiledRecipe, 'difficulty' | 'industry'>
export type ClassificationField = keyof Classification
export const allCategories = { difficulty: '', industry: '' }

export function catalogOptions(recipes: Classification[]) {
  const levels = new Set(recipes.map(recipeLevel))
  return {
    difficulties: difficultyOrder.filter(level => levels.has(level)),
    industries: [...new Set(recipes.map(recipe => recipe.industry))].sort((a, b) => a.localeCompare(b)),
  }
}

export function matchesCategories(recipe: Classification | undefined, filters: typeof allCategories): boolean {
  return (!filters.difficulty || (!!recipe && recipeLevel(recipe) === filters.difficulty))
    && (!filters.industry || recipe?.industry === filters.industry)
}

export function compareCategories(a: Classification | undefined, b: Classification | undefined, field: ClassificationField): number {
  if (!a || !b) return Number(!a) - Number(!b)
  if (field === 'industry') return a.industry.localeCompare(b.industry)
  return difficultyOrder.indexOf(recipeLevel(a)) - difficultyOrder.indexOf(recipeLevel(b))
}
