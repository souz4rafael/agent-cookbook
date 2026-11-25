import { lazy, Suspense, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Add16Regular as Plus, ArrowCounterclockwiseRegular as RotateCcw, ChevronDown20Regular as ChevronDown,
  DatabaseRegular as Database, Dismiss20Regular as X,
  InfoRegular as Info, QuestionCircleRegular as CircleHelp, Share20Regular,
  Save20Regular as Save, ShieldCheckmarkRegular as ShieldCheck, Stethoscope20Regular as ClipboardCheck,
  WrenchRegular as Wrench,
} from '@fluentui/react-icons'
import type { CompiledRecipe, Connection, GuideStep, Session } from '../domain/types.ts'
import type { RecipeEntryMode } from '../domain/routes.ts'
import { getAvailableKnowledge, isStepComplete, isToolAvailable } from '../domain/engine.ts'
import { useRecipeSession } from '../hooks/useRecipeSession.ts'
import { ConnectionWizard, DocumentViewer } from './Connections.tsx'
import { ResourceChooser } from './ResourceChooser.tsx'
import { BuildEditor, ImplementationPanel } from './Panels.tsx'
import { HandoffDialog, TestPanel } from './TestPanel.tsx'
import type { HandoffOffer } from './TestPanel.tsx'
import { Modal } from './Modal.tsx'
import { InfoPopover } from './InfoPopover.tsx'
import { AgentIconPicker } from './AgentIcon.tsx'
import { StudioNavigation } from './StudioNavigation.tsx'
import { ChatHistoryLanding } from './ChatHistoryLanding.tsx'
import { ReviewGuide } from './ReviewGuide.tsx'
import { AgentOptionsMenu } from './AgentOptionsMenu.tsx'
import { InteractiveLab } from './InteractiveLab.tsx'
import { SkillReferences } from './SkillReferences.tsx'

const MonitorPanel = lazy(() => import('./MonitorPanel.tsx').then(module => ({ default: module.MonitorPanel })))
const EvaluatePanel = lazy(() => import('./EvaluatePanel.tsx').then(module => ({ default: module.EvaluatePanel })))

type HarnessMode = 'build' | 'preview' | 'evaluate' | 'monitor'
const modes: { id: HarnessMode; label: string }[] = [{ id: 'build', label: 'Build' }, { id: 'preview', label: 'Preview' }, { id: 'evaluate', label: 'Evaluate' }, { id: 'monitor', label: 'Monitor' }]
interface ChooserState { kind: 'knowledge' | 'tools'; manage: boolean }

function ConfigurationCard({ recipe, session, onChooser, onDocument, toggleKnowledge, toggleTool }: {
  recipe: CompiledRecipe
  session: Session
  onChooser: (kind: 'knowledge' | 'tools', manage?: boolean) => void
  onDocument: (id: string) => void
  toggleKnowledge: (id: string, enabled: boolean) => void
  toggleTool: (id: string, enabled: boolean) => void
}) {
  const knowledge = getAvailableKnowledge(recipe, session)
  const tools = recipe.tools.filter(tool => isToolAvailable(recipe, session, tool.id))
  return (
    <aside className="configuration-card" aria-label="Agent configuration">
      <h2 className="sr-only">Agent configuration</h2>
      <div className="configuration-model"><div className="heading-with-info"><span>Model</span><InfoPopover title="Model"><p>Choose the AI model that powers the agent. Auto lets the product select a model.</p><p>Model selection is not simulated in this recipe. Responses follow local rules; credit estimates use task-complexity bands rather than a specific model's token rates.</p></InfoPopover></div><button className="button small secondary" type="button" disabled>Auto <ChevronDown fontSize={12} aria-hidden="true" /></button></div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Triggers</h3><InfoPopover title="Triggers"><p>Define the events that start an agent, such as a schedule or an update in a connected service.</p><p>Not simulated in this recipe. Start a conversation in Preview instead.</p></InfoPopover></div><button className="icon-button" disabled type="button" aria-label="Add a trigger"><Plus aria-hidden="true" /></button></div><p>Set up what events can start the agent.</p></div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Skills</h3><InfoPopover title="Skills"><p>Give the agent reusable, structured instructions for specific tasks.</p><p>{recipe.skills?.length ? 'Open a skill to inspect its teaching scope. Reference-only skills do not execute. Use Review to run the available local exercise.' : "Not simulated in this recipe. Use Instructions to describe the agent's intended behaviour."}</p></InfoPopover></div><button className="icon-button" disabled type="button" aria-label="Add a skill"><Plus aria-hidden="true" /></button></div><p>Define behaviors through structured instructions</p>{recipe.skills && <SkillReferences skills={recipe.skills} />}</div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Tools</h3><InfoPopover title="Tools"><p>Let the agent perform actions through connectors, workflows, or other services.</p><p>{recipe.tools.length ? 'Use + to connect a fictional resource and select tools. Select an added tool to edit it, or use its x to remove it. Actions require confirmation in Preview and only create local simulated records.' : 'No tools are simulated in this recipe.'}</p></InfoPopover></div><button className="icon-button" type="button" disabled={recipe.tools.length === 0} onClick={() => onChooser('tools')} aria-label="Add a tool" title="Add a tool"><Plus aria-hidden="true" /></button></div><p>Connect the agent to external systems and actions</p><div className="configuration-chips">{tools.map(tool => <span className="configuration-chip" key={tool.id}><button type="button" onClick={() => onChooser('tools', true)}><Wrench fontSize={13} aria-hidden="true" /><span>{tool.title}</span></button><button type="button" onClick={() => toggleTool(tool.id, false)} aria-label={`Remove tool: ${tool.title}`}><X fontSize={12} aria-hidden="true" /></button></span>)}</div></div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Knowledge</h3><InfoPopover title="Knowledge"><p>Ground the agent's answers in documents and other trusted sources.</p><p>{recipe.knowledge.length ? 'Use + to connect a fictional library, then select its documents. Connecting alone does not add them. Select an added source to read it, or use its x to remove it. No external documents are accessed.' : 'No knowledge sources are simulated in this recipe.'}</p></InfoPopover></div><button className="icon-button" type="button" disabled={recipe.knowledge.length === 0} onClick={() => onChooser('knowledge')} aria-label="Add knowledge" title="Add knowledge"><Plus aria-hidden="true" /></button></div><p>Provide trusted context to guide decisions</p><div className="configuration-chips">{knowledge.map(document => <span className="configuration-chip" key={document.id}><button type="button" onClick={() => onDocument(document.id)}><Database fontSize={13} aria-hidden="true" /><span>{document.title}</span></button><button type="button" onClick={() => toggleKnowledge(document.id, false)} aria-label={`Remove source: ${document.title}`}><X fontSize={12} aria-hidden="true" /></button></span>)}</div></div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Connected agents</h3><InfoPopover title="Connected agents"><p>Delegate specialised work to other agents and use their results in a conversation.</p><p>Not simulated in this recipe. No other agents are contacted.</p></InfoPopover></div><button className="icon-button" disabled type="button" aria-label="Add a connected agent"><Plus aria-hidden="true" /></button></div><p>Collaborate across agents to complete work</p></div>
      <div className="configuration-section"><div><div className="heading-with-info"><h3>Memory <span>(preview)</span></h3><InfoPopover title="Memory"><p>Retain relevant context across conversations to personalise future interactions.</p><p>Not simulated in this recipe. Saved browser configuration and exercise history are not AI memory.</p></InfoPopover></div><label className="switch-label"><span className="sr-only">Memory</span><input type="checkbox" role="switch" checked={false} disabled readOnly /><span className="switch-track" aria-hidden="true" /></label></div><p>Save preferences and work progress across sessions to get better results over time.</p></div>
    </aside>
  )
}

export function Studio({ recipe, entryMode = 'build' }: { recipe: CompiledRecipe; entryMode?: RecipeEntryMode }) {
  const { session, storageWarning, error, updateProfile, updateIcon, connect, toggleKnowledge, toggleTool, sendMessage, reactToMessage, saveEvaluation, runEvaluation, confirmHandoff, reset, clearChat, updateLabInputs, runLab, openCitation } = useRecipeSession(recipe)
  const [mode, setMode] = useState<HarnessMode>(entryMode)
  const [chooser, setChooser] = useState<ChooserState | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<HandoffOffer | null>(null)
  const [showReview, setShowReview] = useState(entryMode === 'build')
  const [showExample, setShowExample] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showPublish, setShowPublish] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [showEnvironment, setShowEnvironment] = useState(false)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [resetCount, setResetCount] = useState(0)
  const reviewButton = useRef<HTMLButtonElement>(null)
  const sourceDocument = recipe.knowledge.find(item => item.id === documentId)
  const remaining = recipe.journey.filter(step => !isStepComplete(recipe, session, step)).length
  function openChooser(kind: 'knowledge' | 'tools', manage = false) { setChooser({ kind, manage }) }
  function openExample(caseId?: string) {
    if (caseId) {
      const example = recipe.lab?.cases.find(item => item.id === caseId)
      if (!example) throw new Error(`Unknown example "${caseId}".`)
      if (!updateLabInputs({ ...example.inputs })) return
    }
    setShowReview(false)
    setShowExample(true)
  }
  function jumpToStep(step: GuideStep) {
    setShowReview(false)
    if (step.completeWhen.type === 'evaluation-passed') { setMode('evaluate'); return }
    if (step.completeWhen.type === 'case-tested') { openExample(step.completeWhen.caseId); return }
    if (step.completeWhen.type === 'citation-opened' || step.completeWhen.type === 'action-confirmed') { setMode('preview'); return }
    if (step.completeWhen.type === 'event') { setMode('preview'); return }
    if (step.tab === 'knowledge' || step.tab === 'tools') { setMode('build'); openChooser(step.tab, true); return }
    if (step.tab === 'activity') { setMode('monitor'); return }
    if (step.tab === 'handoff') { setShowPublish(true); return }
    setMode('build')
  }
  function keyboardModes(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % modes.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + modes.length) % modes.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = modes.length - 1
    else return
    event.preventDefault()
    setMode(modes[next].id)
    document.getElementById(`mode-${modes[next].id}`)?.focus()
  }
  return (
    <div className="harness-shell">
      <a className="skip-link" href="#studio-main" onClick={event => { event.preventDefault(); document.getElementById('studio-main')?.focus() }}>Skip to workspace</a>
      <StudioNavigation activePage={showChatHistory ? 'chat' : 'agents'} onChat={() => setShowChatHistory(true)} onEnvironment={() => setShowEnvironment(true)} />
      {showChatHistory && <ChatHistoryLanding onReturnToRecipe={() => setShowChatHistory(false)} />}
      <div className="harness-workspace" hidden={showChatHistory}>
        <header className="agent-toolbar">
          <div className="toolbar-agent"><button type="button" className="toolbar-agent-name" onClick={() => setMode('build')} title={recipe.title}>{session.profile.name || recipe.title}</button><span className="draft-badge"><span />Draft</span><span className="simulation-badge">SIMULATION</span></div>
          <nav className="mode-tabs" role="tablist" aria-label="Agent workspace">{modes.map((item, index) => <button key={item.id} id={`mode-${item.id}`} type="button" role="tab" aria-selected={mode === item.id} aria-controls="studio-main" tabIndex={mode === item.id ? 0 : -1} onClick={() => setMode(item.id)} onKeyDown={event => keyboardModes(event, index)}>{item.label}</button>)}</nav>
          <div className="toolbar-actions">
            <div className="toolbar-utilities">
              <AgentOptionsMenu onReset={() => setShowReset(true)} />
              <button className="icon-button toolbar-share" type="button" disabled aria-label="Share agent" title="Sharing is not simulated"><Share20Regular aria-hidden="true" /></button>
              <span className={`save-status${storageWarning ? ' warning' : ''}`} title={storageWarning ?? 'Configuration saved only in this browser'}><Save aria-hidden="true" /><span className="sr-only">{storageWarning ? 'Storage notice' : 'Saved locally'}</span></span>
            </div>
            <button ref={reviewButton} className="button secondary review-button" type="button" aria-haspopup="dialog" aria-expanded={showReview} onClick={() => setShowReview(true)}><span className="review-icon"><ClipboardCheck aria-hidden="true" /><span className="review-count" aria-label={`${remaining} remaining steps`}>{remaining}</span></span>Review</button>
            <button className="button publish-button" type="button" onClick={() => setShowPublish(true)}>Publish</button>
          </div>
        </header>
        {storageWarning && <div className="storage-warning" role="status"><Info fontSize={16} aria-hidden="true" /><p>{storageWarning} Download the implementation brief to keep your choices.</p></div>}
        {error && <div className="error-notice" role="alert"><Info fontSize={16} aria-hidden="true" /><p>{error}</p></div>}
        <main className="harness-content" id={showChatHistory ? undefined : 'studio-main'} role="tabpanel" aria-labelledby={`mode-${mode}`} tabIndex={-1}>
          {mode === 'build' && <div className="build-layout"><BuildEditor recipe={recipe} session={session} updateProfile={updateProfile} onChangeIcon={() => setShowIconPicker(true)} /><ConfigurationCard recipe={recipe} session={session} onChooser={openChooser} onDocument={setDocumentId} toggleKnowledge={toggleKnowledge} toggleTool={toggleTool} /></div>}
          <TestPanel key={resetCount} active={mode === 'preview' && !showChatHistory} recipe={recipe} session={session} sendMessage={sendMessage} clearChat={clearChat} onDocument={setDocumentId} onCitation={id => { if (openCitation(id)) setDocumentId(id) }} onHandoff={setHandoff} onReact={reactToMessage} />
          {mode === 'evaluate' && <Suspense fallback={<p className="workspace-page" role="status">Loading Evaluate...</p>}><EvaluatePanel recipe={recipe} session={session} onSave={saveEvaluation} onRun={runEvaluation} onDocument={setDocumentId} /></Suspense>}
          {mode === 'monitor' && <Suspense fallback={<p className="workspace-page" role="status">Loading Monitor...</p>}><MonitorPanel recipe={recipe} session={session} /></Suspense>}
        </main>
      </div>
      <div className="sr-only" role="status">{session.activity.at(-1)?.text}</div>
      {chooser && <ResourceChooser key={`${chooser.kind}:${chooser.manage}`} kind={chooser.kind} initialManage={chooser.manage} recipe={recipe} session={session} onClose={() => setChooser(null)} onConnect={setConnection} disconnect={id => connect(id, null)} toggleKnowledge={toggleKnowledge} toggleTool={toggleTool} onDocument={setDocumentId} />}
      {connection && <ConnectionWizard key={connection.id} connection={connection} currentResource={session.connections[connection.id]} onClose={() => setConnection(null)} onConnect={resourceId => { connect(connection.id, resourceId); setConnection(null) }} />}
      {sourceDocument && <DocumentViewer document={sourceDocument} recipe={recipe} session={session} onClose={() => setDocumentId(null)} />}
      {handoff && <HandoffDialog offer={handoff} recipe={recipe} session={session} onClose={() => setHandoff(null)} onConfirm={(toolId, summary) => { const confirmed = confirmHandoff(toolId, summary); if (confirmed) setHandoff(null); return confirmed }} />}
      {showReview && <ReviewGuide recipe={recipe} session={session} updateProfile={updateProfile} onClose={() => setShowReview(false)} onJump={jumpToStep} onTryExample={() => openExample()} anchorRef={reviewButton} />}
      {showExample && <Modal title="Try this example" eyebrow="COOKBOOK LEARNING CONTROLS" className="lab-dialog" wide onClose={() => setShowExample(false)}>
        <div className="modal-body">
          {error && <p className="error-notice" role="alert">{error}</p>}
          <InteractiveLab recipe={recipe} session={session} onChange={updateLabInputs} onRun={() => {
            if (!runLab()) return false
            setShowExample(false)
            setShowChatHistory(false)
            setMode('preview')
            setResetCount(value => value + 1)
            return true
          }} />
        </div>
        <div className="modal-footer"><span className="fine-print">Closing keeps input edits but does not run an example.</span><button type="button" className="button secondary" onClick={() => setShowExample(false)}>Close</button></div>
      </Modal>}
      {showIconPicker && <AgentIconPicker icon={session.agentIcon} onSave={updateIcon} onClose={() => setShowIconPicker(false)} />}
      {showPublish && <Modal title="Publish preview" eyebrow="SIMULATION · NOT A REAL PUBLICATION" onClose={() => setShowPublish(false)} wide><ImplementationPanel recipe={recipe} session={session} onPreview={() => { setShowPublish(false); setMode('preview') }} /></Modal>}
      {showReset && <Modal title="Reset this recipe?" onClose={() => setShowReset(false)}><div className="modal-body"><p>This restores the original profile and removes this recipe’s connections, selected sources, enabled tools, conversation, reactions, evaluation, activity, and simulated requests from this browser.</p><div className="callout"><Info fontSize={18} aria-hidden="true" /><p>To keep your configuration and just start another conversation, use New chat in Preview.</p></div></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setShowReset(false)}>Keep my work</button><button className="button danger" type="button" onClick={() => { if (reset()) { setResetCount(value => value + 1); setMode('build'); setShowReset(false) } }}><RotateCcw fontSize={15} aria-hidden="true" />Reset recipe</button></div></Modal>}
      {showEnvironment && <Modal title="Your local learning environment" eyebrow="COPILOT STUDIO AGENTS COOKBOOK" onClose={() => setShowEnvironment(false)}><div className="modal-body"><div className="callout accent"><ShieldCheck fontSize={22} aria-hidden="true" /><p>This independent educational simulator uses fictional data and deterministic rules. It is not an official Microsoft product and is not connected to a real environment or account.</p></div><p className="environment-note">Your configuration and exercise history are stored in this browser. Do not enter personal or confidential data. No generative AI, external requests, or real publications are performed.</p><p className="environment-note"><CircleHelp fontSize={16} aria-hidden="true" />Use Review for guided steps and Publish for an implementation brief.</p></div><div className="modal-footer"><span className="fine-print">Agents Cookbook beta</span><button className="button secondary" type="button" onClick={() => setShowEnvironment(false)}>Close</button></div></Modal>}
    </div>
  )
}
