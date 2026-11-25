import { useState } from 'react'
import { ArrowLeft20Regular, ArrowRight20Regular, ArrowUpRight20Regular, BookOpen20Regular, Checkmark16Regular, Clock16Regular } from '@fluentui/react-icons'
import type { CompiledRecipe } from '../domain/types.ts'
import { allCategories, compareCategories, getScenarioEntries, matchesCategories, recipeDuration, recipeDurationHint, recipeLevel } from '../domain/catalog.ts'
import { recipeHref } from '../domain/routes.ts'
import type { ClassificationField, ScenarioEntry } from '../domain/catalog.ts'
import type { BusinessScenario } from '../content/scenarios.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { CatalogFilters } from './CatalogFilters.tsx'
import { Modal } from './Modal.tsx'
import { RecipeLearningSummary } from './RecipeLearningSummary.tsx'
import './ScenarioExplorer.css'

function RecipeMeta({ recipe }: { recipe: CompiledRecipe }) {
  return <div className="scenario-meta"><span title={recipeDurationHint}><Clock16Regular aria-hidden="true" />{recipeDuration(recipe)}</span><span>{recipeLevel(recipe)}</span></div>
}

function ScenarioCard({ entry, onSelect }: { entry: ScenarioEntry; onSelect: (entry: ScenarioEntry) => void }) {
  const { story, recipe } = entry
  return <article className="scenario-card" aria-labelledby={`card-${entry.id}`}>
    <div className="scenario-card-heading">
      <span className="square-icon"><AgentIconGraphic icon={entry.icon} size={24} /></span>
      <div><span className="scenario-kicker">{recipe?.industry ?? 'Business scenario'}</span>
        <h3 id={`card-${entry.id}`}>{entry.name}</h3></div>
    </div>
    {entry.id === 'citizen-qa' && recipe && <span className="scenario-badge">Recommended first</span>}
    {recipe?.status === 'draft' && <span className="scenario-badge">Local draft</span>}
    <p>{story?.home.challenge ?? recipe?.summary}</p>
    {recipe && <RecipeMeta recipe={recipe} />}
    {story && <RecipeLearningSummary overview={story.home} />}
    {story && <p className="scenario-card-scope"><strong>Scope:</strong> {story.home.scope}</p>}
    <button className="text-button scenario-open" type="button" aria-haspopup="dialog" aria-label={`View scenario: ${entry.name}`}
      onClick={() => onSelect(entry)}>View scenario <ArrowRight20Regular aria-hidden="true" /></button>
  </article>
}

function BusinessStory({ story }: { story: BusinessScenario }) {
  return <>
    <header className="scenario-detail-intro">
      {story.group && <p className="scenario-kicker">{story.group.journey} · {story.group.perspective === 'guidance' ? 'Guidance and service' : 'Operational support'}</p>}
      <h3>{story.headline}</h3><p>{story.summary}</p>
    </header>
    <div className="scenario-business-story">
      <section><span className="scenario-section-number">01</span><h3>The problem</h3><p>{story.problem}</p></section>
      <section><span className="scenario-section-number">02</span><h3>Why it matters</h3><p>{story.impact}</p></section>
      <section><span className="scenario-section-number">03</span><h3>How an agent helps</h3><p>{story.approach}</p></section>
    </div>
    <div className="scenario-first-step"><BookOpen20Regular aria-hidden="true" /><div><h3>Start small</h3><p>{story.startSmall}</p></div></div>
    <div className="scenario-value">
      <div><h3>What better could look like</h3><p>{story.potentialValue}</p></div>
      <div><h3>How to measure progress</h3><p>{story.measure}</p></div>
    </div>
    <p className="scenario-boundary"><strong>Keep the scope clear.</strong> {story.boundary}</p>
  </>
}

function LearningPreview({ recipe, story }: { recipe: CompiledRecipe; story?: BusinessScenario }) {
  const examples = recipe.lab?.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length).slice(0, 3)
  return <section className="scenario-recipe-preview" aria-label="About this recipe">
    <div className="scenario-recipe-intro">
      <h3>Inside the recipe</h3>
      {story && <RecipeLearningSummary overview={story.home} />}
      <div className="scenario-example-questions"><strong>Examples to explore</strong>
        <ul>{(examples?.map(item => item.title) ?? recipe.test.suggestedQuestions.slice(0, 3)).map(title => <li key={title}>{title}</li>)}</ul>
      </div>
      <details className="scenario-goals"><summary>Learning objectives</summary><ul>{recipe.learningGoals.map(goal =>
        <li key={goal}><Checkmark16Regular aria-hidden="true" />{goal}</li>)}</ul></details>
    </div>
    <ol className="scenario-recipe-steps">
      <li><span>01</span><div><strong>{recipe.knowledge.length || recipe.tools.length ? 'Configure the exercise' : 'Inspect the skill and its scope'}</strong><p>{recipe.knowledge.length > 0 && 'In Build, connect the library and select the documents for this exercise. '}{recipe.tools.length > 0 && 'Connect and enable the tool to explore the simulated action. '}{!recipe.knowledge.length && !recipe.tools.length && 'Open Skills in Build to see which behaviour is simulated and which skills are reference-only. No connections are needed. '}Inspect the exercise rules in Review.</p></div></li>
      <li><span>02</span><div><strong>Change data and inspect the evidence</strong><p>In Review, select Try this example to edit fictional inputs. Run the example and inspect the result in Preview{recipe.knowledge.length ? ', including the cited sources' : ''}.</p></div></li>
      <li><span>03</span><div><strong>Demonstrate the expected behaviour</strong><p>Complete the named examples{recipe.tools.length ? ' and confirmations' : ''}. In Evaluate, compare outcomes with the expected behaviour. Publish provides an implementation brief, not a deployed agent.</p></div></li>
    </ol>
    <p className="scenario-simulation-note">{recipe.implementation.at(-1)?.description}</p>
  </section>
}

export function ScenarioDetails({ entry, onClose }: { entry: ScenarioEntry; onClose: () => void }) {
  const { story, recipe } = entry
  const url = story?.sourceUrl ?? recipe?.sourceUrl
  return <Modal title={entry.name} eyebrow={recipe?.industry ?? 'Business scenario'} wide className="scenario-dialog" onClose={onClose}>
    <div className="modal-body scenario-dialog-body">
      {story ? <BusinessStory story={story} /> : <p>{recipe?.summary}</p>}
      {recipe ? <LearningPreview recipe={recipe} story={story} /> : <p className="scenario-first-step">No interactive recipe is available for this scenario yet.</p>}
      {url && <div className="scenario-story-footer"><a href={url} target="_blank" rel="noopener noreferrer">
        {story?.sourceLabel ?? (story ? 'Microsoft scenario inspiration' : 'Recipe reference')} <ArrowUpRight20Regular aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
      </a></div>}
    </div>
    <div className="modal-footer">
      {recipe && <RecipeMeta recipe={recipe} />}
      {recipe ? <a className="button primary" href={recipeHref(recipe.id, 'preview')} title="Open this agent's Preview chat">Cook this recipe <ArrowRight20Regular aria-hidden="true" /></a>
        : <button className="button secondary" type="button" onClick={onClose}>Back to scenarios</button>}
    </div>
  </Modal>
}

export function ScenarioExplorer({ recipes }: { recipes: CompiledRecipe[] }) {
  const entries = getScenarioEntries(recipes, import.meta.env.DEV && import.meta.env.MODE === 'local-recipes')
  const journeys = [...new Set(entries.flatMap(({ story }) => story?.group ? [story.group.journey] : []))]
  const [filter, setFilter] = useState('all')
  const [categories, setCategories] = useState(allCategories)
  const [sortBy, setSortBy] = useState<ClassificationField | ''>('')
  const [selected, setSelected] = useState<ScenarioEntry | null>(null)
  const visible = entries.filter(({ story, recipe }) => matchesCategories(recipe, categories)
    && (filter === 'all' || (story?.group ? `journey:${story.group.journey}` : 'standalone') === filter))
  if (sortBy) visible.sort((a, b) => compareCategories(a.recipe, b.recipe, sortBy) || a.name.localeCompare(b.name))
  return <div className="scenario-explorer">
    <nav className="scenario-breadcrumbs" aria-label="Scenario navigation"><a href="#/"><ArrowLeft20Regular aria-hidden="true" />Home</a><a href="#/agents">Browse agents <ArrowRight20Regular aria-hidden="true" /></a></nav>
    <header className="scenario-hero">
      <span className="scenario-kicker">AGENTS COOKBOOK</span><h1>Scenarios</h1>
      <p>Explore business challenges across industries. Choose an agent to read its story and see what you'll practise before you cook the recipe.</p>
    </header>
    <section className="scenario-library" aria-labelledby="scenario-library-heading">
      <h2 id="scenario-library-heading">Start with a recipe</h2>
      <div className="catalog-filters">
        <CatalogFilters recipes={entries.flatMap(entry => entry.recipe ? [entry.recipe] : [])} value={categories} onChange={setCategories} />
        {journeys.length > 0 && <label>Explore by journey
          <select id="scenario-journey-filter" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All scenarios</option><option value="standalone">Standalone scenarios</option>
            {journeys.map(name => <option key={name} value={`journey:${name}`}>{name}</option>)}
          </select></label>}
        <label>Sort by<select value={sortBy} onChange={({ target: { value } }) => setSortBy(value === 'difficulty' || value === 'industry' ? value : '')}>
          <option value="">Catalogue order</option><option value="difficulty">Difficulty (easiest first)</option><option value="industry">Industry (A to Z)</option>
        </select></label>
        <span role="status">{visible.length} {visible.length === 1 ? 'scenario' : 'scenarios'} shown</span>
      </div>
      <div className="scenario-cards">{visible.map(entry => <ScenarioCard key={entry.id} entry={entry} onSelect={setSelected} />)}</div>
      {!visible.length && <div className="agents-empty"><h3>No matching scenarios</h3><button className="button secondary" type="button" onClick={() => { setCategories(allCategories); setFilter('all') }}>Clear filters</button></div>}
    </section>
    <aside className="scenario-source-note" aria-label="About these scenarios"><BookOpen20Regular aria-hidden="true" /><div><h2>Sources and scope</h2>
      <p>Each scenario identifies its source and what the exercise simulates. Examples use fictional data; potential benefits are not measured results. {recipeDurationHint}</p>
    </div></aside>
    {selected && <ScenarioDetails entry={selected} onClose={() => setSelected(null)} />}
  </div>
}
