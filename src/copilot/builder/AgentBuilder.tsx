import { Fragment, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Add20Regular, ArrowClockwise20Regular, ArrowRight20Regular, CheckmarkCircle20Regular,
  ChevronDown20Regular, ChevronRight20Regular, Cloud20Regular, Database20Regular,
  Delete20Regular, Dismiss20Regular, Edit20Regular, Eye20Filled, Globe20Regular,
  Info16Regular, Mail20Regular, Mic20Filled, MoreHorizontal20Regular,
  PeopleTeam20Regular, PlugConnected20Regular, ReOrderDotsVertical20Regular,
  Settings20Regular, ShieldTask20Regular, SquareMultiple20Regular, TextQuote20Regular,
  WindowNew20Regular,
} from '@fluentui/react-icons'
import { Modal } from '../../components/Modal.tsx'
import { PopupMenu } from '../../components/PopupMenu.tsx'
import { BuilderIcon } from './BuilderIcon.tsx'
import { BuilderPreview } from './BuilderPreview.tsx'
import { builderLimits } from './schema.ts'
import type { BuilderRecipe, KnowledgeKind } from './schema.ts'
import { builderModes, toPreviewAgent, validateForCreate } from './state.ts'
import type { BuilderDraft } from './state.ts'

type Dialog = { kind: 'info'; title: string; text: string }
  | { kind: 'instructions' | 'skills' | 'icon' | 'create' | 'reset' | 'improve' }
  | { kind: 'knowledge'; sourceKind?: KnowledgeKind }

function ToolButton({ label, children, onClick, pressed }: { label: string; children: ReactNode; onClick: () => void; pressed?: boolean }) {
  return <button type="button" className="cp-icon-button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>{children}</button>
}

function InstructionText({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).map((block, index) => {
    const lines = block.split('\n')
    const listStart = lines.findIndex(line => /^[-*]\s/.test(line))
    if (listStart >= 0 && lines.slice(listStart).every(line => /^[-*]\s/.test(line))) return <Fragment key={index}>
      {listStart > 0 && <p>{lines.slice(0, listStart).join('\n')}</p>}
      <ul>{lines.slice(listStart).map((line, index) => <li key={index}>{line.slice(2)}</li>)}</ul>
    </Fragment>
    return <p key={index}>{block}</p>
  })}</>
}

function KnowledgeIcon({ kind }: { kind: KnowledgeKind }) {
  const icons = {
    'cloud-files': <Cloud20Regular />, outlook: <Mail20Regular />, teams: <PeopleTeam20Regular />,
    fabric: <Database20Regular />, connectors: <PlugConnected20Regular />, dynamics: <SquareMultiple20Regular />,
    web: <Globe20Regular />, attachments: <Add20Regular />,
  }
  return <span className={`cb-knowledge-icon cb-knowledge-${kind}`} aria-hidden="true">{icons[kind]}</span>
}

const addKnowledgeLabels: Record<KnowledgeKind, string> = {
  'cloud-files': 'Add cloud file source', outlook: 'Add Outlook source', teams: 'Add Teams source',
  fabric: 'Add Fabric source', connectors: 'Add Copilot connector source',
  dynamics: 'Add Dynamics 365 or Power Apps source', web: 'Add website', attachments: 'Attach file',
}

export function AgentBuilder({ recipe, draft, warning, error, onChange, onCreate, onReset, onDismiss }: {
  recipe: BuilderRecipe
  draft: BuilderDraft
  warning: string
  error: string
  onChange: (draft: BuilderDraft) => boolean
  onCreate: () => boolean
  onReset: () => void
  onDismiss: () => void
}) {
  const [view, setView] = useState<'Configure' | 'Preview'>('Configure')
  const [mobileDescribe, setMobileDescribe] = useState(false)
  const [editingInstructions, setEditingInstructions] = useState(false)
  const [menu, setMenu] = useState<'view' | 'mode' | 'more' | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [goal, setGoal] = useState('')
  const [describeMessages, setDescribeMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [created, setCreated] = useState(false)
  const viewRef = useRef<HTMLButtonElement>(null)
  const modeRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const previewKey = useMemo(() => JSON.stringify(toPreviewAgent(recipe, draft)) + draft.mode + draft.profile.instructions, [recipe, draft])

  function change(next: BuilderDraft) { setCreated(false); return onChange({ ...next, status: 'draft' }) }
  function profile(field: keyof BuilderDraft['profile'], value: string) { change({ ...draft, profile: { ...draft.profile, [field]: value } }) }
  function info(title: string, text: string) { setDialog({ kind: 'info', title, text }) }
  function openSources(sourceKind?: KnowledgeKind) {
    setSelection(sourceKind ? draft.knowledge.find(row => row.id === sourceKind)?.sourceIds ?? [] : draft.knowledge.flatMap(row => row.sourceIds))
    setDialog({ kind: 'knowledge', sourceKind })
  }
  function toggleSelection(id: string) { setSelection(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]) }
  function applySources(sourceKind?: KnowledgeKind) {
    change({ ...draft, knowledge: draft.knowledge.map(row => {
      if (sourceKind && row.id !== sourceKind) return row
      const sourceIds = selection.filter(id => recipe.sources.some(source => source.id === id && source.kind === row.id))
      return { ...row, sourceIds, enabled: sourceKind === row.id || sourceIds.length > 0 || row.enabled }
    }) })
    setDialog(null)
  }
  function updatePrompt(id: string, field: 'title' | 'message', value: string) {
    change({ ...draft, prompts: draft.prompts.map(prompt => prompt.id === id ? { ...prompt, [field]: value } : prompt) })
  }
  function movePrompt(from: number, to: number) {
    if (from === to || to < 0 || to >= draft.prompts.length) return
    const prompts = [...draft.prompts]
    const [moved] = prompts.splice(from, 1)
    if (!moved) { info('Suggested prompts', 'That prompt is no longer available.'); return }
    prompts.splice(to, 0, moved)
    change({ ...draft, prompts })
  }
  function describe() {
    if (!goal.trim()) return
    if (describeMessages.length >= 30) { info('Describe', 'Start a new recipe session to continue this local description history.'); return }
    const text = goal.trim()
    if (!change({ ...draft, profile: { ...draft.profile, description: text } })) return
    setDescribeMessages(current => [...current, { role: 'user', text }, {
      role: 'assistant', text: 'I placed your description in the local draft. Review the name, instructions, knowledge and suggested prompts in Configure. This is a scripted authoring helper, not a live AI model.',
    }])
    setGoal('')
  }
  function sectionHeader(title: string, actions?: ReactNode) {
    return <div className="cb-section-heading"><div><h2>{title}</h2><ToolButton label={`More information about ${title}`} onClick={() => info(title,
      title === 'Instructions' ? 'Describe the agent\'s purpose, scope and behavior. Instructions are saved as editable text; this local preview follows the recipe\'s scripted rules, not a connected language model.'
        : title === 'Knowledge' ? 'These controls select fictional fixtures. No Microsoft 365 connection, web search or file upload occurs.'
          : title === 'Agents & Skills' ? 'Select local example capabilities for this recipe. They change available preview examples without calling a real agent or tool.'
            : 'Provide a title and message for each suggested prompt. Up to twelve prompts can appear in the preview.')}><Info16Regular /></ToolButton></div>{actions}</div>
  }
  const instructionEditor = <textarea className="cb-instruction-editor" aria-label="Instructions" value={draft.profile.instructions} maxLength={builderLimits.instructions} onChange={event => profile('instructions', event.target.value)} />

  function knowledgeRow(kind: KnowledgeKind) {
    const row = draft.knowledge.find(item => item.id === kind)
    const definition = recipe.knowledge.find(item => item.id === kind)
    if (!row || !definition) return null
    const label = definition.label
    const attachment = kind === 'attachments'
    return <div className={`cb-knowledge-row${kind === 'web' || attachment ? ' cb-knowledge-separated' : ''}`} key={kind}>
      <KnowledgeIcon kind={kind} /><h3>{label}</h3>
      {kind === 'connectors' && <ToolButton label="Expand Copilot connectors" onClick={() => openSources(kind)}><ChevronRight20Regular /></ToolButton>}
      {attachment && <ToolButton label="More information about Attachments" onClick={() => info('Attachments', 'Only fictional files included with this recipe can be selected. Local files are not read or uploaded.')}><Info16Regular /></ToolButton>}
      <span className="cb-knowledge-scope">{['cloud-files', 'outlook', 'teams', 'web'].includes(kind) ? row.sourceIds.length ? `${row.sourceIds.length} selected` : 'Search all' : ''}</span>
      <div className="cb-knowledge-actions">
        {!['fabric', 'connectors'].includes(kind) && <ToolButton label={addKnowledgeLabels[kind]} onClick={() => openSources(kind)}><Add20Regular /></ToolButton>}
        {!attachment && <button className="cp-switch" role="switch" aria-label={label} aria-checked={row.enabled} onClick={() => change({
          ...draft, knowledge: draft.knowledge.map(item => item.id === kind ? { ...item, enabled: !item.enabled } : item),
        })}><span /></button>}
      </div>
    </div>
  }

  const sections: Record<BuilderRecipe['sections'][number], ReactNode> = {
    instructions: <section className="cb-card cb-instructions" key="instructions">
      {sectionHeader('Instructions', <div className="cb-instruction-actions">
        <button className="cb-button cb-improve" onClick={() => setDialog({ kind: 'improve' })}><TextQuote20Regular />Suggest improvements</button>
        <div className="cb-segmented"><ToolButton label="Preview instructions" pressed={!editingInstructions} onClick={() => setEditingInstructions(false)}><Eye20Filled /></ToolButton>
          <ToolButton label="Edit instructions" pressed={editingInstructions} onClick={() => setEditingInstructions(true)}><Edit20Regular /></ToolButton></div>
        <ToolButton label="Pop out instructions" onClick={() => setDialog({ kind: 'instructions' })}><WindowNew20Regular /></ToolButton>
      </div>)}
      <div className="cb-instruction-content">{editingInstructions ? instructionEditor : <div className="cb-instruction-view" role="region" aria-label="Instructions"><InstructionText text={draft.profile.instructions} /></div>}</div>
      <p className="cb-instruction-footnote">Consider reviewing the {recipe.title} template <button onClick={() => info(`${recipe.title} documentation`, `${recipe.summary}\n\nThis recipe is declarative: its JSON file supplies the editable profile, knowledge, skills, suggested prompts and preview rules. Changes stay in your browser. The preview does not run edited instructions or train a model.`)}>documentation</button>.</p>
    </section>,
    skills: <section className="cb-card" key="skills">
      {sectionHeader('Agents & Skills', <button className="cb-button" onClick={() => { setSelection(draft.skillIds); setDialog({ kind: 'skills' }) }}>Add<ChevronDown20Regular /></button>)}
      {draft.skillIds.length ? <div className="cb-selected-items">{draft.skillIds.map(id => <div key={id}><span>{recipe.skills.find(skill => skill.id === id)?.title}</span>
        <ToolButton label={`Remove ${recipe.skills.find(skill => skill.id === id)?.title}`} onClick={() => change({ ...draft, skillIds: draft.skillIds.filter(value => value !== id) })}><Dismiss20Regular /></ToolButton></div>)}</div>
        : <p className="cb-section-description">Add agents and skills to help this agent with specialized tasks.</p>}
    </section>,
    knowledge: <section className="cb-card" key="knowledge">
      {sectionHeader('Knowledge', <div className="cb-inline-actions">
        <ToolButton label="Refresh knowledge source names and check for updates." onClick={() => info('Knowledge refreshed', 'The local recipe fixtures are current. No external sources were contacted.')}><ArrowClockwise20Regular /></ToolButton>
        <ToolButton label="Add knowledge" onClick={() => openSources()}><Add20Regular /></ToolButton>
        <ToolButton label="Knowledge settings" onClick={() => info('Knowledge settings', 'Enabled categories search their fictional sample sources. Select specific sources with the plus button to narrow the context. Empty selections mean Search all sample sources for that category.')}><Settings20Regular /></ToolButton>
      </div>)}
      <div className="cb-source-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); info('Files are not uploaded', 'Use Add knowledge to select a fictional sample source. Files dropped here are not opened or sent anywhere.') }}>
        <button className="cb-button" onClick={() => openSources()}><Add20Regular />Add knowledge</button><span>or just drop files here</span>
      </div>
      {recipe.knowledge.some(row => row.scope === 'work') && <div className="cb-work-content"><h3>Work content</h3><ToolButton label="More information about Work content" onClick={() => info('Work content', 'Cloud files, email and chat sources in this Cookbook are fictional fixtures. No work account is connected.')}><Info16Regular /></ToolButton></div>}
      {recipe.knowledge.filter(row => row.scope === 'work').map(row => knowledgeRow(row.id))}
      {recipe.knowledge.filter(row => row.scope !== 'work').map(row => knowledgeRow(row.id))}
    </section>,
    prompts: <section className="cb-card" key="prompts">
      {sectionHeader('Suggested prompts')}
      <div className="cb-prompt-headings"><span>Title</span><span>Message</span></div>
      <div className="cb-prompt-rows">{draft.prompts.map((prompt, index) => <div className="cb-prompt-row" key={prompt.id}
        onDragOver={event => event.preventDefault()} onDrop={event => {
          event.preventDefault()
          const from = draft.prompts.findIndex(item => item.id === event.dataTransfer.getData('text/plain'))
          if (from < 0) { info('Suggested prompts', 'Drag a prompt from this list to reorder it.'); return }
          movePrompt(from, index)
        }}>
        <input aria-label={`Starter prompt ${index + 1} title`} placeholder="Enter a title" value={prompt.title} maxLength={100} onChange={event => updatePrompt(prompt.id, 'title', event.target.value)} />
        <textarea aria-label={`Starter prompt ${index + 1} message`} placeholder="Enter a message" rows={2} value={prompt.message} maxLength={4000} onChange={event => updatePrompt(prompt.id, 'message', event.target.value)} />
        <ToolButton label={`Remove suggested prompt ${index + 1}`} onClick={() => change({ ...draft, prompts: draft.prompts.filter(item => item.id !== prompt.id) })}><Delete20Regular /></ToolButton>
        <button type="button" className="cp-icon-button" draggable aria-label={`Reorder suggested prompt ${index + 1}`} title="Drag to reorder, or use Alt+Up / Alt+Down"
          onDragStart={event => { event.dataTransfer.setData('text/plain', prompt.id); event.dataTransfer.effectAllowed = 'move' }}
          onKeyDown={event => { if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); movePrompt(index, index + (event.key === 'ArrowUp' ? -1 : 1)) } }}><ReOrderDotsVertical20Regular /></button>
      </div>)}</div>
      <button className="cb-add-prompt" aria-label="Add conversation starter (maximum 12)" disabled={draft.prompts.length >= builderLimits.prompts} onClick={() => change({
        ...draft, prompts: [...draft.prompts, { id: `prompt-${crypto.randomUUID()}`, title: '', message: '' }],
      })}><Add20Regular />Add a suggested prompt</button>
    </section>,
  }

  return <div className={`cb-builder${mobileDescribe ? ' cb-show-describe' : ''}`}>
    <div className="cb-mobile-tabs"><button aria-pressed={mobileDescribe} onClick={() => setMobileDescribe(true)}>Describe</button><button aria-pressed={!mobileDescribe} onClick={() => setMobileDescribe(false)}>{view}</button></div>
    <section className="cb-describe-panel" aria-label="Describe">
      <header className="cb-describe-toolbar"><ToolButton label="Local data and privacy" onClick={() => info('Local simulation', 'The draft stays in this browser. No real agent is created or published.')}><ShieldTask20Regular /></ToolButton>
        <ToolButton label="Describe settings" onClick={() => info('Describe', 'Type a goal to place it in the agent description, then edit the configuration yourself. This authoring helper does not call an AI model.')}><MoreHorizontal20Regular /></ToolButton></header>
      <div className={`cb-describe-body${describeMessages.length ? ' cb-describe-with-messages' : ''}`}>
        {describeMessages.length ? <div className="cb-describe-messages">{describeMessages.map((message, index) => <p key={index} className={message.role === 'user' ? 'cb-describe-user' : ''}>{message.text}</p>)}</div>
          : <h2>How would you like to update your agent?</h2>}
        <form className="cb-describe-composer" onSubmit={event => { event.preventDefault(); describe() }}>
          <textarea aria-label="What would you like help with" placeholder="What would you like help with" value={goal} rows={1} maxLength={1000} onChange={event => setGoal(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); describe() } }} />
          <div><button type="button" className="cp-icon-button" aria-label="Add and manage sources" onClick={() => openSources()}><Add20Regular /></button><span className="cp-toolbar-spacer" />
            {goal.trim() ? <button className="cp-icon-button" aria-label="Send description"><ArrowRight20Regular /></button>
              : <button type="button" className="cp-icon-button" aria-label="Start dictation" onClick={() => info('Dictation', 'Dictation is not connected in this local prototype.')}><Mic20Filled /></button>}</div>
        </form>
      </div>
      <footer className="cb-describe-footer">Cookbook simulation. Changes stay in this browser.<br />No live AI, external connections or agent training.</footer>
    </section>
    <section className="cb-config-panel" aria-label={view}>
      <header className="cb-config-toolbar">
        <button ref={viewRef} className="cb-view-button" aria-haspopup="menu" aria-expanded={menu === 'view'} onClick={() => setMenu(menu === 'view' ? null : 'view')}>{view}<ChevronDown20Regular /></button>
        <PopupMenu id="cb-view-menu" label="Builder view" open={menu === 'view'} anchorRef={viewRef} onClose={() => setMenu(null)} className="cb-menu">
          {(['Configure', 'Preview'] as const).map(item => <button key={item} role="menuitem" onClick={() => { setView(item); setMenu(null); setMobileDescribe(false) }}>{item}</button>)}
        </PopupMenu>
        <div className="cb-create-actions"><span role="status" className="cb-draft-status" title={warning ? 'Draft not saved' : draft.status === 'created' ? 'Created locally' : 'Draft auto-saved locally'} aria-label={warning ? 'Draft not saved' : draft.status === 'created' ? 'Created locally' : 'Draft auto-saved locally'}>
          {warning ? <Info16Regular /> : <CheckmarkCircle20Regular />}</span>
          <button className="cb-button" onClick={() => setDialog({ kind: 'create' })}>{draft.status === 'created' ? 'Update' : 'Create'}</button>
          <button ref={moreRef} className="cp-icon-button" aria-label="More" aria-haspopup="menu" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}><MoreHorizontal20Regular /></button>
          <PopupMenu id="cb-more-menu" label="Agent options" open={menu === 'more'} anchorRef={moreRef} onClose={() => setMenu(null)} className="cb-menu">
            <button role="menuitem" onClick={() => { setMenu(null); setDialog({ kind: 'reset' }) }}>Reset to template</button>
            <button role="menuitem" onClick={() => { setMenu(null); info('Recipe framework', 'Each JSON file in copilot/recipes defines a recipe. The shared schema validates it, the same builder renders it, and local preview rules determine the simulated behavior.') }}>About this recipe</button>
          </PopupMenu>
          <ToolButton label="Dismiss" onClick={onDismiss}><Dismiss20Regular /></ToolButton>
        </div>
      </header>
      {(error || warning) && <div className="cb-error" role="alert">{error || warning}</div>}
      {created && <div className="cb-created" role="status">Agent created locally. Nothing was published or sent to Microsoft.</div>}
      {view === 'Configure' ? <div className="cb-config-scroll">
        <div className="cb-profile">
          <button className="cb-edit-icon" aria-label="Edit Agent Icon" onClick={() => setDialog({ kind: 'icon' })}><BuilderIcon icon={draft.icon} name={draft.profile.name || recipe.title} /></button>
          <div className="cb-profile-fields"><div className="cb-profile-name">
            <input ref={nameRef} aria-label="Enter agent name" placeholder="Enter agent name" value={draft.profile.name} maxLength={builderLimits.name} onChange={event => profile('name', event.target.value)} />
            <ToolButton label="Edit agent name" onClick={() => { nameRef.current?.focus(); nameRef.current?.select() }}><Edit20Regular /></ToolButton>
          </div><textarea aria-label="Describe your agent" placeholder="Describe your agent" rows={1} value={draft.profile.description} maxLength={builderLimits.description} onChange={event => profile('description', event.target.value)} /></div>
          <button ref={modeRef} className="cb-mode-button" aria-label={`Response mode: ${draft.mode}`} aria-haspopup="menu" aria-expanded={menu === 'mode'} onClick={() => setMenu(menu === 'mode' ? null : 'mode')}>{draft.mode}<ChevronDown20Regular /></button>
          <PopupMenu id="cb-mode-menu" label="Response mode" open={menu === 'mode'} anchorRef={modeRef} onClose={() => setMenu(null)} className="cb-menu">
            {builderModes.map(mode => <button key={mode} role="menuitemradio" aria-checked={draft.mode === mode} onClick={() => { change({ ...draft, mode }); setMenu(null) }}>{mode}</button>)}
          </PopupMenu>
        </div>
        {recipe.sections.map(section => sections[section])}
        <p className="cb-template-note">Some features aren't available in Agent Builder for templates that support tuning. You can add them after creating your agent.</p>
        <p className="cb-template-note">Cookbook: this is a local simulation; no real agent is created, tuned or published.</p>
      </div> : <BuilderPreview key={previewKey} recipe={recipe} draft={draft} />}
    </section>
    {dialog && <Modal title={dialog.kind === 'info' ? dialog.title : dialog.kind === 'instructions' ? 'Instructions' : dialog.kind === 'knowledge' ? 'Add knowledge'
      : dialog.kind === 'skills' ? 'Agents & Skills' : dialog.kind === 'icon' ? 'Edit Agent Icon' : dialog.kind === 'create' ? 'Create this agent locally?'
        : dialog.kind === 'reset' ? 'Reset to template?' : 'Suggest improvements'}
      onClose={() => setDialog(null)} wide={dialog.kind === 'instructions'} className="cp-dialog cb-dialog">
      {dialog.kind === 'info' && <p className="cb-info-text">{dialog.text}</p>}
      {dialog.kind === 'instructions' && instructionEditor}
      {dialog.kind === 'icon' && <div className="cb-icon-picker">{(['rle', 'expert', 'document'] as const).map(icon => <button key={icon} aria-label={`${icon} icon`} aria-pressed={draft.icon === icon} onClick={() => { change({ ...draft, icon }); setDialog(null) }}><BuilderIcon icon={icon} name={icon} /></button>)}</div>}
      {dialog.kind === 'skills' && <>
        <p className="cp-dialog-description">Select fictional capabilities for this recipe. No external agents or tools are called.</p>
        {recipe.skills.map(skill => <label className="cb-choice" key={skill.id}><input type="checkbox" checked={selection.includes(skill.id)} onChange={() => toggleSelection(skill.id)} /><span><strong>{skill.title}</strong><small>{skill.description}</small></span></label>)}
        {!recipe.skills.length && <p>No sample skills are included with this recipe.</p>}
        <div className="cp-dialog-actions"><button onClick={() => { change({ ...draft, skillIds: selection }); setDialog(null) }}>Add</button></div>
      </>}
      {dialog.kind === 'knowledge' && <>
        <p className="cp-dialog-description">Choose fictional sample sources. An empty selection means Search all sample sources in that enabled category. No account is connected.</p>
        {recipe.sources.filter(source => !dialog.sourceKind || source.kind === dialog.sourceKind).map(source => <label className="cb-choice" key={source.id}>
          <input type="checkbox" checked={selection.includes(source.id)} onChange={() => toggleSelection(source.id)} /><span><strong>{source.title}</strong><small>{source.content}</small></span>
        </label>)}
        {!recipe.sources.some(source => !dialog.sourceKind || source.kind === dialog.sourceKind) && <p>This recipe has no sample sources in this category.</p>}
        <div className="cp-dialog-actions"><button onClick={() => applySources(dialog.sourceKind)}>Apply</button></div>
      </>}
      {dialog.kind === 'create' && <>
        <p>This saves <strong>{draft.profile.name || 'your agent'}</strong> as a local Cookbook agent in this browser. It does not create, share, publish or train a Microsoft agent.</p>
        {!!validateForCreate(draft).length && <ul className="cb-error">{validateForCreate(draft).map(error => <li key={error}>{error}</li>)}</ul>}
        <div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Cancel</button><button disabled={validateForCreate(draft).length > 0} onClick={() => {
          if (onCreate()) { setCreated(true); setDialog(null) }
        }}>Create locally</button></div>
      </>}
      {dialog.kind === 'reset' && <><p>Replace this recipe's local edits with its initial configuration? Other recipes and chat history are not affected.</p>
        <div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Cancel</button><button onClick={() => { onReset(); setCreated(false); setDialog(null) }}>Reset template</button></div></>}
      {dialog.kind === 'improve' && <>
        <p className="cp-dialog-description">A suggested local example, not AI-generated text. Your instructions will change only if you apply it.</p>
        <blockquote>Before answering, distinguish confirmed evidence from assumptions. State the criteria used to assess the result and explain any missing information.</blockquote>
        <div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Cancel</button><button onClick={() => {
          const next = `${draft.profile.instructions}\n\nResponse quality:\n- Distinguish confirmed evidence from assumptions.\n- State the criteria used to assess the result and explain any missing information.`
          if (change({ ...draft, profile: { ...draft.profile, instructions: next } })) setDialog(null)
        }}>Apply suggestion</button></div>
      </>}
    </Modal>}
  </div>
}
