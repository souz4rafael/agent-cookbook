import { ArrowLeft20Regular, ArrowRight20Regular, ArrowUpRight20Regular, BookOpen20Regular, CheckmarkCircle20Regular, Clock16Regular } from '@fluentui/react-icons'
import type { CompiledRecipe } from '../domain/types.ts'
import { businessScenarios, getScenarioRecipe, scenarioLibraryUrl } from '../content/scenarios.ts'
import { AgentIconGraphic } from './AgentIcon.tsx'
import { recipeDuration, recipeDurationHint } from '../domain/catalog.ts'
import './ScenarioExplorer.css'

function RecipeLearningPreview({ recipe }: { recipe: CompiledRecipe }) {
  const examples = recipe.lab?.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length).slice(0, 3)
  return (
    <section className="scenario-recipe-preview" aria-labelledby={`${recipe.id}-exercise-title`}>
      <div className="scenario-recipe-intro">
        <span className="scenario-kicker">FROM BUSINESS IDEA TO A FIRST AGENT</span>
        <h3 id={`${recipe.id}-exercise-title`}>Change an input. See what changes.</h3>
        <p>{recipe.lab?.description ?? recipe.summary}</p>
        <div className="scenario-example-questions"><strong>{recipe.knowledge.length ? 'Examples to explore after configuring the sources' : 'Examples to explore with the supplied skill rules'}</strong><ul>{(examples?.map(item => item.title) ?? recipe.test.suggestedQuestions.slice(0, 3)).map(title => <li key={title}>{title}</li>)}</ul></div>
      </div>
      <ol className="scenario-recipe-steps">
        <li><span>01</span><div><strong>{recipe.knowledge.length || recipe.tools.length ? 'Configure the sources and actions' : 'Inspect the skill and its scope'}</strong><p>{recipe.knowledge.length || recipe.tools.length ? 'Select the policy sources and enable the fictional tools in Build.' : 'Open Skills in Build to see which behaviour is simulated and which skills are reference-only. No connections are needed.'} Inspect the exercise rules in Review; find real-product implementation guidance in Publish.</p></div></li>
        <li><span>02</span><div><strong>Change data and inspect the evidence</strong><p>In Review, select Try this example to choose and edit fictional inputs. Run it to see the result in the Preview chat, compare outcomes{recipe.knowledge.length ? ', open citations' : ''} and review the finding or draft.</p></div></li>
        <li><span>03</span><div><strong>Demonstrate the expected behaviour</strong><p>Complete the specific examples{recipe.tools.length ? ' and confirmations' : ''} in Review, then pass the declared checks in Evaluate. No real messages, decisions or deployments occur.</p></div></li>
      </ol>
      <div className="scenario-recipe-action"><a className="button primary" href={`#/recipes/${encodeURIComponent(recipe.id)}`}>Try this recipe <ArrowRight20Regular aria-hidden="true" /></a><span title={recipeDurationHint}><Clock16Regular aria-hidden="true" />{recipeDuration(recipe)} · {recipe.difficulty === 'beginner' ? 'Beginner' : 'Intermediate'} · No sign-up</span></div>
      <p className="scenario-simulation-note">{recipe.implementation.at(-1)?.description}</p>
    </section>
  )
}

export function ScenarioExplorer({ recipes }: { recipes: CompiledRecipe[] }) {
  const availableCount = businessScenarios.filter(scenario => getScenarioRecipe(scenario, recipes)).length
  function showScenario(id: string) {
    const heading = document.getElementById(`scenario-${id}`)
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start' })
  }
  return (
    <div className="scenario-explorer">
      <nav className="scenario-breadcrumbs" aria-label="Scenario navigation"><a href="#/"><ArrowLeft20Regular aria-hidden="true" />Home</a><a href="#/agents">Browse agents <ArrowRight20Regular aria-hidden="true" /></a></nav>
      <header className="scenario-hero">
        <span className="scenario-kicker">PUBLIC SERVICES &amp; CUSTOMER SERVICE</span>
        <h1>Start with a real problem.<br /><span>See what an agent could change.</span></h1>
        <p>You do not need to transform an entire service to get started. Explore an everyday challenge, understand why it matters and see how a focused Copilot Studio agent could help.</p>
        <div className="scenario-hero-meta"><span>{businessScenarios.length} business scenarios</span><span><CheckmarkCircle20Regular aria-hidden="true" />{availableCount} interactive {availableCount === 1 ? 'recipe' : 'recipes'} available</span></div>
      </header>
      <nav className="scenario-shortcuts" aria-label="Choose a business scenario">
        {businessScenarios.map(scenario => <button key={scenario.id} type="button" onClick={() => showScenario(scenario.id)}><AgentIconGraphic icon={scenario.icon} size={22} /><span>{scenario.name}</span><ArrowRight20Regular aria-hidden="true" /></button>)}
      </nav>
      <div className="scenario-stories">
        {businessScenarios.map(scenario => {
          const recipe = getScenarioRecipe(scenario, recipes)
          return (
            <article key={scenario.id} className={`scenario-story${recipe ? ' scenario-story-ready' : ''}`} aria-labelledby={`scenario-${scenario.id}`}>
              <header className="scenario-story-header">
                <span className="scenario-story-icon"><AgentIconGraphic icon={scenario.icon} size={28} /></span>
                <div><span className="scenario-kicker">{scenario.name}</span><h2 id={`scenario-${scenario.id}`} tabIndex={-1}>{scenario.headline}</h2><p>{scenario.summary}</p></div>
                <span className={`scenario-availability${recipe ? ' ready' : ''}`}>{recipe ? <><CheckmarkCircle20Regular aria-hidden="true" />Try it now</> : 'Scenario only'}</span>
              </header>
              <div className="scenario-business-story">
                <section><span className="scenario-section-number">01</span><h3>The problem</h3><p>{scenario.problem}</p></section>
                <section><span className="scenario-section-number">02</span><h3>Why it matters</h3><p>{scenario.impact}</p></section>
                <section><span className="scenario-section-number">03</span><h3>How an agent helps</h3><p>{scenario.approach}</p></section>
              </div>
              <div className="scenario-first-step"><BookOpen20Regular aria-hidden="true" /><div><h3>Start small</h3><p>{scenario.startSmall}</p></div></div>
              <div className="scenario-value"><div><h3>What better could look like</h3><p>{scenario.potentialValue}</p></div><div><h3>How to measure progress</h3><p>{scenario.measure}</p></div></div>
              <p className="scenario-boundary"><strong>Keep the scope clear.</strong> {scenario.boundary}</p>
              {recipe && <RecipeLearningPreview recipe={recipe} />}
              <footer className="scenario-story-footer">
                {!recipe && <span>Business inspiration. No interactive recipe is available for this scenario yet.</span>}
                <a href={scenario.sourceUrl} target="_blank" rel="noopener noreferrer">{scenario.sourceLabel ?? 'Microsoft scenario inspiration'} <ArrowUpRight20Regular aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
              </footer>
            </article>
          )
        })}
      </div>
      <aside className="scenario-source-note" aria-label="About these scenarios"><BookOpen20Regular aria-hidden="true" /><div><h2>Inspired by Microsoft. Written for hands-on learning.</h2><p>The public-service narratives draw on the <a href={scenarioLibraryUrl} target="_blank" rel="noopener noreferrer">Microsoft Adoption Government scenario library<span className="sr-only"> (opens in a new tab)</span></a>. The Customer Service Optimize exercise is a bounded teaching adaptation of a supplied agent definition, not an Adoption library scenario. These are not customer case studies or measured results. Suggested benefits are goals to evaluate. Real deployments need approved sources, suitable permissions, configured integrations and accountable service owners.</p><p>Recipe times use a simple estimate of one minute per guided step, not measured completion times or real deployment effort.</p></div></aside>
    </div>
  )
}
