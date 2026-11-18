import { Fragment, useState } from 'react'
import {
  ArrowLeft20Regular, ChevronDown20Regular, Code20Regular, Database20Regular,
  Open16Regular, Search20Regular,
} from '@fluentui/react-icons'
import { Modal } from '../../components/Modal.tsx'
import { FoundryIcon } from '../FoundryIcon.tsx'
import { filterFoundryRecipes, foundryRecipeLimits } from './schema.ts'
import type { FoundryRecipe, FoundrySort, FoundryTool } from './schema.ts'
import { validateFoundryName } from './state.ts'
import type { FoundryDraft, FoundryRoute } from './state.ts'

const catalogTabs = ['Overview', 'Models', 'Agents', 'Tools', 'Knowledge', 'Services', 'Solution templates']
const toolImages = {
  bing: 'https://ai.azure.com/images/template-images/Bing.svg',
  sharepoint: 'https://ai.azure.com/images/template-images/SharePoint.svg',
  fabric: 'https://ai.azure.com/images/template-images/FabricDataAgent.svg',
  search: 'https://ai.azure.com/images/template-images/AzureSearch.svg',
  browser: 'https://ai.azure.com/images/template-images/BrowserAutomation.svg',
  openapi: 'https://ai.azure.com/images/template-images/OpenApi.svg',
  github: 'https://ai.azure.com/images/GitHubLogo.svg',
}

function ToolMark({ tool }: { tool: FoundryTool }) {
  return <span className="fd-tool-mark" title={tool.name} aria-label={tool.name}>
    {tool.icon === 'code' ? <Code20Regular /> : tool.icon === 'file' ? <Database20Regular />
      : <img src={toolImages[tool.icon]} width="24" height="24" alt="" />}
  </span>
}

function RecipeText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>)}</>
}

function CreationDialog({ recipe, drafts, onClose, onCreate }: {
  recipe: FoundryRecipe
  drafts: readonly FoundryDraft[]
  onClose: () => void
  onCreate: (recipe: FoundryRecipe, name: string) => void
}) {
  const [name, setName] = useState(recipe.manifest.defaultName)
  const [error, setError] = useState('')

  function submit() {
    const invalid = validateFoundryName(name, drafts)
    if (invalid) { setError(invalid); return }
    try { onCreate(recipe, name); onClose() } catch (failure) {
      if (!(failure instanceof Error)) throw failure
      setError(failure.message)
    }
  }

  return <Modal title="Create an agent from manifest" className="fd-dialog fd-create-dialog" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); submit() }}>
      <p>Provide a unique name for your agent. This name serves as its identifier in the API.</p>
      <label htmlFor="fd-agent-name">Agent name <span aria-hidden="true">*</span></label>
      <input id="fd-agent-name" value={name} onChange={event => { setName(event.target.value); setError('') }}
        placeholder="Name your agent" maxLength={64} required aria-invalid={!!error} aria-describedby={error ? 'fd-create-error fd-create-note' : 'fd-create-note'} />
      {error && <p id="fd-create-error" className="fd-form-error" role="alert">{error}</p>}
      <p id="fd-create-note" className="fd-local-note">Cookbook: creates a local draft only, not an Azure agent.</p>
      <div className="fd-create-actions"><button type="submit" className="fd-button fd-primary">Create</button><button type="button" className="fd-button" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>
}

function CreationAction({ recipe, drafts, onCreate }: {
  recipe: FoundryRecipe
  drafts: readonly FoundryDraft[]
  onCreate: (recipe: FoundryRecipe, name: string) => void
}) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="fd-button fd-primary" onClick={() => setOpen(true)}>Create agent</button>
    {open && <CreationDialog recipe={recipe} drafts={drafts} onClose={() => setOpen(false)} onCreate={onCreate} />}
  </>
}

export function LocalDraftDialog({ recipe, draft, drafts, onClose, onSave }: {
  recipe: FoundryRecipe
  draft: FoundryDraft
  drafts: readonly FoundryDraft[]
  onClose: () => void
  onSave: (recipe: FoundryRecipe, draft: FoundryDraft) => void
}) {
  const [edited, setEdited] = useState(() => structuredClone(draft))
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  function save() {
    const invalid = validateFoundryName(edited.name, drafts, edited.id)
    if (invalid) { setError(invalid); return }
    try { onSave(recipe, edited); onClose() } catch (failure) {
      if (!(failure instanceof Error)) throw failure
      setError(failure.message)
    }
  }

  async function copyInstructions() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.')
      await navigator.clipboard.writeText(edited.instructions)
      setCopied(true)
    } catch (failure) {
      if (!(failure instanceof Error)) throw failure
      setError(`Could not copy instructions. ${failure.message}`)
    }
  }

  return <Modal title="Local agent draft" className="fd-dialog fd-draft-dialog" onClose={onClose}>
    <p className="fd-dialog-note">Based on {recipe.title}. This Cookbook editor saves configuration only. No model runs, Bing searches, or Azure resources are connected.</p>
    <form onSubmit={event => { event.preventDefault(); save() }}>
      <label htmlFor="fd-draft-name">Agent name</label>
      <input id="fd-draft-name" value={edited.name} maxLength={64} required
        onChange={event => setEdited({ ...edited, name: event.target.value })} />
      <label htmlFor="fd-draft-model">Model from manifest</label>
      <input id="fd-draft-model" value={edited.model} readOnly aria-describedby="fd-draft-model-note" />
      <small id="fd-draft-model-note">Reference configuration, not a deployed model.</small>
      <div className="fd-draft-instructions-label"><label htmlFor="fd-draft-instructions">Instructions</label>
        <button type="button" className="fd-button" onClick={() => void copyInstructions()}><FoundryIcon name="copy" />{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <textarea id="fd-draft-instructions" value={edited.instructions} maxLength={foundryRecipeLimits.instructions} required rows={14}
        onChange={event => { setEdited({ ...edited, instructions: event.target.value }); setCopied(false) }} />
      <fieldset><legend>Tools</legend>
        {recipe.tools.length ? recipe.tools.map(tool => <label key={tool.id} className="fd-draft-tool">
          <input type="checkbox" checked={edited.toolIds.includes(tool.id)} onChange={event => setEdited({
            ...edited, toolIds: event.target.checked ? [...edited.toolIds, tool.id] : edited.toolIds.filter(id => id !== tool.id),
          })} /><ToolMark tool={tool} />{tool.name}
        </label>) : <p>No tools in this manifest.</p>}
      </fieldset>
      <p className="fd-local-note">Edited instructions are stored as text, not executed. Tool selections change this draft's metadata only.</p>
      {error && <p className="fd-form-error" role="alert">{error}</p>}
      <div className="fd-dialog-actions"><button type="submit" className="fd-button fd-primary">Save draft</button><button type="button" className="fd-button" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>
}

export function RecipeCatalog({ recipes, route, drafts, onRecipe, onBack, onFeature, onCreate, onDraft }: {
  recipes: readonly FoundryRecipe[]
  route: FoundryRoute
  drafts: readonly FoundryDraft[]
  onRecipe: (id: string) => void
  onBack: () => void
  onFeature: (name: string) => void
  onCreate: (recipe: FoundryRecipe, name: string) => void
  onDraft: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<FoundrySort>('featured')
  const recipe = route.kind === 'recipe' ? recipes.find(recipe => recipe.id === route.recipeId) : undefined
  const filtered = filterFoundryRecipes(recipes, query, sort)
  const recipeDrafts = recipe ? drafts.filter(draft => draft.recipeId === recipe.id) : []

  return <div className="fd-catalog">
    <header className="fd-catalog-header">
      <h1>Catalog</h1>
      <nav aria-label="Catalog navigation"><div role="tablist" aria-label="Catalog sections">
        {catalogTabs.map((tab, index) => <button type="button" role="tab" id={`fd-catalog-tab-${index}`} key={tab}
          aria-selected={tab === 'Agents'} aria-controls={tab === 'Agents' ? 'fd-agents-panel' : undefined}
          tabIndex={tab === 'Agents' ? 0 : -1}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % catalogTabs.length
              : event.key === 'ArrowLeft' ? (index - 1 + catalogTabs.length) % catalogTabs.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? catalogTabs.length - 1 : undefined
            if (next !== undefined) { event.preventDefault(); document.getElementById(`fd-catalog-tab-${next}`)?.focus() }
          }}
          onClick={() => tab === 'Agents' ? onBack() : onFeature(`Catalog: ${tab}`)}>
          {tab}{tab === 'Agents' && <span className="fd-preview-badge">Preview</span>}
        </button>)}
      </div></nav>
    </header>
    <div className="fd-catalog-content" id="fd-agents-panel" role="tabpanel" aria-labelledby="fd-catalog-tab-2" key={recipe?.id ?? route.kind}>
      {route.kind === 'recipe' && !recipe ? <div className="fd-catalog-missing"><h2>Recipe not found</h2><p>This recipe is not available in the local Cookbook.</p><button className="fd-button" type="button" onClick={onBack}>Back to Agents</button></div>
        : recipe ? <>
          <div className="fd-manifest-heading">
            <button type="button" className="fd-icon-button" aria-label="Go back" onClick={onBack}><ArrowLeft20Regular /></button>
            <h2>{recipe.title}</h2>
            <CreationAction key={recipe.id} recipe={recipe} drafts={drafts} onCreate={onCreate} />
          </div>
          <div className="fd-manifest-layout">
            <article className="fd-manifest-article">
              {recipe.sections.map(section => <section key={section.id} aria-labelledby={`fd-section-${section.id}`}>
                <h2 id={`fd-section-${section.id}`}>{section.title}</h2>
                {section.blocks.map((block, index) => block.kind === 'paragraph'
                  ? <p key={index}><RecipeText text={block.text} /></p>
                  : <ul key={index}>{block.items.map((item, index) => <li key={index}><RecipeText text={item} /></li>)}</ul>)}
              </section>)}
              <p className="fd-manifest-legal">{recipe.source.licenseText} <a href={recipe.source.licenseUrl} target="_blank" rel="noreferrer">{recipe.source.licenseLabel} <Open16Regular /></a>.</p>
              <p className="fd-manifest-legal">{recipe.source.disclaimer} <a href={recipe.source.learnMoreUrl} target="_blank" rel="noreferrer">Learn more <Open16Regular /></a>.</p>
              <section className="fd-local-drafts" aria-labelledby="fd-local-drafts-heading">
                <h2 id="fd-local-drafts-heading">Your Cookbook drafts</h2>
                <p>The manifest above describes the real Foundry pattern. Here, Create agent saves a local configuration draft only. It does not run the agent or connect its tools.</p>
                {recipeDrafts.length ? <ul>{recipeDrafts.map(draft => <li key={draft.id}><button type="button" onClick={() => onDraft(draft.id)}>{draft.name}</button><span>Saved locally</span></li>)}</ul>
                  : <p className="fd-dialog-note">No local drafts for this recipe yet.</p>}
              </section>
            </article>
            <aside className="fd-quick-facts" aria-labelledby="fd-quick-facts-heading">
              <h2 id="fd-quick-facts-heading">Quick facts</h2>
              <dl><div><dt>Publisher</dt><dd>{recipe.publisher}</dd></div>
                <div><dt>Created on</dt><dd>{recipe.createdOn.split('-').reverse().join('/')}</dd></div>
                <div><dt>Tools</dt><dd>{recipe.tools.length ? recipe.tools.map(tool => <span className="fd-fact-tool" key={tool.id}><ToolMark tool={tool} />{tool.name}</span>) : 'None'}</dd></div>
              </dl>
            </aside>
          </div>
        </> : <>
          <div className="fd-catalog-intro">
            <p>Get started with agent development using starter manifests.</p>
            <p>Starter manifests help you learn and experiment as you build your own agents, but they are for educational use only. Agents created from them aren't production ready, so review risks and ensure compliance with your organization's policies, laws, and safety requirements before use. <a href="https://aka.ms/foundry_agent_catalog_doc" target="_blank" rel="noreferrer">Learn more <Open16Regular /></a></p>
          </div>
          <div className="fd-catalog-filters">
            <label className="fd-catalog-search"><Search20Regular /><input type="search" aria-label="Search agents" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <label className="fd-catalog-sort"><span>Sort by</span><select aria-label="Sort by" value={sort} onChange={event => {
              const value = event.target.value
              if (value === 'featured' || value === 'name-asc' || value === 'name-desc' || value === 'newest') setSort(value)
            }}><option value="featured">Featured</option><option value="name-asc">Name: A to Z</option><option value="name-desc">Name: Z to A</option><option value="newest">Newest</option></select><ChevronDown20Regular /></label>
          </div>
          <span className="fd-visually-hidden" role="status">Showing {filtered.length} of {recipes.length} items</span>
          <ul className="fd-recipe-grid" aria-label="agents catalog">
            {filtered.map(recipe => <li key={recipe.id}><button type="button" className="fd-recipe-card" onClick={() => onRecipe(recipe.id)}>
              <span className="fd-recipe-card-title">{recipe.title}</span><span className="fd-recipe-publisher">{recipe.publisher}</span>
              <span className="fd-recipe-tools">{recipe.tools.map(tool => <ToolMark key={tool.id} tool={tool} />)}</span>
            </button></li>)}
          </ul>
          {!filtered.length && <div className="fd-catalog-empty"><h2>No agents found</h2><p>Try a different search.</p><button type="button" className="fd-button" onClick={() => setQuery('')}>Clear search</button></div>}
          <p className="fd-catalog-footnote">Local Cookbook catalog. Only implemented recipes are listed; models and tools are not connected.</p>
        </>}
    </div>
  </div>
}
