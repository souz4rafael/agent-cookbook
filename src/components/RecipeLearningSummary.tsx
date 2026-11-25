import type { ScenarioEditorial } from '../domain/types.ts'

export function RecipeLearningSummary({ overview }: { overview: ScenarioEditorial['home'] }) {
  return <dl className="home-recipe-overview">
    <div><dt>What you'll try</dt><dd>{overview.experiment}</dd></div>
    <div><dt>What you'll learn</dt><dd>{overview.takeaway}</dd></div>
  </dl>
}
