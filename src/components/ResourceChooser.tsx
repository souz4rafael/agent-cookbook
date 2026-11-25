import { useState } from 'react'
import {
  ArrowLeftRegular as ArrowLeft, ArrowUpRightRegular as ArrowUpRight, CheckmarkRegular as Check,
  ChevronRight20Regular as ChevronRight, DocumentTextRegular as FileText,
  InfoRegular as Info, LayerRegular as Layers3, SearchRegular as Search,
  Star20Regular as Star, CloudArrowUpRegular as UploadCloud,
  FlowRegular as Workflow, WrenchRegular as Wrench,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Connection, Session } from '../domain/types.ts'
import { getAvailableKnowledge } from '../domain/engine.ts'
import { Modal } from './Modal.tsx'
import { ConnectionCard, DocumentViewer } from './Connections.tsx'
import type { WizardConnection } from './Connections.tsx'
import { InfoPopover } from './InfoPopover.tsx'
import { useReviewCue } from './reviewCue.ts'
import publicWebsitesIcon from '../assets/providers/public-websites.svg'
import sharePointIcon from '../assets/providers/sharepoint.svg'
import oneDriveIcon from '../assets/providers/onedrive.svg'
import dataverseIcon from '../assets/providers/dataverse.svg'
import serviceNowIcon from '../assets/providers/servicenow.png'
import azureSqlIcon from '../assets/providers/azure-sql.png'

export function ResourceChooser({ kind, initialManage, recipe, session, onClose, onConnect, disconnect, toggleKnowledge, toggleTool, onDocument }: {
  kind: 'knowledge' | 'tools'
  initialManage?: boolean
  recipe: CompiledRecipe
  session: Session
  onClose: () => void
  onConnect: (connection: WizardConnection) => void
  disconnect: (id: string) => void
  toggleKnowledge: (documentId: string, enabled: boolean) => void
  toggleTool: (toolId: string, enabled: boolean) => void
  onDocument: (documentId: string) => void
}) {
  const [manage, setManage] = useState(initialManage ?? false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Featured')
  const [selected, setSelected] = useState(() => new Set(kind === 'knowledge' ? session.enabledKnowledge : session.enabledTools))
  const [wizardOpen, setWizardOpen] = useState(false)
  const [reviewDocument, setReviewDocument] = useState<CompiledRecipe['knowledge'][number] | null>(null)
  const reviewCue = useReviewCue()
  const cue = wizardOpen || reviewDocument ? null : reviewCue
  const isKnowledge = kind === 'knowledge'
  const connections = recipe.connections.filter(connection => isKnowledge
    ? recipe.knowledge.some(document => document.connectionId === connection.id)
    : recipe.tools.some(tool => tool.connectionId === connection.id))
  const contains = (value: string) => value.toLocaleLowerCase('en-GB').includes(query.toLocaleLowerCase('en-GB'))
  const hasSharePoint = connections.some(connection => connection.type === 'sharepoint')
  const providers = [
    { title: 'Public websites', icon: publicWebsitesIcon, available: false, description: 'Use publicly accessible web pages as sources for grounded answers.' },
    { title: 'SharePoint', icon: sharePointIcon, available: hasSharePoint, description: 'Use files and content from a SharePoint site or document library.' },
    { title: 'OneDrive for Business', icon: oneDriveIcon, available: false, description: 'Use work documents stored in OneDrive as knowledge sources.' },
    { title: 'Dataverse', icon: dataverseIcon, available: false, description: 'Ground answers in business data held in Dataverse tables.' },
    { title: 'ServiceNow', icon: serviceNowIcon, available: false, description: 'Find answers in ServiceNow knowledge articles and service information.' },
    { title: 'Azure SQL', icon: azureSqlIcon, available: false, description: 'Retrieve structured information from an Azure SQL database.' },
  ]
  const items = isKnowledge ? recipe.knowledge : recipe.tools
  const target = isKnowledge && cue?.type === 'knowledge' ? recipe.knowledge.find(doc => doc.id === cue.documentId)
    : !isKnowledge && cue?.type === 'tool' ? recipe.tools.find(tool => tool.id === cue.toolId)
    : undefined
  const targetConnection = connections.find(connection => connection.id === (cue?.type === 'connection' ? cue.connectionId : target?.connectionId))
  const targetReady = !!target && session.connections[target.connectionId] === target.resourceId
  const selectId = targetReady && !selected.has(target.id) ? target.id : undefined
  const applyActive = targetReady && selected.has(target.id)
  const selectable = items.filter(item => session.connections[item.connectionId] === item.resourceId)
  const selectedCount = selectable.filter(item => selected.has(item.id)).length
  const existing = isKnowledge ? session.enabledKnowledge : session.enabledTools
  const categories = isKnowledge ? ['Featured', 'Advanced'] : ['Featured', 'MCP', 'Connectors', 'Workflows']
  const unavailableTools = [
    { title: 'Email connector', description: 'Read or send email through a connected mailbox.' },
    { title: 'Teams connector', description: 'Work with conversations and actions in Microsoft Teams.' },
    { title: 'External database', description: 'Query or update records in a connected database.' },
    { title: 'Custom connector', description: 'Expose an API as actions that the agent can use.' },
  ]
  function choose(id: string, checked: boolean) {
    setSelected(previous => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next })
  }
  function apply() {
    for (const item of items) {
      const enabled = selected.has(item.id) && session.connections[item.connectionId] === item.resourceId
      if (enabled !== existing.includes(item.id)) {
        if (isKnowledge) toggleKnowledge(item.id, enabled)
        else toggleTool(item.id, enabled)
      }
    }
    onClose()
  }
  function openManage() { setManage(true); setQuery('') }
  function openConnection(connection: Connection) {
    if (!targetConnection) { onConnect(connection); return }
    setWizardOpen(true)
    onConnect({
      ...connection,
      chooserReview: {
        item: target?.connectionId === connection.id
          ? { type: isKnowledge ? 'knowledge' : 'tool', id: target.id, resourceId: target.resourceId }
          : undefined,
        onReturn: () => setWizardOpen(false),
      },
    })
  }
  const toolsVisible = category === 'Featured' || category === 'Connectors'
  return <>
    <Modal title={manage ? isKnowledge ? 'Manage knowledge' : 'Manage tools' : isKnowledge ? 'Add knowledge' : 'Add a tool'} onClose={onClose} className="resource-chooser" wide>
      <div className="chooser-content">
        {manage && <button className="text-button chooser-back" type="button" onClick={() => { setManage(false); setQuery('') }}><ArrowLeft fontSize={14} aria-hidden="true" />All {isKnowledge ? 'knowledge sources' : 'tools'}</button>}
        <p className="chooser-subtitle">{isKnowledge ? 'Help your agent provide relevant information and grounded answers.' : 'Give your agent tools to carry out tasks.'}</p>
        <label className="search-field"><Search fontSize={18} aria-hidden="true" /><span className="sr-only">Search {isKnowledge ? 'knowledge sources' : 'tools'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={isKnowledge ? 'Search for a knowledge source' : 'Search tools'} /></label>
        {!manage && <>
          {isKnowledge && <div className="upload-unavailable"><UploadCloud fontSize={38} aria-hidden="true" /><div className="heading-with-info"><strong>Upload files</strong><InfoPopover title="File uploads"><p>Add documents directly as knowledge for the agent.</p><p>Not simulated in this recipe. Use the supplied fictional SharePoint sources instead. No personal files are uploaded or read.</p></InfoPopover></div><button className="button small secondary" type="button" disabled>Browse files</button></div>}
          <div className="filter-tabs" role="tablist" aria-label={isKnowledge ? 'Knowledge categories' : 'Tool categories'}>
            {categories.map((label, index) => <button key={label} id={`chooser-category-${kind}-${index}`} type="button" role="tab" aria-selected={category === label} aria-controls={`chooser-results-${kind}`} tabIndex={category === label ? 0 : -1} onClick={() => setCategory(label)} onKeyDown={event => {
              let next = index
              if (event.key === 'ArrowRight') next = (index + 1) % categories.length
              else if (event.key === 'ArrowLeft') next = (index - 1 + categories.length) % categories.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = categories.length - 1
              else return
              event.preventDefault()
              setCategory(categories[next])
              document.getElementById(`chooser-category-${kind}-${next}`)?.focus()
            }}>{label === 'Featured' ? <Star fontSize={15} aria-hidden="true" /> : label === 'Workflows' ? <Workflow fontSize={15} aria-hidden="true" /> : label === 'Advanced' ? <Wrench fontSize={15} aria-hidden="true" /> : <Layers3 fontSize={15} aria-hidden="true" />}{label}</button>)}
          </div>
          <div role="tabpanel" id={`chooser-results-${kind}`} aria-labelledby={`chooser-category-${kind}-${categories.indexOf(category)}`}>
          {isKnowledge ? <>
            <div className="provider-grid">{providers.filter(provider => contains(provider.title) && (category === 'Featured' || !provider.available)).map(({ title, icon, available, description }) => <div className="provider-card" key={title}><button className="provider-select" type="button" disabled={!available} data-review-cue={(available && title === 'SharePoint' && targetConnection?.type === 'sharepoint') || undefined} onClick={openManage}><span className="provider-icon"><img src={icon} width={24} height={24} alt="" /></span><strong>{title}</strong>{available && <ChevronRight fontSize={16} aria-hidden="true" />}</button><InfoPopover title={title}><p>{description}</p><p>{available ? 'This recipe uses a fictional library. Connect the example resource, select documents, then add them to the agent. No real sign-in or SharePoint access takes place.' : 'Not simulated in this recipe.'}</p></InfoPopover></div>)}</div>
            {!providers.some(provider => contains(provider.title) && (category === 'Featured' || !provider.available)) && <p className="empty-search">No matching sources. Try another search.</p>}
          </> : <>
            {toolsVisible ? <><div className="provider-grid">{recipe.tools.filter(tool => contains(`${tool.title} ${tool.description}`)).map(tool => <div className="provider-card recipe-tool-provider" key={tool.id}><button className="provider-select" type="button" data-review-cue={(target?.id === tool.id) || undefined} onClick={openManage}><span className="provider-icon"><Wrench fontSize={24} aria-hidden="true" /></span><strong>{tool.title}</strong><ChevronRight fontSize={16} aria-hidden="true" /></button><InfoPopover title={tool.title}><p>{tool.description}</p><p>{tool.realWorldNote}</p></InfoPopover></div>)}{unavailableTools.filter(tool => contains(tool.title)).map(tool => <div className="provider-card" key={tool.title}><button className="provider-select" type="button" disabled><span className="provider-icon"><Layers3 fontSize={22} aria-hidden="true" /></span><strong>{tool.title}</strong></button><InfoPopover title={tool.title}><p>{tool.description}</p><p>Not simulated in this recipe.</p></InfoPopover></div>)}</div>{!recipe.tools.some(tool => contains(`${tool.title} ${tool.description}`)) && !unavailableTools.some(tool => contains(tool.title)) && <p className="empty-search">No matching tools. Try another search.</p>}</> : <div className="empty-state"><Layers3 fontSize={28} aria-hidden="true" /><div className="heading-with-info"><h3>{category === 'MCP' ? 'MCP servers' : 'Workflows'}</h3><InfoPopover title={category === 'MCP' ? 'MCP servers' : 'Workflows'}><p>{category === 'MCP' ? 'Connect tools exposed by a Model Context Protocol server.' : 'Run multi-step processes that combine actions and connected services.'}</p><p>Not simulated in this recipe. Choose a tool from Featured instead.</p></InfoPopover></div></div>}
          </>}
          </div>
        </>}
        {manage && <>
          <section className="chooser-section"><div className="section-title-row"><h3>1. Connect a fictional resource</h3><span className="simulation-badge">NO REAL SIGN-IN</span></div><div className="card-stack">{connections.map(connection => <ConnectionCard key={connection.id} connection={connection} resourceId={session.connections[connection.id]} reviewActive={connection.id === targetConnection?.id && !targetReady} onConnect={() => openConnection(connection)} onDisconnect={() => disconnect(connection.id)} />)}</div>{connections.length === 0 && <p>No connections are required by this recipe.</p>}</section>
          <section className="chooser-section">
            <div className="section-title-row"><h3>2. Select {isKnowledge ? 'sources' : 'tools'}</h3><span className="count-badge">{selectedCount} selected</span></div>
            <div className="card-stack">{isKnowledge ? recipe.knowledge.filter(document => contains(`${document.title} ${document.summary}`)).map(document => {
              const connected = session.connections[document.connectionId] === document.resourceId
              const connection = recipe.connections.find(item => item.id === document.connectionId)
              const resource = connection?.resources.find(item => item.id === document.resourceId)
              return <article className={`selection-card${connected && selected.has(document.id) ? ' selected' : ''}`} key={document.id}><label data-review-cue={(selectId === document.id) || undefined}><input type="checkbox" checked={connected && selected.has(document.id)} disabled={!connected} onChange={event => choose(document.id, event.target.checked)} aria-describedby={`source-reason-${document.id}`} /><FileText fontSize={22} aria-hidden="true" /><span><strong>{document.title}</strong><span>{document.summary}</span></span></label><div className="selection-card-footer"><p id={`source-reason-${document.id}`}>{connected ? 'Available for this selection' : `Connect ${connection?.title ?? 'the source connection'} to “${resource?.label ?? document.resourceId}” first.`}</p><button className="text-button" type="button" onClick={() => { if (targetConnection) setReviewDocument(document); else onDocument(document.id) }} aria-label={`Read source: ${document.title}`}>Read source <ArrowUpRight fontSize={13} aria-hidden="true" /></button></div></article>
            }) : recipe.tools.filter(tool => contains(`${tool.title} ${tool.description}`)).map(tool => {
              const connected = session.connections[tool.connectionId] === tool.resourceId
              const connection = recipe.connections.find(item => item.id === tool.connectionId)
              const resource = connection?.resources.find(item => item.id === tool.resourceId)
              const missingKnowledge = (tool.requiredKnowledge ?? []).filter(id => !getAvailableKnowledge(recipe, session).some(document => document.id === id))
                .map(id => recipe.knowledge.find(document => document.id === id)?.title ?? id)
              return <article className={`selection-card${connected && selected.has(tool.id) ? ' selected' : ''}`} key={tool.id}><label data-review-cue={(selectId === tool.id) || undefined}><input type="checkbox" checked={connected && selected.has(tool.id)} disabled={!connected} onChange={event => choose(tool.id, event.target.checked)} aria-describedby={`tool-reason-${tool.id}`} /><Wrench fontSize={22} aria-hidden="true" /><span><strong>{tool.title}</strong><span>{tool.description}</span></span></label><div className="tool-selection-details heading-with-info"><p id={`tool-reason-${tool.id}`}>{connected ? 'Running this tool requires confirmation in Preview.' : `Connect ${connection?.title ?? 'the tool connection'} to “${resource?.label ?? tool.resourceId}” first.`}{missingKnowledge.length > 0 && ` Before running, add required knowledge: ${missingKnowledge.join('; ')}.`}</p><InfoPopover title={tool.title}><p>{tool.description}</p><p>{tool.realWorldNote}</p></InfoPopover></div></article>
            })}</div>
          </section>
          <div className="callout"><Info fontSize={17} aria-hidden="true" /><p>Source and tool selections are applied with the button below. A connection you explicitly confirm is saved immediately; cancelling this selection does not disconnect it.</p></div>
        </>}
      </div>
      <div className="modal-footer"><span className="fine-print">Fictional data. Nothing is sent to external services.</span><div className="footer-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button>{manage && <button className="button primary" type="button" data-review-cue={applyActive || undefined} onClick={apply}><Check fontSize={16} aria-hidden="true" />{existing.length ? 'Apply changes' : 'Add to agent'}</button>}</div></div>
    </Modal>
    {reviewDocument && <DocumentViewer document={reviewDocument} recipe={recipe} session={session} onClose={() => setReviewDocument(null)} />}
  </>
}
