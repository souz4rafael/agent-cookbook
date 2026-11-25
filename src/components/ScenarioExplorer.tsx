import { useState } from 'react'
import { ArrowLeft20Regular, ArrowRight20Regular, ArrowUpRight20Regular, BookOpen20Regular, CheckmarkCircle20Regular, Clock16Regular } from '@fluentui/react-icons'
import type { CompiledRecipe } from '../domain/types.ts'
import { getBusinessScenarios, getScenarioRecipe, scenarioLibraryUrl } from '../content/scenarios.ts'
import type { BusinessScenario } from '../content/scenarios.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { recipeDuration, recipeDurationHint, recipeLevel } from '../domain/catalog.ts'
import { RecipeLearningSummary } from './RecipeLearningSummary.tsx'
import './ScenarioExplorer.css'

function RecipeLearningPreview({ recipe, scenario }: { recipe: CompiledRecipe; scenario: BusinessScenario }) {
  const examples = recipe.lab?.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length).slice(0, 3)
  return (
    <section className="scenario-recipe-preview" aria-labelledby={`${recipe.id}-exercise-title`}>
      <div className="scenario-recipe-intro">
        <span className="scenario-kicker">FROM BUSINESS IDEA TO A FIRST AGENT</span>
        <h3 id={`${recipe.id}-exercise-title`}>Change an input. See what changes.</h3>
        <RecipeLearningSummary overview={scenario.home} />
        <div className="scenario-example-questions"><strong>{recipe.knowledge.length ? 'Examples to explore after configuring the sources' : 'Examples to explore with the supplied skill rules'}</strong><ul>{(examples?.map(item => item.title) ?? recipe.test.suggestedQuestions.slice(0, 3)).map(title => <li key={title}>{title}</li>)}</ul></div>
      </div>
      <ol className="scenario-recipe-steps">
        <li><span>01</span><div><strong>{recipe.knowledge.length || recipe.tools.length ? 'Configure the exercise' : 'Inspect the skill and its scope'}</strong><p>{recipe.knowledge.length > 0 && 'In Build, connect the library and select the documents for this exercise. '}{recipe.tools.length > 0 && 'Connect and enable the tool to explore the simulated action. '}{!recipe.knowledge.length && !recipe.tools.length && 'Open Skills in Build to see which behaviour is simulated and which skills are reference-only. No connections are needed. '}Inspect the exercise rules in Review; find real-product implementation guidance in Publish.</p></div></li>
        <li><span>02</span><div><strong>Change data and inspect the evidence</strong><p>In Review, select Try this example to choose and edit fictional inputs. Run it to see the result in the Preview chat, compare outcomes{recipe.knowledge.length ? ', open citations' : ''} and review the finding or draft.</p></div></li>
        <li><span>03</span><div><strong>Demonstrate the expected behaviour</strong><p>Complete the specific examples{recipe.tools.length ? ' and confirmations' : ''} in Review, then pass the declared checks in Evaluate. No real messages, decisions or deployments occur.</p></div></li>
      </ol>
      <div className="scenario-recipe-action"><a className="button primary" href={`#/recipes/${encodeURIComponent(recipe.id)}`}>Try this recipe <ArrowRight20Regular aria-hidden="true" /></a><span title={recipeDurationHint}><Clock16Regular aria-hidden="true" />{recipeDuration(recipe)} · {recipeLevel(recipe)} · No sign-up</span></div>
      <p className="scenario-simulation-note">{recipe.implementation.at(-1)?.description}</p>
    </section>
  )
}

export function ScenarioExplorer({ recipes }: { recipes: CompiledRecipe[] }) {
  const includeDrafts = import.meta.env.DEV && import.meta.env.MODE === 'local-recipes'
  const stories = getBusinessScenarios(recipes, includeDrafts)
  const availableCount = stories.filter(scenario => getScenarioRecipe(scenario, recipes, includeDrafts)).length
  const journeys = [...new Set(stories.flatMap(scenario => scenario.group ? [scenario.group.journey] : []))]
  const [filter, setFilter] = useState('all')
  const visible = stories.filter(scenario => filter === 'all' || (scenario.group ? `journey:${scenario.group.journey}` : 'standalone') === filter)
  function showScenario(id: string) {
    const heading = document.getElementById(`scenario-${id}`)
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start' })
  }
  return (
    <div className="scenario-explorer">
      <nav className="scenario-breadcrumbs" aria-label="Scenario navigation"><a href="#/"><ArrowLeft20Regular aria-hidden="true" />Home</a><a href="#/agents">Browse agents <ArrowRight20Regular aria-hidden="true" /></a></nav>
      <header className="scenario-hero">
        <span className="scenario-kicker">PUBLIC SERVICES &amp; WORKPLACE SCENARIOS</span>
        <h1>Start with a real problem.<br /><span>See what an agent could change.</span></h1>
        <p>You do not need to transform an entire service to get started. Explore an everyday challenge, understand why it matters and see how a focused Copilot Studio agent could help.</p>
        <div className="scenario-hero-meta"><span>{stories.length} business scenarios</span><span><CheckmarkCircle20Regular aria-hidden="true" />{availableCount} interactive {availableCount === 1 ? 'recipe' : 'recipes'} available</span></div>
      </header>
      {journeys.length > 0 && <div className="scenario-filter">
        <label htmlFor="scenario-journey-filter">Explore by journey</label>
        <select id="scenario-journey-filter" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All scenarios</option>
          <option value="standalone">Standalone scenarios</option>
          {journeys.map(name => <option key={name} value={`journey:${name}`}>{name}</option>)}
        </select>
        <span role="status">{visible.length} scenarios shown</span>
      </div>}
      <nav className="scenario-shortcuts" aria-label="Choose a business scenario">
        {visible.map(scenario => <button key={scenario.id} type="button" onClick={() => showScenario(scenario.id)}><AgentIconGraphic icon={scenario.icon} size={22} /><span>{scenario.name}</span><ArrowRight20Regular aria-hidden="true" /></button>)}
      </nav>
      <div className="scenario-stories">
        {visible.map(scenario => {
          const recipe = getScenarioRecipe(scenario, recipes, includeDrafts)
          return (
            <article key={scenario.id} className={`scenario-story${recipe ? ' scenario-story-ready' : ''}`} aria-labelledby={`scenario-${scenario.id}`}>
              <header className="scenario-story-header">
                <span className="scenario-story-icon"><AgentIconGraphic icon={scenario.icon} size={28} /></span>
                <div><span className="scenario-kicker">{scenario.group && `${scenario.group.journey} · ${scenario.group.perspective === 'guidance' ? 'Guidance and service' : 'Operational support'} · `}{scenario.name}</span><h2 id={`scenario-${scenario.id}`} tabIndex={-1}>{scenario.headline}</h2><p>{scenario.summary}</p></div>
                <span className={`scenario-availability${recipe ? ' ready' : ''}`}>{recipe ? <><CheckmarkCircle20Regular aria-hidden="true" />{recipe.status === 'draft' ? 'Local draft' : 'Try it now'}</> : 'Scenario only'}</span>
              </header>
              <div className="scenario-business-story">
                <section><span className="scenario-section-number">01</span><h3>The problem</h3><p>{scenario.problem}</p></section>
                <section><span className="scenario-section-number">02</span><h3>Why it matters</h3><p>{scenario.impact}</p></section>
                <section><span className="scenario-section-number">03</span><h3>How an agent helps</h3><p>{scenario.approach}</p></section>
              </div>
              <div className="scenario-first-step"><BookOpen20Regular aria-hidden="true" /><div><h3>Start small</h3><p>{scenario.startSmall}</p></div></div>
              <div className="scenario-value"><div><h3>What better could look like</h3><p>{scenario.potentialValue}</p></div><div><h3>How to measure progress</h3><p>{scenario.measure}</p></div></div>
              <p className="scenario-boundary"><strong>Keep the scope clear.</strong> {scenario.boundary}</p>
              {recipe && <RecipeLearningPreview recipe={recipe} scenario={scenario} />}
              <footer className="scenario-story-footer">
                {!recipe && <span>Business inspiration. No interactive recipe is available for this scenario yet.</span>}
                <a href={scenario.sourceUrl} target="_blank" rel="noopener noreferrer">{scenario.sourceLabel ?? 'Microsoft scenario inspiration'} <ArrowUpRight20Regular aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
              </footer>
            </article>
          )
        })}
      </div>
      <aside className="scenario-source-note" aria-label="About these scenarios"><BookOpen20Regular aria-hidden="true" /><div><h2>Sources and scope</h2><p>The four original public-service stories draw on the <a href={scenarioLibraryUrl} target="_blank" rel="noopener noreferrer">Microsoft Adoption Government scenario library<span className="sr-only"> (opens in a new tab)</span></a>. The ten public-sector journeys pair a service guide with an operational exercise. Four further recipes credit their Copilot Studio Gallery sources. All exercises use fictional data; product documentation is not evidence of municipal policy or measured results.</p><p>Recipe times use a simple estimate of one minute per guided step, not measured completion times or real deployment effort.</p></div></aside>
    </div>
  )
}
