import { allCategories, catalogOptions } from '../domain/catalog.ts'
import type { CompiledRecipe } from '../domain/types.ts'

export function CatalogFilters({ recipes, value, onChange }: {
  recipes: CompiledRecipe[]
  value: typeof allCategories
  onChange: (value: typeof allCategories) => void
}) {
  const { difficulties, industries } = catalogOptions(recipes)
  return <>
    <label>Difficulty<select value={value.difficulty} onChange={event => onChange({ ...value, difficulty: event.target.value })}>
      <option value="">All difficulties</option>
      {difficulties.map(level => <option key={level}>{level}</option>)}
    </select></label>
    <label>Industry<select value={value.industry} onChange={event => onChange({ ...value, industry: event.target.value })}>
      <option value="">All industries</option>
      {industries.map(industry => <option key={industry}>{industry}</option>)}
    </select></label>
  </>
}
