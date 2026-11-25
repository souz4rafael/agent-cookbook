import { useState } from 'react'
import {
  Add20Regular, ArrowDown16Regular, ArrowRight20Regular, ArrowSort16Regular, ArrowUp16Regular,
  BookOpen20Regular, Checkmark16Regular,
  Dismiss16Regular, Search20Regular, ShieldCheckmark20Regular,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Recipe } from '../domain/types.ts'
import { compareCategories, entryForRecipe, filterRecipes, recipeDuration, recipeDurationHint, recipeHarness, recipeLevel } from '../domain/catalog.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { StudioNavigation } from './StudioNavigation.tsx'
import { StudioNavigationIcon } from './StudioNavigationIcon.tsx'
import { Modal } from './Modal.tsx'
import { ScenarioDetails, ScenarioExplorer } from './ScenarioExplorer.tsx'

export function RecipeIcon({ icon, size = 25 }: { icon: Recipe['accentIcon']; size?: number }) {
  return <AgentIconGraphic icon={icon} size={size} />
}

function Home() {
  const [query, setQuery] = useState('')
  return (
    <div className="cookbook-home">
      <section className="home-intro" aria-labelledby="home-title">
        <h1 id="home-title">Learn by <span>building.</span></h1>
        <div className="home-subtitle"><h2>A good agent starts with a good recipe.</h2><span className="home-credit-note"><ShieldCheckmark20Regular aria-hidden="true" />Practise with fictional data</span></div>
        <p className="home-intro-description">Explore how Copilot Studio agents could help with everyday work. Each recipe is a guided simulation: connect example sources, change fictional inputs and see why the result changes.</p>
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
        <a className="home-explore-banner" href="#/scenarios"><div><span className="home-explore-kicker">START WITH THE BUSINESS PROBLEM</span><strong>Explore scenarios</strong><span>Choose an agent to see the challenge, what you'll try and what you'll learn.</span></div><span className="home-explore-arrow"><ArrowRight20Regular aria-hidden="true" /></span></a>
        <div className="home-assurances"><span><Checkmark16Regular aria-hidden="true" />No sign-up</span><span><Checkmark16Regular aria-hidden="true" />Saved in this browser</span><span><Checkmark16Regular aria-hidden="true" />No generative AI</span></div>
      </section>
    </div>
  )
}

const sortableColumns = [['name', 'Name'], ['difficulty', 'Difficulty'], ['industry', 'Industry'], ['duration', 'Duration'], ['harness', 'Agent harness']] as const

function Agents({ recipes, initialSearch }: { recipes: CompiledRecipe[]; initialSearch: string }) {
  const [query, setQuery] = useState(initialSearch)
  const [sort, setSort] = useState<{ field: typeof sortableColumns[number][0]; descending: boolean }>({ field: 'name', descending: false })
  const [selected, setSelected] = useState<CompiledRecipe | null>(null)
  const filtered = filterRecipes(recipes, query).sort((a, b) => {
    const byName = a.title.localeCompare(b.title)
    const primary = sort.field === 'name' ? byName
      : sort.field === 'duration' ? a.estimatedMinutes - b.estimatedMinutes
      : sort.field === 'harness' ? recipeHarness(a).localeCompare(recipeHarness(b))
      : compareCategories(a, b, sort.field)
    return (sort.descending ? -primary : primary) || byName
  })
  return (
    <section className="cookbook-agents" aria-labelledby="agents-title">
      <div className="agents-heading">
        <div className="agents-heading-title"><h1 id="agents-title">Agents</h1><span role="status">{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</span></div>
        <div className="agents-heading-actions">
          <div className="search-field agents-search"><Search20Regular aria-hidden="true" /><input type="search" aria-label="Search agents" placeholder="Search agents" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => setQuery('')}><Dismiss16Regular aria-hidden="true" /></button>}</div>
          <button className="button primary" type="button" disabled title="Agents are added by cookbook maintainers. Open a recipe to practise."><Add20Regular aria-hidden="true" />New agent</button>
        </div>
      </div>
      <p className="agents-description">The Cookbook classifies the source package, or the recipe if there is no package: Web browsing under Additional settings means Copilot Chat; otherwise, Topics means Standard Harness and no Topics means Copilot Harness.</p>
      <div className="agents-table-container" role="region" aria-label="Agents list" tabIndex={0}>
        <table className="agents-table">
          <caption className="sr-only">Cookbook agents</caption>
          <thead><tr>
            {sortableColumns.map(([field, label]) => <th key={field} scope="col" aria-sort={sort.field === field ? (sort.descending ? 'descending' : 'ascending') : undefined}>
              <button type="button" title={`Sort by ${label.toLowerCase()}`} onClick={() => setSort({ field, descending: sort.field === field && !sort.descending })}>
                {label}
                {sort.field !== field ? <ArrowSort16Regular aria-hidden="true" /> : sort.descending ? <ArrowDown16Regular aria-hidden="true" /> : <ArrowUp16Regular aria-hidden="true" />}
              </button></th>)}
          </tr></thead>
          <tbody>{filtered.map(recipe => <tr key={recipe.id}>
            <th scope="row"><button type="button" className="agents-name" aria-label={`View scenario: ${recipe.title}`} aria-haspopup="dialog" onClick={() => setSelected(recipe)}><span className="square-icon"><RecipeIcon icon={recipe.accentIcon} size={21} /></span><span><strong>{recipe.title}</strong><span>{recipe.summary}</span></span></button></th>
            <td>{recipeLevel(recipe)}</td>
            <td>{recipe.industry}</td><td title={recipeDurationHint}>{recipeDuration(recipe)}</td>
            <td>{recipe.harnessFeatures?.sourceUrl ? <a className="agents-harness" href={recipe.harnessFeatures.sourceUrl} target="_blank" rel="noopener noreferrer">{recipeHarness(recipe)}<span className="sr-only">: source for {recipe.title} (opens in a new tab)</span></a> : <span className="agents-harness" title="Based on this Cookbook recipe">{recipeHarness(recipe)}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="agents-empty"><Search20Regular aria-hidden="true" /><h2>{recipes.length ? 'No matching agents' : 'New recipes are on the way'}</h2><p>{recipes.length ? 'Try another name, industry, or topic.' : 'Published learning recipes will appear here.'}</p>{query && <button type="button" className="button secondary" onClick={() => setQuery('')}>Clear search</button>}</div>}
      {selected && <ScenarioDetails entry={entryForRecipe(selected)} onClose={() => setSelected(null)} />}
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
          {page === 'home' ? <Home /> : page === 'scenarios' ? <ScenarioExplorer recipes={recipes} /> : <Agents recipes={recipes} initialSearch={initialSearch} />}
          <footer className="cookbook-footer"><span>Copilot Studio Agents Cookbook · An independent learning experience.</span><span>Not an official Microsoft product. All connections and actions are simulated.</span></footer>
        </main>
      </div>
      {showEnvironment && <Modal title="Your local learning environment" onClose={() => setShowEnvironment(false)}><div className="modal-body"><p>This independent educational simulator uses fictional data and deterministic rules. It is not connected to a real environment or account.</p><p className="environment-note">Your configuration and exercise history stay in this browser. Do not enter personal or confidential data. No generative AI, external connections, or real publications are performed.</p></div><div className="modal-footer"><span className="fine-print">No account required.</span><button className="button secondary" type="button" onClick={() => setShowEnvironment(false)}>Close</button></div></Modal>}
    </div>
  )
}
