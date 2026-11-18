import { useState } from 'react'
import {
  Add20Regular, ArrowDown16Regular, ArrowRight20Regular, ArrowUp16Regular,
  BookOpen20Regular, Checkmark16Regular, ChevronRight20Regular, Clock16Regular,
  Dismiss16Regular, Search20Regular, ShieldCheckmark20Regular,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Recipe } from '../domain/types.ts'
import { filterRecipes, orderHomeRecipes, recipeDuration, recipeDurationHint } from '../domain/catalog.ts'
import { getRecipeScenario } from '../content/scenarios.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { StudioNavigation } from './StudioNavigation.tsx'
import { StudioNavigationIcon } from './StudioNavigationIcon.tsx'
import { Modal } from './Modal.tsx'
import { ScenarioExplorer } from './ScenarioExplorer.tsx'

export function RecipeIcon({ icon, size = 25 }: { icon: Recipe['accentIcon']; size?: number }) {
  return <AgentIconGraphic icon={icon} size={size} />
}

function RecipeCards({ recipes }: { recipes: CompiledRecipe[] }) {
  return (
    <div className="home-recipes">
      {orderHomeRecipes(recipes).map(recipe => {
        const overview = getRecipeScenario(recipe)?.home
        return (
        <article className="home-recipe" key={recipe.id}>
          {recipe.id === 'citizen-qa' && <span className="home-start-badge">Recommended first</span>}
          <div className="home-recipe-heading">
            <span className="square-icon"><RecipeIcon icon={recipe.accentIcon} /></span>
            <div><span className="home-recipe-industry">{recipe.industry}</span><h3><a href={`#/recipes/${encodeURIComponent(recipe.id)}`}>{recipe.title}</a></h3></div>
            <span className="beta-badge">BETA</span>
          </div>
          <p>{overview?.challenge ?? recipe.summary}</p>
          <div className="home-recipe-meta"><span title={recipeDurationHint}><Clock16Regular aria-hidden="true" />{recipeDuration(recipe)}</span><span>{recipe.difficulty === 'beginner' ? 'Beginner' : 'Intermediate'}</span></div>
          {overview && <><dl className="home-recipe-overview"><div><dt>What you'll try</dt><dd>{overview.experiment}</dd></div><div><dt>What you'll learn</dt><dd>{overview.takeaway}</dd></div></dl><p className="home-recipe-scope"><strong>Scope:</strong> {overview.scope}</p></>}
          <details className="home-recipe-goals"><summary>Learning objectives</summary><ul>{recipe.learningGoals.map(goal => <li key={goal}><Checkmark16Regular aria-hidden="true" />{goal}</li>)}</ul></details>
          <a className="text-button" href={`#/recipes/${encodeURIComponent(recipe.id)}`} aria-label={`Start recipe: ${recipe.title}`}>Start recipe <ArrowRight20Regular aria-hidden="true" /></a>
        </article>
      )})}
      {recipes.length === 0 && <div className="empty-state"><BookOpen20Regular aria-hidden="true" /><h3>New recipes are on the way.</h3><p>Published learning recipes will appear here.</p></div>}
    </div>
  )
}

function Home({ recipes }: { recipes: CompiledRecipe[] }) {
  const [query, setQuery] = useState('')
  return (
    <div className="cookbook-home">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title">Learn by <span>building.</span></h1>
        <div className="home-subtitle"><h2>A good agent starts with a good recipe.</h2><span className="home-credit-note"><ShieldCheckmark20Regular aria-hidden="true" />Practise with fictional data</span></div>
        <p className="home-intro-description">Explore how Copilot Studio agents could help with everyday service challenges. Each recipe is a guided simulation: connect example sources, change fictional inputs and see why the result changes.</p>
        <p className="home-intro-note">No coding or Copilot Studio account needed. You practise here; nothing is deployed.</p>
        <form className="home-search" role="search" onSubmit={event => { event.preventDefault(); window.location.hash = `/agents?search=${encodeURIComponent(query.trim())}` }}>
          <Search20Regular aria-hidden="true" />
          <input type="search" aria-label="Find an agent recipe" placeholder="Search recipes by name or topic" value={query} onChange={event => setQuery(event.target.value)} />
          <button type="submit" className="icon-button" aria-label="Search agent recipes"><ArrowRight20Regular aria-hidden="true" /></button>
        </form>
        <div className="home-build-options">
          <a className="home-build-option" href="#/agents">
            <span className="home-option-art"><StudioNavigationIcon name="agents" /></span>
            <strong>Agent</strong><span>Choose a guided exercise, change inputs and inspect the results.</span>
          </a>
          <button className="home-build-option" type="button" disabled title="Workflows are not simulated in this cookbook">
            <span className="home-option-art"><StudioNavigationIcon name="workflows" /></span>
            <strong>Workflow</strong><span>Shown for orientation. Workflow authoring is not part of this cookbook.</span><small>Not available here</small>
          </button>
          <button className="home-build-option" type="button" disabled title="Apps are not simulated in this cookbook">
            <span className="home-option-art"><StudioNavigationIcon name="apps" /></span>
            <strong>App <span>(preview)</span></strong><span>Shown for orientation. App building is not part of this cookbook.</span><small>Not available here</small>
          </button>
        </div>
        <a className="home-explore-banner" href="#/scenarios"><div><span className="home-explore-kicker">START WITH THE BUSINESS PROBLEM</span><strong>Explore what's possible with agents</strong><span>See the challenge. Understand the impact. Discover how an agent could help.</span></div><span className="home-explore-arrow"><ArrowRight20Regular aria-hidden="true" /></span></a>
        <div className="home-assurances"><span><Checkmark16Regular aria-hidden="true" />No sign-up</span><span><Checkmark16Regular aria-hidden="true" />Saved in this browser</span><span><Checkmark16Regular aria-hidden="true" />No generative AI</span></div>
      </section>
      <section className="home-library" aria-labelledby="home-recipes-title">
        <div className="home-section-heading"><h2 id="home-recipes-title">Start with a recipe</h2><a className="text-button" href="#/agents">View all agents <ChevronRight20Regular aria-hidden="true" /></a></div>
        <p className="home-library-intro">{recipes.some(recipe => recipe.id === 'citizen-qa') ? <>New here? Start with <a href="#/recipes/citizen-qa">Citizen Q&amp;A</a> for sources, citations and human handoff. Then choose the challenge that interests you.</> : 'Choose a service challenge and explore it at your own pace.'}</p>
        <p className="home-library-help">Open <strong>Review</strong> for your next step. Select <strong>Try this example</strong> to edit fictional inputs, then <strong>Run example</strong> to see the result in <strong>Preview</strong>. Use <strong>Evaluate</strong> to compare results with the expected behaviour.</p>
        <p className="home-time-note">{recipeDurationHint}</p>
        <RecipeCards recipes={recipes} />
        <p className="home-next-step"><strong>Take the learning further.</strong> Each recipe includes implementation guidance and a downloadable planning brief for a real Copilot Studio project. The brief is not a deployable agent; real connections, permissions and publishing must be configured separately.</p>
      </section>
    </div>
  )
}

function Agents({ recipes, initialSearch }: { recipes: CompiledRecipe[]; initialSearch: string }) {
  const [query, setQuery] = useState(initialSearch)
  const [descending, setDescending] = useState(false)
  const filtered = filterRecipes(recipes, query).sort((a, b) => (descending ? -1 : 1) * a.title.localeCompare(b.title))
  return (
    <section className="cookbook-agents" aria-labelledby="agents-title">
      <div className="agents-heading">
        <div className="agents-heading-title"><h1 id="agents-title">Agents</h1><span role="status">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span></div>
        <div className="agents-heading-actions">
          <div className="search-field agents-search"><Search20Regular aria-hidden="true" /><input type="search" aria-label="Search agents" placeholder="Search agents" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => setQuery('')}><Dismiss16Regular aria-hidden="true" /></button>}</div>
          <button className="button primary" type="button" disabled title="Agents are added by cookbook maintainers. Open a recipe to practise."><Add20Regular aria-hidden="true" />New agent</button>
        </div>
      </div>
      <p className="agents-description">All agents in the cookbook. Open a recipe to build, preview, and learn in a simulated environment.</p>
      <div className="agents-table-container" role="region" aria-label="Agents list" tabIndex={0}>
        <table className="agents-table">
          <caption className="sr-only">Cookbook agents</caption>
          <thead><tr>
            <th scope="col" aria-sort={descending ? 'descending' : 'ascending'}><button type="button" onClick={() => setDescending(!descending)}>Name {descending ? <ArrowDown16Regular aria-hidden="true" /> : <ArrowUp16Regular aria-hidden="true" />}</button></th>
            <th scope="col">Level</th><th scope="col">Industry</th><th scope="col">Duration</th><th scope="col">Agent harness</th>
          </tr></thead>
          <tbody>{filtered.map(recipe => <tr key={recipe.id}>
            <th scope="row"><a className="agents-name" href={`#/recipes/${encodeURIComponent(recipe.id)}`}><span className="square-icon"><RecipeIcon icon={recipe.accentIcon} size={21} /></span><span><strong>{recipe.title}</strong><span>{recipe.summary}</span></span></a></th>
            <td>{recipe.difficulty === 'beginner' ? 'Beginner' : 'Intermediate'}</td>
            <td>{recipe.industry}</td><td title={recipeDurationHint}>{recipeDuration(recipe)}</td><td><span className="agents-harness">Cookbook simulation</span></td>
          </tr>)}</tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="agents-empty"><Search20Regular aria-hidden="true" /><h2>{recipes.length ? 'No matching agents' : 'New recipes are on the way'}</h2><p>{recipes.length ? 'Try another name, industry, or topic.' : 'Published learning recipes will appear here.'}</p>{query && <button type="button" className="button secondary" onClick={() => setQuery('')}>Clear search</button>}</div>}
    </section>
  )
}

export function Catalog({ recipes, page, initialSearch = '' }: { recipes: CompiledRecipe[]; page: 'home' | 'agents' | 'scenarios'; initialSearch?: string }) {
  const [showEnvironment, setShowEnvironment] = useState(false)
  return (
    <div className="harness-shell cookbook-shell">
      <a className="skip-link" href="#catalog-main" onClick={event => { event.preventDefault(); document.getElementById('catalog-main')?.focus() }}>Skip to content</a>
      <StudioNavigation activePage={page === 'scenarios' ? undefined : page} initiallyExpanded={page !== 'agents'} onEnvironment={() => setShowEnvironment(true)} />
      <div className="cookbook-content">
        <header className="cookbook-topbar"><div><BookOpen20Regular aria-hidden="true" /><span><strong>Independent educational simulation.</strong> Not affiliated with Microsoft. Use fictional data only.</span></div></header>
        <main className="cookbook-main" id="catalog-main" tabIndex={-1}>
          {page === 'home' ? <Home recipes={recipes} /> : page === 'scenarios' ? <ScenarioExplorer recipes={recipes} /> : <Agents recipes={recipes} initialSearch={initialSearch} />}
          <footer className="cookbook-footer"><span>Copilot Studio Agents Cookbook · An independent learning experience.</span><span>Not an official Microsoft product. All connections and actions are simulated.</span></footer>
        </main>
      </div>
      {showEnvironment && <Modal title="Your local learning environment" onClose={() => setShowEnvironment(false)}><div className="modal-body"><p>This independent educational simulator uses fictional data and deterministic rules. It is not connected to a real environment or account.</p><p className="environment-note">Your configuration and exercise history stay in this browser. Do not enter personal or confidential data. No generative AI, external connections, or real publications are performed.</p></div><div className="modal-footer"><span className="fine-print">No account required.</span><button className="button secondary" type="button" onClick={() => setShowEnvironment(false)}>Close</button></div></Modal>}
    </div>
  )
}
