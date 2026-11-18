import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  Agents20Regular, Agents24Regular, Alert20Regular, ArrowDown20Regular,
  ArrowUpRight20Regular, Beaker20Regular, BoxMultiple20Regular,
  BrainCircuit20Regular, Checkmark20Regular, ChevronLeft20Regular,
  ChevronRight20Regular, ChevronUpDown20Regular,
  CubeMultiple20Regular, CubeMultiple24Regular, DatabaseMultiple20Regular,
  DataLine20Regular, DocumentOnePageMultiple20Regular,
  FilmstripImage20Regular, FlowDot20Regular, FlowSparkle20Regular,
  Grid20Filled, Grid20Regular, Home20Filled, Home20Regular, Info16Regular, Library24Regular,
  Open16Regular, PanelLeftExpand20Regular, PanelRightExpand20Regular,
  Person20Regular, Scales20Regular, Search20Regular, ShieldCheckmark20Regular,
  WrenchScrewdriver20Regular,
} from '@fluentui/react-icons'
import { CookbookMark } from '../components/CookbookMark.tsx'
import { CollectionLink } from '../collection/CollectionLink.tsx'
import { Modal } from '../components/Modal.tsx'
import { PopupMenu } from '../components/PopupMenu.tsx'
import { FoundryIcon } from './FoundryIcon.tsx'
import { demoProject, featuredModels, navigationSections, searchHome } from './home.ts'
import type { NavigationItem, RecentFilter } from './home.ts'
import modelIcons from './assets/model-icons.json'
import assetNotices from './assets/NOTICE.txt?raw'
import { foundryRecipes, getFoundryRecipe } from './recipes/catalog.ts'
import { filterFoundryRecipes } from './recipes/schema.ts'
import type { FoundryRecipe } from './recipes/schema.ts'
import { readFoundryRoute, recipeHref } from './recipes/state.ts'
import { useFoundryDrafts } from './recipes/useFoundryDrafts.ts'
import { LocalDraftDialog, RecipeCatalog } from './recipes/RecipeCatalog.tsx'
import './recipes/catalog.css'

const navigationIcons = {
  Home: Home20Filled,
  Catalog: Grid20Regular,
  Agents: Agents20Regular,
  Models: BoxMultiple20Regular,
  Services: FilmstripImage20Regular,
  Tools: WrenchScrewdriver20Regular,
  Knowledge: DatabaseMultiple20Regular,
  Memory: BrainCircuit20Regular,
  Guardrails: ShieldCheckmark20Regular,
  Monitor: DataLine20Regular,
  Traces: FlowDot20Regular,
  Data: DocumentOnePageMultiple20Regular,
  Evaluations: Scales20Regular,
  Training: Beaker20Regular,
}

type DialogState = { kind: 'search' | 'profile' | 'about' } | { kind: 'feature'; title: string }

function IconButton({ label, className = '', ...props }: ComponentProps<'button'> & { label: string }) {
  return <button type="button" className={`fd-icon-button ${className}`} aria-label={label} title={label} {...props} />
}

function EndpointField({ label, value, info, report }: {
  label: string
  value: string
  info?: () => void
  report: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.')
      await navigator.clipboard.writeText(value)
      setCopied(true)
      report(`${label} copied. This is a fictional example, not a live endpoint.`)
    } catch (error) {
      report(`Could not copy the endpoint. ${error instanceof Error ? error.message : 'Select the field and copy it manually.'}`)
    }
  }

  return <div className="fd-field">
    <div className="fd-field-label">
      <label htmlFor={`fd-${label.replaceAll(' ', '-').toLowerCase()}`}>{label}</label>
      {info && <IconButton label="About project endpoints" onClick={info}><Info16Regular /></IconButton>}
    </div>
    <div className="fd-input-copy">
      <input id={`fd-${label.replaceAll(' ', '-').toLowerCase()}`} readOnly value={value} title={`${value} (fictional example)`} />
      <IconButton label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`} onClick={() => void copy()}>
        {copied ? <Checkmark20Regular /> : <FoundryIcon name="copy" />}
      </IconButton>
    </div>
  </div>
}

function FeaturedModels({ openFeature }: { openFeature: (title: string) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [arrows, setArrows] = useState({ previous: false, next: false })

  useEffect(() => {
    const element = track.current
    if (!element) return
    const update = () => setArrows({
      previous: element.scrollLeft > 1,
      next: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [])

  function scroll(direction: number) {
    const element = track.current
    if (!element) return
    element.scrollBy({
      left: direction * Math.max(268, element.clientWidth - 268),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return <div className="fd-model-carousel" role="region" aria-label="Featured models">
    <IconButton label="Previous models" disabled={!arrows.previous} onClick={() => scroll(-1)}><ChevronLeft20Regular /></IconButton>
    <div className="fd-model-track" ref={track}>
      {featuredModels.map(model => <button type="button" className="fd-model-card" key={model.name} onClick={() => openFeature(model.name)}>
        <span className="fd-model-logo"><img src={modelIcons[model.icon]} alt="" /></span>
        <span className="fd-model-copy"><strong title={model.name}>{model.name}</strong><small>{model.publisher}</small></span>
      </button>)}
    </div>
    <IconButton label="Next models" disabled={!arrows.next} onClick={() => scroll(1)}><ChevronRight20Regular /></IconButton>
  </div>
}

export function FoundryPortal() {
  const [route, setRoute] = useState(() => readFoundryRoute(window.location.hash))
  const localDrafts = useFoundryDrafts()
  const [openedDraftId, setOpenedDraftId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [projectOpen, setProjectOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RecentFilter>('All')
  const [message, setMessage] = useState('')
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const projectRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const results = [
    ...searchHome(search),
    ...filterFoundryRecipes(foundryRecipes, search, 'featured').map(recipe => ({
      name: recipe.title, category: 'Recipe', description: recipe.publisher, recipeId: recipe.id,
    })),
    ...localDrafts.drafts.filter(draft => draft.name.toLowerCase().includes(search.trim().toLowerCase())).map(draft => ({
      name: draft.name, category: 'Local agent', description: 'Saved Cookbook draft', draftId: draft.id,
    })),
  ]
  const openedDraft = localDrafts.drafts.find(draft => draft.id === openedDraftId)
  const draftRecipe = openedDraft ? getFoundryRecipe(openedDraft.recipeId) : undefined
  const visibleDrafts = filter === 'Models' ? [] : [...localDrafts.drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const inCatalog = route.kind === 'catalog' || route.kind === 'recipe'

  useEffect(() => {
    function onRoute() {
      setRoute(readFoundryRoute(window.location.hash))
      setDialog(null)
      setOpenedDraftId(null)
      setProjectOpen(false)
    }
    window.addEventListener('hashchange', onRoute)
    return () => window.removeEventListener('hashchange', onRoute)
  }, [])

  useEffect(() => {
    document.title = `${route.kind === 'recipe' ? getFoundryRecipe(route.recipeId)?.title ?? 'Recipe not found'
      : route.kind === 'catalog' ? 'Catalog' : route.kind === 'not-found' ? 'Page not found' : 'Home'} · Microsoft Foundry Agents Cookbook`
    mainRef.current?.scrollTo({ top: 0 })
  }, [route])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (document.querySelector('dialog[open]')) return
        setProjectOpen(false)
        setOpenedDraftId(null)
        setSearch('')
        setDialog({ kind: 'search' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 6000)
    return () => clearTimeout(timer)
  }, [message])

  function feature(title: string) {
    setProjectOpen(false)
    setDialog({ kind: 'feature', title })
  }

  function home() {
    window.location.assign('#/home')
    setDialog(null)
    setOpenedDraftId(null)
    mainRef.current?.scrollTo({ top: 0 })
    mainRef.current?.focus()
  }

  function navigate(name: NavigationItem) {
    if (name === 'Home') home()
    else if (name === 'Catalog') catalog()
    else feature(name)
  }

  function catalog() {
    window.location.assign('#/catalog/agents')
    setDialog(null)
    setOpenedDraftId(null)
  }

  function openRecipe(id: string) {
    window.location.assign(recipeHref(id))
    setDialog(null)
  }

  function openDraft(id: string) {
    setDialog(null)
    setOpenedDraftId(id)
  }

  function createDraft(recipe: FoundryRecipe, name: string) {
    const draft = localDrafts.create(recipe, name)
    setMessage(`"${draft.name}" saved locally. No Azure agent was created.`)
  }

  function changeTheme(value: string) {
    document.documentElement.dataset.theme = value
    setTheme(value)
  }

  return <div className={`fd-app${collapsed ? ' fd-collapsed' : ''}`}>
    <a className="fd-skip" href="#fd-main" onClick={event => { event.preventDefault(); mainRef.current?.focus() }}>Skip to main content</a>
    <header className="fd-header">
      <button type="button" className="fd-brand" onClick={home} aria-label="Microsoft Foundry Agents Cookbook home">
        <CookbookMark className="fd-brand-mark" />
        <span className="fd-brand-copy"><small>Microsoft Foundry</small><span>Agents <strong>Cookbook</strong></span></span>
      </button>
      <span className="fd-header-divider" aria-hidden="true">/</span>
      <button className="fd-project" type="button" ref={projectRef} aria-haspopup="menu" aria-expanded={projectOpen}
        aria-controls="fd-project-menu" onClick={() => setProjectOpen(!projectOpen)}>
        <span><strong>{demoProject.name}</strong><small>{demoProject.description}</small></span><ChevronUpDown20Regular />
      </button>
      <button type="button" className="fd-search-trigger" onClick={() => { setSearch(''); setDialog({ kind: 'search' }) }}>
        <Search20Regular /><span>Search (Ctrl + K)</span>
      </button>
      <div className="fd-header-actions">
        <button type="button" className="fd-new-foundry" role="switch" aria-checked="true" aria-label="New Foundry"
          onClick={() => feature('New Foundry only')}>
          <span>New Foundry</span><span className="fd-switch-track" aria-hidden="true"><span /></span>
        </button>
        <nav className="fd-top-navigation" aria-label="Global">
          <button type="button" className="fd-build" onClick={() => feature('Build')}>Build</button>
          <button type="button" onClick={() => feature('Manage')}>Manage</button>
          <a href="https://learn.microsoft.com/azure/foundry/" target="_blank" rel="noreferrer">Docs<Open16Regular /></a>
        </nav>
        <IconButton label="Notifications" onClick={() => feature('Notifications')}><Alert20Regular /></IconButton>
        <IconButton label="Feedback" onClick={() => feature('Feedback')}><FoundryIcon name="feedback" /></IconButton>
        <IconButton label="My profile settings" className="fd-avatar" onClick={() => setDialog({ kind: 'profile' })}><Person20Regular /></IconButton>
      </div>
    </header>

    <div className="fd-body">
      <nav className="fd-sidebar" aria-label="Secondary navigation">
        <CollectionLink className="fd-nav-item"><Library24Regular aria-hidden="true" /><span>All cookbooks</span></CollectionLink>
        <div className="fd-nav-scroll">
          {navigationSections.map(section => <div className="fd-nav-section" key={section.title || 'Home'}>
            {section.title && <h2>{section.title}</h2>}
            {section.items.map(name => {
              const Icon = name === 'Home' && route.kind !== 'home' ? Home20Regular
                : name === 'Catalog' && inCatalog ? Grid20Filled : navigationIcons[name]
              return <button type="button" key={name} title={name} aria-label={name}
                aria-current={(name === 'Home' && route.kind === 'home') || (name === 'Catalog' && inCatalog) ? 'page' : undefined} onClick={() => navigate(name)} className="fd-nav-item">
                <Icon /><span>{name}</span>
              </button>
            })}
          </div>)}
        </div>
        <IconButton label={collapsed ? 'Expand left navigation' : 'Collapse left navigation'} className="fd-collapse"
          aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <PanelLeftExpand20Regular /> : <PanelRightExpand20Regular />}
        </IconButton>
      </nav>

      <main id="fd-main" className="fd-main" ref={mainRef} tabIndex={-1}>
        {localDrafts.warning && <div className="fd-storage-warning" role="alert">{localDrafts.warning}</div>}
        {inCatalog ? <RecipeCatalog recipes={foundryRecipes} route={route} drafts={localDrafts.drafts}
          onRecipe={openRecipe} onBack={catalog} onFeature={feature} onCreate={createDraft} onDraft={openDraft} />
          : route.kind === 'not-found' ? <div className="fd-home fd-catalog-missing"><h1>Page not found</h1><p>This page is not part of the local Cookbook.</p><button className="fd-button" type="button" onClick={catalog}>Browse agent recipes</button></div>
          : <div className="fd-home">
          <h1>Welcome, builder</h1>
          <section aria-label="Get started">
            <div className="fd-starter-grid">
              <article className="fd-starter fd-starter-agent">
                <Agents24Regular className="fd-starter-icon" />
                <div className="fd-starter-copy"><h2>Build an agent</h2><p>Define instructions, add tools and knowledge, and create an agent for your project.</p></div>
                <div className="fd-starter-actions">
                  <button type="button" className="fd-button fd-primary" onClick={catalog}>Create an agent</button>
                  <button type="button" className="fd-button" onClick={() => feature('Start from code')}>Start from code</button>
                </div>
              </article>
              <article className="fd-starter fd-starter-model">
                <CubeMultiple24Regular className="fd-starter-icon" />
                <div className="fd-starter-copy"><h2>Use a model</h2><p>Manage your existing endpoints or deploy a new model.</p></div>
                <div className="fd-starter-actions"><button type="button" className="fd-button" onClick={() => feature('View deployments')}>View deployments</button></div>
              </article>
            </div>
            <div className="fd-credentials">
              <div className="fd-field"><label htmlFor="fd-api-key">API key</label>
                <input id="fd-api-key" value="No API key needed for this local preview." readOnly />
              </div>
              <EndpointField label="Project endpoint" value={demoProject.endpoint} info={() => feature('Project endpoint')} report={setMessage} />
              <EndpointField label="Azure OpenAI endpoint" value={demoProject.openAIEndpoint} report={setMessage} />
            </div>
          </section>

          <section className="fd-model-selection" aria-labelledby="fd-model-heading">
            <div className="fd-model-header">
              <div className="fd-model-heading">
                <span><CubeMultiple20Regular />Model selection</span>
                <h2 id="fd-model-heading">Find the right model</h2>
              </div>
              <button type="button" className="fd-model-action" onClick={() => feature('Explore models')}>
                <span className="fd-action-icon"><CubeMultiple20Regular /></span>
                <span><strong>Explore models</strong><span>Know which model you want?</span><span>Browse and choose from available models.</span></span>
              </button>
              <button type="button" className="fd-model-action" onClick={() => feature('Try Model Router')}>
                <span className="fd-action-icon"><FlowSparkle20Regular /></span>
                <span><strong>Try Model Router</strong><span>Not sure which model to use?</span><span>Let Model Router choose a model for each request.</span></span>
              </button>
            </div>
            <h3>Featured models</h3>
            <FeaturedModels openFeature={feature} />
          </section>

          <section className="fd-recent" aria-labelledby="fd-recent-heading">
            <h2 id="fd-recent-heading">Recent work</h2>
            <div className="fd-filters" role="group" aria-label="Filter recent work">
              {(['All', 'Agents', 'Models'] as const).map(item => <button type="button" className="fd-button" key={item}
                aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
            </div>
            <div className="fd-table-scroll">
              <table className="fd-recent-table">
                <thead><tr><th>Name</th><th>Version</th><th>Type</th><th>{visibleDrafts.length ? 'Last saved' : 'Last viewed'} <ArrowDown20Regular /></th><th>Endpoint</th></tr></thead>
                <tbody>{visibleDrafts.length ? visibleDrafts.map(draft => <tr key={draft.id} className="fd-local-work">
                  <td><button type="button" onClick={() => openDraft(draft.id)}>{draft.name}</button></td>
                  <td>{draft.recipeRevision}</td><td>Agent <small>(local draft)</small></td>
                  <td>{new Date(draft.updatedAt).toLocaleString('en-GB')}</td><td><small>Not deployed</small></td>
                </tr>) : <tr><td colSpan={5}>
                  <div className="fd-empty" role="status">
                    <DocumentOnePageMultiple20Regular />
                    <strong>{filter === 'All' ? 'No recent work yet' : `No recent ${filter.toLowerCase()} yet`}</strong>
                    <span>Create a local draft from Catalog &gt; Agents. No models are deployed.</span>
                  </div>
                </td></tr>}</tbody>
              </table>
            </div>
          </section>

          <section className="fd-resources" aria-labelledby="fd-resources-heading">
            <h2 id="fd-resources-heading">Learning and resources</h2>
            <div className="fd-resource-grid">
              <a href="https://learn.microsoft.com/azure/foundry/" target="_blank" rel="noreferrer">
                <Library24Regular /><div><strong>Docs <Open16Regular /></strong><p>Explore our detailed docs for all the info you need.</p></div>
              </a>
              <a href="https://github.com/azure-ai-foundry" target="_blank" rel="noreferrer">
                <img src="https://ai.azure.com/images/GitHubLogo.svg" alt="" /><div><strong>GitHub <Open16Regular /></strong><p>Get the latest SDK updates and code samples on GitHub.</p></div>
              </a>
              <a href="https://aka.ms/azureaifoundry/discord" target="_blank" rel="noreferrer">
                <img src="https://ai.azure.com/images/DiscordLogo.svg" alt="" /><div><strong>Discord <Open16Regular /></strong><p>Have questions? Join and connect with our Discord community.</p></div>
              </a>
            </div>
          </section>
          <p className="fd-preview-note">Independent educational simulation, not affiliated with Microsoft. Fictional project, no Azure connection, no live AI. <button type="button" onClick={() => setDialog({ kind: 'about' })}>About this Cookbook</button></p>
        </div>}
      </main>
    </div>
    <footer className="fd-footer"><button type="button" onClick={() => setDialog({ kind: 'about' })}>Local preview</button>
      <nav aria-label="Legal"><a href="https://azure.microsoft.com/support/legal/" target="_blank" rel="noreferrer">Terms</a><a href="https://www.microsoft.com/privacy/privacystatement" target="_blank" rel="noreferrer">Privacy</a></nav>
    </footer>
    <div className={`fd-toast${message ? ' fd-toast-visible' : ''}`} role="status">{message}</div>

    <PopupMenu id="fd-project-menu" label="Project" open={projectOpen} anchorRef={projectRef}
      onClose={() => setProjectOpen(false)} className="fd-project-menu" align="start">
      <p>Current project</p>
      <button type="button" role="menuitem" onClick={() => { setProjectOpen(false); setMessage('agents-cookbook is the only project in this local preview.') }}>
        <span><strong>{demoProject.name}</strong><small>{demoProject.description}</small></span><Checkmark20Regular />
      </button>
      <button type="button" role="menuitem" onClick={() => feature('Create a project')}>Create a project <ArrowUpRight20Regular /></button>
    </PopupMenu>

    {dialog && <Modal className="fd-dialog" title={dialog.kind === 'feature' ? dialog.title : dialog.kind === 'search' ? 'Search' : dialog.kind === 'profile' ? 'Profile and appearance' : 'Microsoft Foundry Agents Cookbook'} onClose={() => setDialog(null)}>
      {dialog.kind === 'search' ? <>
        <label className="fd-search-input"><Search20Regular /><input autoFocus type="search" value={search}
          aria-label="Search this home" placeholder="Search pages and featured models" onChange={event => setSearch(event.target.value)} /></label>
        <p className="fd-dialog-note">Search local pages, recipes, and drafts. Models and tools are not connected to Azure.</p>
        <div className="fd-search-results">
          {results.map(result => <button key={`${result.category}-${result.name}`} type="button" onClick={() => {
            if ('recipeId' in result) openRecipe(result.recipeId)
            else if ('draftId' in result) openDraft(result.draftId)
            else if (result.name === 'Home') home()
            else if (result.name === 'Catalog') catalog()
            else feature(result.name)
          }}>
            <span><strong>{result.name}</strong><small>{result.description}</small></span><span>{result.category}</span>
          </button>)}
          {!results.length && <p role="status">No results for "{search}".</p>}
        </div>
      </> : dialog.kind === 'profile' ? <>
        <div className="fd-profile-summary"><Person20Regular /><div><strong>Cookbook learner</strong><p>Local preview. No Microsoft account is connected.</p></div></div>
        <label className="fd-theme-label" htmlFor="fd-theme">Appearance</label>
        <select id="fd-theme" value={theme} onChange={event => changeTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select>
      </> : dialog.kind === 'feature' ? <>
        <span className="fd-preview-pill">Local preview</span>
        <p>{dialog.title === 'New Foundry only'
          ? 'This Cookbook uses the New Foundry experience only. There is no classic Foundry mode.'
          : dialog.title.includes('endpoint')
            ? 'The endpoints on this home are fictional examples. They cannot connect to Azure or run a model. No credentials are needed.'
            : `${dialog.title} is not available in this local preview. Catalog > Agents supports recipe details and local drafts; live agent execution, deployments, and other Foundry workflows are not connected.`}</p>
        <p className="fd-dialog-note">Nothing has been created, deployed, or sent to Azure.</p>
      </> : <>
        <p>A familiar starting point for learning to build agents with Microsoft Foundry. Explore the New Foundry home and Catalog &gt; Agents, then save an editable local draft from a starter manifest.</p>
        <p>Recipes use a shared declarative framework. Drafts are stored only in this browser, separately from the other Cookbooks. Projects and endpoints are fictional; models are reference metadata, not available deployments. This preview does not authenticate, run AI, or create Azure resources.</p>
        <p className="fd-dialog-note">Independent educational simulator, not the Microsoft Foundry service. Aptos and decorative assets load from Microsoft; interface icons use Microsoft Fluent UI. Documentation links open the official websites.</p>
        <details className="fd-asset-notices"><summary>Asset notices and licenses</summary><pre>{assetNotices}</pre></details>
      </>}
      {dialog.kind !== 'search' && <div className="fd-dialog-actions"><button className="fd-button fd-primary" type="button" onClick={() => setDialog(null)}>Got it</button></div>}
    </Modal>}
    {openedDraft && draftRecipe && <LocalDraftDialog key={openedDraft.id} recipe={draftRecipe} draft={openedDraft} drafts={localDrafts.drafts}
      onClose={() => setOpenedDraftId(null)} onSave={(recipe, edited) => {
        localDrafts.save(recipe, edited)
        setMessage(`"${edited.name}" saved locally.`)
      }} />}
  </div>
}
