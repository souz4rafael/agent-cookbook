import { useState } from 'react'
import { Add20Regular, ArrowRight20Regular, Info16Regular, Mic20Filled, MoreHorizontal20Regular, ShieldTask20Regular } from '@fluentui/react-icons'
import { builderRecipes } from './catalog.ts'
import { BuilderIcon } from './BuilderIcon.tsx'
import type { BuilderRecipe } from './schema.ts'
import type { BuilderDraft } from './state.ts'

const referenceCards = [
  { title: 'Expert Answers (New)', summary: 'Get answers quickly, grounded in your knowledge and in your format', icon: 'expert' },
  { title: 'Document Writing (New)', summary: 'Draft complex documents from examples, instructions, and inputs', icon: 'document' },
] as const

export function NewAgent({ drafts, onSelect, onInfo }: {
  drafts: Record<string, BuilderDraft>
  onSelect: (recipe: BuilderRecipe, goal?: string) => void
  onInfo: (title: string, text: string) => void
}) {
  const [tab, setTab] = useState<'ideas' | 'mine'>('ideas')
  const [goal, setGoal] = useState('')
  const first = builderRecipes[0]
  function submit() {
    if (!first) return onInfo('No recipes available', 'Add a valid JSON recipe to the recipe catalogue before starting an agent.')
    onSelect(first, goal)
  }
  return <div className="cb-new-agent">
    <header className="cb-gallery-toolbar">
      <button className="cp-icon-button cp-privacy-icon" aria-label="Local data and privacy" onClick={() => onInfo('Local simulation', 'The agent and its configuration stay in this browser. No real account, AI model or data source is connected.')}><ShieldTask20Regular /></button>
      <button className="cp-icon-button" aria-label="Settings and more" onClick={() => onInfo('Agent Builder', 'Choose a template, configure it and explore a local preview. New recipes use the same screens and schema.')}><MoreHorizontal20Regular /></button>
    </header>
    <div className="cb-gallery-scroll">
      <div className="cb-gallery-intro">
        <div className="cb-gallery-title"><h1>Get support on everyday work</h1><button className="cb-button" onClick={() => submit()}>Skip<ArrowRight20Regular /></button></div>
        <form className="cb-describe-composer" onSubmit={event => { event.preventDefault(); submit() }}>
          <textarea aria-label="What would you like help with" placeholder="What would you like help with" value={goal}
            maxLength={1000} rows={1} onChange={event => setGoal(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit() }
            }} />
          <div><button type="button" className="cp-icon-button" aria-label="Add and manage sources" onClick={() => onInfo('Add and manage sources', 'Choose a template first to select its fictional knowledge sources. No files are uploaded.')}><Add20Regular /></button>
            <span className="cp-toolbar-spacer" />
            {goal.trim() ? <button className="cp-icon-button" type="submit" aria-label="Continue"><ArrowRight20Regular /></button>
              : <button className="cp-icon-button" type="button" aria-label="Start dictation" onClick={() => onInfo('Dictation', 'Dictation is not connected in this local prototype. Type a description to continue.')}><Mic20Filled /></button>}
          </div>
        </form>
      </div>
      <div className="cb-gallery-templates">
        <div className="cb-gallery-tabs" role="tablist" aria-label="Agent templates">
          <button role="tab" id="cb-ideas-tab" aria-controls="cb-ideas-panel" aria-selected={tab === 'ideas'} onClick={() => setTab('ideas')}>Ideas for you</button>
          <button role="tab" id="cb-mine-tab" aria-controls="cb-mine-panel" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>My agents</button>
        </div>
        {tab === 'ideas' ? <div id="cb-ideas-panel" role="tabpanel" aria-labelledby="cb-ideas-tab">
          <div className="cb-template-grid">
            {builderRecipes.map(recipe => <button key={recipe.id} className="cb-template-card" aria-label={`${recipe.title} template`} onClick={() => onSelect(recipe)}>
              <span><BuilderIcon icon={recipe.icon} name={recipe.title} small /><strong>{recipe.title}</strong></span><p>{recipe.summary}</p>
            </button>)}
            {referenceCards.filter(card => !builderRecipes.some(recipe => recipe.title === card.title)).map(card => <button key={card.title} className="cb-template-card" aria-label={`${card.title} template`}
              onClick={() => onInfo(card.title, 'This template is shown for visual reference. RLE Starter is the first implemented recipe; additional recipes can be added without changing the builder screens.')}>
              <span><BuilderIcon icon={card.icon} name={card.title} small /><strong>{card.title}</strong></span><p>{card.summary}</p>
            </button>)}
          </div>
          <button className="cb-see-more" onClick={() => onInfo('Templates', `${builderRecipes.length} local recipe${builderRecipes.length === 1 ? ' is' : 's are'} currently available. Each JSON recipe supplies its profile, sections, sample knowledge, skills and preview rules.`)}>See more</button>
        </div> : <div id="cb-mine-panel" role="tabpanel" aria-labelledby="cb-mine-tab">
          <div className="cb-template-grid">{builderRecipes.filter(recipe => drafts[recipe.id]).map(recipe => {
            const draft = drafts[recipe.id]
            return <button key={recipe.id} className="cb-template-card" onClick={() => onSelect(recipe)}>
              <span><BuilderIcon icon={draft.icon} name={draft.profile.name || 'Untitled agent'} small /><strong>{draft.profile.name || 'Untitled agent'}</strong></span>
              <p>{draft.profile.description}</p><small>{draft.status === 'created' ? 'Created locally' : 'Local draft'}</small>
            </button>
          })}</div>
          {!Object.keys(drafts).length && <p className="cb-empty">Your local agents will appear here. Choose a template to get started.</p>}
        </div>}
      </div>
    </div>
    <button className="cb-simulation-note" aria-label="About this local simulation" title="Cookbook simulation · Changes stay in this browser"
      onClick={() => onInfo('Local simulation', 'The builder and its fictional recipe fixtures run locally. Edits are saved in this browser, and Create does not publish an agent.')}><Info16Regular /></button>
  </div>
}
