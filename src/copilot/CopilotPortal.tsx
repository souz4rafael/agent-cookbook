import { useEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode, RefObject } from 'react'
import {
  Add20Regular, ArrowClockwise20Regular, ChevronDown16Regular, ChevronUp16Regular, Folder20Regular, History20Regular, Home20Regular, Pin20Regular,
  ArrowUp20Regular, BookOpen20Regular, Chat20Regular, ChatMultiple20Regular, ChatSparkle20Regular,
  ChatHintHalf20Regular, Checkmark20Regular, ChevronDown20Regular, CircleMultipleConcentricDashes20Regular,
  Copy20Regular, Delete20Regular, DeviceEq20Regular, Dismiss20Regular, Edit20Regular, Globe20Regular,
  GridDots20Regular, Lightbulb20Regular, Mic20Filled, MoreHorizontal20Regular,
  People20Regular, Search20Regular, ShieldTask20Regular, Stop20Filled,
  ThumbDislike20Regular, ThumbLike20Regular,
} from '@fluentui/react-icons'
import { Modal } from '../components/Modal.tsx'
import { PopupMenu } from '../components/PopupMenu.tsx'
import { CookbookMark } from '../components/CookbookMark.tsx'
import { CollectionLink } from '../collection/CollectionLink.tsx'
import { CopilotIcon, CopilotSidebarIcon } from './CopilotIcon.tsx'
import { chatAgents, getChatAgent } from './agents.ts'
import { replyToText } from './framework.ts'
import type { AgentDefinition, ChatMessage, ResponseStyle } from './framework.ts'
import { useChat } from './useChat.ts'
import { AgentBuilder } from './builder/AgentBuilder.tsx'
import { NewAgent } from './builder/NewAgent.tsx'
import { builderRecipes } from './builder/catalog.ts'
import type { BuilderRecipe } from './builder/schema.ts'
import { readBuilderRoute } from './builder/state.ts'
import { useBuilderDrafts } from './builder/useBuilderDrafts.ts'
import './builder/builder.css'

type DialogState = { kind: 'agents' | 'search' | 'prompts' | 'settings' | 'about' | 'reset' }
  | { kind: 'feature'; name: string }
  | { kind: 'source'; agentId: string; title: string }
  | { kind: 'delete'; id: string }
  | { kind: 'builder-info'; title: string; text: string }
  | { kind: 'builder-reset' }

function IconButton({ label, children, ...props }: ComponentProps<'button'> & { label: string; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} {...props} className={`cp-icon-button ${props.className ?? ''}`}>{children}</button>
}

function AgentIcon({ agent, plain = false }: { agent: AgentDefinition; plain?: boolean }) {
  const icons = {
    copilot: <ChatSparkle20Regular />,
    citizen: <Globe20Regular />,
    meeting: <People20Regular />,
    writing: <Edit20Regular />,
    research: <Lightbulb20Regular />,
  }
  return <span aria-hidden="true" className={`cp-agent-icon cp-agent-${agent.icon}${plain ? ' cp-agent-plain' : ''}`}>{icons[agent.icon]}</span>
}

function ChatComposer({ draft, setDraft, inputRef, pending, send, stop, agent, openFeature, openAgents }: {
  draft: string
  setDraft: (value: string) => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  pending: boolean
  send: () => void
  stop: () => void
  agent: AgentDefinition
  openFeature: (name: string) => void
  openAgents: () => void
}) {
  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.style.height = '28px'
      input.style.height = `${Math.min(input.scrollHeight, 168)}px`
    }
  }, [draft, inputRef])

  return <form className="cp-composer" onSubmit={event => { event.preventDefault(); send() }}>
    <textarea ref={inputRef} value={draft} onChange={event => setDraft(event.target.value)} rows={1}
      maxLength={4000} placeholder={`Message ${agent.name}`} aria-label={`Message ${agent.name}`}
      onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault()
          if (!pending) send()
        }
      }} />
    <div className="cp-composer-toolbar">
      <IconButton label="Add attachments" onClick={() => openFeature('Attachments')}><Add20Regular /></IconButton>
      <button className="cp-router" type="button" onClick={openAgents} aria-label={`Choose a chat recipe. Current: ${agent.name}`}>
        {agent.id === 'copilot' ? 'Smart Router' : agent.name}<ChevronDown20Regular />
      </button>
      <span className="cp-toolbar-spacer" />
      <IconButton label="Start dictation" onClick={() => openFeature('Dictation')}><Mic20Filled /></IconButton>
      {pending
        ? <IconButton label="Stop response" className="cp-send" onClick={stop}><Stop20Filled /></IconButton>
        : draft.trim()
          ? <IconButton label="Send message" type="submit" className="cp-send"><ArrowUp20Regular /></IconButton>
          : <IconButton label="Start a voice chat" onClick={() => openFeature('Voice chat')}><DeviceEq20Regular /></IconButton>}
    </div>
  </form>
}

function AssistantMessage({ message, agent, last, pending, react, retry, showSource, report }: {
  message: ChatMessage
  agent: AgentDefinition
  last: boolean
  pending: boolean
  react: (id: string, reaction: 'like' | 'dislike') => void
  retry: () => void
  showSource: (title: string) => void
  report: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    if (!navigator.clipboard) {
      report('Copy is unavailable in this browser. You can select and copy the response text.')
      return
    }
    try {
      await navigator.clipboard.writeText(message.reply ? replyToText(message.reply) : message.text)
      setCopied(true)
    } catch (error) {
      report(`The response could not be copied. ${error instanceof Error ? error.message : 'Clipboard access was denied.'}`)
    }
  }

  return <article className="cp-assistant-message" aria-label={`${agent.name} response`}>
    <div className="cp-answer-byline"><AgentIcon agent={agent} plain /><strong>{agent.name}</strong><span>Simulated</span></div>
    <p>{message.text}</p>
    {message.reply?.sections.map((section, index) => <section key={index}>
      <h2>{section.title}</h2>
      <ul>{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
    </section>)}
    {!!message.reply?.sources.length && <div className="cp-sources">
      {message.reply.sources.map((title, index) => <button key={title} type="button" onClick={() => showSource(title)}>
        <span>{index + 1}</span><BookOpen20Regular />{title}
      </button>)}
    </div>}
    <div className="cp-answer-actions">
      <IconButton label={copied ? 'Copied' : 'Copy response'} onClick={() => void copy()}>{copied ? <Checkmark20Regular /> : <Copy20Regular />}</IconButton>
      <IconButton label="Good response" aria-pressed={message.reaction === 'like'} onClick={() => react(message.id, 'like')}><ThumbLike20Regular /></IconButton>
      <IconButton label="Poor response" aria-pressed={message.reaction === 'dislike'} onClick={() => react(message.id, 'dislike')}><ThumbDislike20Regular /></IconButton>
      {last && <IconButton label="Try again" disabled={pending} onClick={retry}><ArrowClockwise20Regular /></IconButton>}
      <span className="cp-action-note">{message.reaction ? 'Feedback saved locally' : copied ? 'Copied to clipboard' : ''}</span>
    </div>
  </article>
}

export function CopilotPortal() {
  const chat = useChat()
  const builder = useBuilderDrafts()
  const [route, setRoute] = useState(() => readBuilderRoute(window.location.hash))
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState(() => readBuilderRoute(window.location.hash).kind === 'builder')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [groups, setGroups] = useState({ Pinned: true, Projects: true, Recent: true })
  const [agentsMenuOpen, setAgentsMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [search, setSearch] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [theme, setTheme] = useState(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modelRef = useRef<HTMLButtonElement>(null)
  const agentsRef = useRef<HTMLButtonElement>(null)
  const mobileRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLButtonElement>(null)
  const mobileWasOpen = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)
  const activeRecipe = route.kind === 'builder' ? builderRecipes.find(recipe => recipe.id === route.recipeId) : undefined
  const activeDraft = activeRecipe ? builder.drafts[activeRecipe.id] : undefined
  const messages = chat.conversation?.messages ?? []
  const savedChats = chat.conversations.filter(item => !item.temporary)
  const filteredChats = savedChats.filter(item => (
    `${item.title} ${getChatAgent(item.agentId).name} ${item.messages.map(message => message.text).join(' ')}`
  ).toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [messages.length, chat.pending])

  useEffect(() => {
    function onRoute() {
      const next = readBuilderRoute(window.location.hash)
      setRoute(next)
      if (next.kind === 'builder') setCollapsed(true)
      else if (next.kind === 'new-agent') setCollapsed(false)
      setMobileOpen(false)
      setAgentsMenuOpen(false)
    }
    window.addEventListener('hashchange', onRoute)
    return () => window.removeEventListener('hashchange', onRoute)
  }, [])

  useEffect(() => {
    if (activeRecipe && !activeDraft) builder.open(activeRecipe)
  }, [activeRecipe, activeDraft, builder])

  useEffect(() => {
    document.title = `${activeRecipe?.title ?? (route.kind === 'new-agent' ? 'New agent' : 'Chat')} · Copilot Agents Cookbook`
  }, [activeRecipe, route.kind])

  useEffect(() => {
    if (!mobileOpen) {
      if (mobileWasOpen.current) mobileRef.current?.focus()
      mobileWasOpen.current = false
      return
    }
    mobileWasOpen.current = true
    sidebarRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  function start(agentId = 'copilot', temporary = false) {
    window.location.hash = '/chat'
    chat.newChat(agentId, temporary)
    setDraft('')
    setMobileOpen(false)
    setDialog(null)
  }

  function openTemplate(recipe: BuilderRecipe, goal?: string) {
    if (!builder.open(recipe, goal)) return
    window.location.hash = `/agents/new/${encodeURIComponent(recipe.id)}`
    setDialog(null)
    setMobileOpen(false)
  }

  function newAgent() {
    setAgentsMenuOpen(false)
    setMobileOpen(false)
    setDialog(null)
    window.location.hash = '/agents/new'
  }

  function choosePrompt(prompt: string) {
    setDraft(prompt)
    setDialog(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function send() {
    if (chat.send(draft)) setDraft('')
  }

  function openSearch() {
    setSearch('')
    setDialog({ kind: 'search' })
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }

  const composer = <ChatComposer draft={draft} setDraft={setDraft} inputRef={inputRef} pending={chat.pending}
    send={send} stop={chat.stop} agent={chat.agent} openFeature={name => setDialog({ kind: 'feature', name })}
    openAgents={() => setDialog({ kind: 'agents' })} />

  const dialogTitle = !dialog ? '' : dialog.kind === 'agents' ? 'Find your next agent'
    : dialog.kind === 'search' ? 'Search your chats' : dialog.kind === 'prompts' ? 'Prompt Lab'
      : dialog.kind === 'settings' ? 'Settings' : dialog.kind === 'reset' ? 'Delete all saved chats?'
        : dialog.kind === 'delete' ? 'Delete this chat?' : dialog.kind === 'source' ? dialog.title
          : dialog.kind === 'feature' ? dialog.name : dialog.kind === 'builder-info' ? dialog.title
            : dialog.kind === 'builder-reset' ? 'Reset local builder drafts?' : 'Copilot Agents Cookbook'

  return <div className={`cp-app${collapsed ? ' cp-sidebar-collapsed' : ''}${mobileOpen ? ' cp-mobile-open' : ''}${route.kind === 'builder' ? ' cp-builder-open' : ''}`}>
    <a className="cp-skip" href="#chat-main" onClick={event => { event.preventDefault(); document.getElementById('chat-main')?.focus() }}>Skip to chat</a>
    {mobileOpen && <button className="cp-sidebar-scrim" aria-label="Close sidebar" onClick={() => setMobileOpen(false)} />}
    <aside className="cp-sidebar" aria-label="Main navigation">
      <div className="cp-sidebar-heading">
        <button className="cp-brand" onClick={() => start()} aria-label="Copilot Agents Cookbook home">
          <CookbookMark className="cp-brand-mark" />
          <span className="cp-brand-copy"><small>Copilot</small><span className="cp-brand-title">Agents <strong>Cookbook</strong></span></span>
        </button>
        <div className="cp-sidebar-tools">
          <IconButton label="Browse agents" onClick={() => setDialog({ kind: 'agents' })}><GridDots20Regular /></IconButton>
          <IconButton label="Tasks" onClick={() => setDialog({ kind: 'feature', name: 'Tasks' })}><CopilotIcon name="tasks" /></IconButton>
          <IconButton ref={sidebarRef} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => {
            if (window.matchMedia('(max-width: 760px)').matches) {
              setMobileOpen(false)
            } else setCollapsed(!collapsed)
          }}><CopilotSidebarIcon /></IconButton>
        </div>
      </div>
      <div className="cp-home-tabs" aria-label="Experience">
        <button className="cp-home-selected" onClick={() => start()}>Home</button>
        <button disabled title="Code is not part of this chat prototype">Code</button>
      </div>
      {route.kind === 'builder' && collapsed && <><button className="cp-rail-home cp-icon-button" aria-label="Home" onClick={() => start()}><Home20Regular /></button><div className="cp-rail-separator" /></>}
      <button className="cp-nav-item cp-new" title="New chat" onClick={() => start(chat.agent.id)}>
        <CopilotIcon name={route.kind === 'chat' ? 'new' : 'newIdle'} /><span>New</span>
      </button>
      <div className="cp-sidebar-scroll">
        <nav aria-label="Explore">
          <button className="cp-nav-item" title="Search chats" onClick={openSearch}><CopilotIcon name="search" /><span>Search</span></button>
          <button className="cp-nav-item" title="Autopilot" onClick={() => setDialog({ kind: 'feature', name: 'Autopilot' })}><CopilotIcon name="autopilot" /><span>Autopilot</span></button>
          <button className="cp-nav-item" title="Library" onClick={openSearch}><CopilotIcon name="library" /><span>Library</span></button>
          <button className="cp-nav-item" title="Automations" onClick={() => setDialog({ kind: 'feature', name: 'Automations' })}><CopilotIcon name="automations" /><span>Automations</span></button>
          <button className="cp-nav-item" title="Plugins" onClick={() => setDialog({ kind: 'feature', name: 'Plugins' })}><CopilotIcon name="plugins" /><span>Plugins</span></button>
          <button ref={agentsRef} className="cp-nav-item" title="Agents" aria-haspopup="menu" aria-expanded={agentsMenuOpen} onClick={() => setAgentsMenuOpen(!agentsMenuOpen)}><CopilotIcon name="agents" /><span>Agents</span></button>
          <PopupMenu id="cp-agents-menu" label="Agents menu" open={agentsMenuOpen} anchorRef={agentsRef} onClose={() => setAgentsMenuOpen(false)} align="start" className="cb-menu cp-agents-menu">
            {builderRecipes.filter(recipe => builder.drafts[recipe.id]?.status === 'created').map(recipe => <button key={recipe.id} role="menuitem" onClick={() => { setAgentsMenuOpen(false); openTemplate(recipe) }}>{builder.drafts[recipe.id].profile.name}</button>)}
            <button role="menuitem" onClick={newAgent}><Add20Regular />New agent</button>
            <button role="menuitem" onClick={() => { setAgentsMenuOpen(false); setDialog({ kind: 'builder-info', title: 'More agents & plugins', text: 'The external agent store is not connected in this local Cookbook. Choose New agent to explore a recipe.' }) }}><CopilotIcon name="agents" />More agents & plugins</button>
          </PopupMenu>
          <button className="cp-nav-item" title="Workspaces" onClick={() => setDialog({ kind: 'feature', name: 'Workspaces' })}><CopilotIcon name="workspaces" /><span>Workspaces</span></button>
        </nav>
        <div className="cp-sidebar-groups">{(['Pinned', 'Projects', 'Recent'] as const).map(label => <section className="cp-sidebar-group" key={label}>
          <button className="cp-section-label" aria-label={label} aria-controls={`cp-group-${label.toLowerCase()}`} aria-expanded={groups[label]}
            onClick={() => setGroups(current => ({ ...current, [label]: !current[label] }))}>
            <span className="cp-rail-group-icon" aria-hidden="true">{label === 'Pinned' ? <Pin20Regular /> : label === 'Projects' ? <Folder20Regular /> : <History20Regular />}</span>
            <span className="cp-section-text">{label}</span>
            {groups[label] ? <ChevronDown16Regular className="cp-section-chevron" /> : <ChevronUp16Regular className="cp-section-chevron" />}
          </button>
          <div id={`cp-group-${label.toLowerCase()}`} hidden={!groups[label]} />
        </section>)}</div>
      </div>
      <CollectionLink className="cp-nav-item"><BookOpen20Regular aria-hidden="true" /><span>All cookbooks</span></CollectionLink>
      <div className="cp-profile">
        <button className="cp-profile-button" onClick={() => setDialog({ kind: 'about' })} aria-label="About this local playground">
          <span className="cp-avatar"><BookOpen20Regular /></span>
          <span className="cp-profile-copy"><strong>Cookbook <span>Preview</span></strong><small>Local learning playground</small></span>
        </button>
        <IconButton label="Settings" onClick={() => setDialog({ kind: 'settings' })}><CopilotIcon name="settings" /></IconButton>
      </div>
    </aside>

    <main id="chat-main" className="cp-main" inert={mobileOpen} tabIndex={-1}>
      {route.kind !== 'chat' && <div className="cp-builder-mobile-bar"><IconButton ref={mobileRef} label="Open sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><CopilotSidebarIcon /></IconButton><span>Agents Cookbook</span></div>}
      {route.kind !== 'chat' && builder.warning && <div className="cp-warning" role="alert">{builder.warning}<button className="cb-button" onClick={() => setDialog({ kind: 'builder-reset' })}>Reset builder drafts</button></div>}
      {route.kind === 'new-agent' && builder.error && <div className="cp-warning" role="alert">{builder.error}</div>}
      {route.kind === 'new-agent' ? <NewAgent drafts={builder.drafts} onSelect={openTemplate} onInfo={(title, text) => setDialog({ kind: 'builder-info', title, text })} />
        : route.kind === 'builder' && activeRecipe ? activeDraft
          ? <AgentBuilder key={activeRecipe.id} recipe={activeRecipe} draft={activeDraft} warning={builder.warning} error={builder.error}
            onChange={next => builder.update(activeRecipe, next)} onCreate={() => builder.create(activeRecipe)}
            onReset={() => builder.reset(activeRecipe)} onDismiss={newAgent} />
          : <p role="status">Opening the local recipe...</p>
        : route.kind !== 'chat' ? <div className="cb-not-found"><h1>This recipe is not available.</h1><p>The link may have changed. Your other local drafts have not been changed.</p><button className="cb-button" onClick={newAgent}>Back to New agent</button></div>
        : <>
      <header className="cp-topbar">
        <IconButton ref={mobileRef} className="cp-mobile-toggle" label="Open sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><CopilotSidebarIcon /></IconButton>
        <button className={`cp-work-iq${chat.useSources ? '' : ' cp-work-iq-off'}`} role="switch" aria-checked={chat.useSources}
          aria-label="Work IQ sample context" title="Use fictional recipe context. No Microsoft 365 connection."
          onClick={() => chat.setUseSources(!chat.useSources)}>Work IQ</button>
        <button ref={modelRef} className="cp-model-button" aria-label={`${chat.style}, response style`}
          aria-haspopup="menu" aria-expanded={modelOpen} onClick={() => setModelOpen(!modelOpen)}>
          {chat.style}<ChevronDown20Regular />
        </button>
        <PopupMenu id="cp-response-style" label="Simulated response style" open={modelOpen} anchorRef={modelRef}
          onClose={() => setModelOpen(false)} align="start" className="cp-model-menu">
          <p>Response style <span>Simulated</span></p>
          {(['Auto', 'Quick response', 'Think deeper'] satisfies ResponseStyle[]).map(style => (
            <button key={style} role="menuitemradio" aria-checked={chat.style === style} onClick={() => { chat.setStyle(style); setModelOpen(false) }}>
              <span>{style}<small>{style === 'Auto' ? 'A balanced sample answer' : style === 'Quick response' ? 'A shorter version of the example' : 'Include review steps and assumptions'}</small></span>
              {chat.style === style && <Checkmark20Regular />}
            </button>
          ))}
          <small>No live AI model is connected.</small>
        </PopupMenu>
        <span className="cp-toolbar-spacer" />
        {chat.temporary && <span className="cp-temporary-label">Temporary chat</span>}
        <IconButton label="About this simulation" onClick={() => setDialog({ kind: 'about' })}><CircleMultipleConcentricDashes20Regular /></IconButton>
        <IconButton label="Local data and privacy" className="cp-privacy-icon" onClick={() => setDialog({ kind: 'about' })}><ShieldTask20Regular /></IconButton>
        <IconButton label={chat.temporary ? 'Leave temporary chat' : 'Start a temporary chat'} aria-pressed={chat.temporary}
          className="cp-temporary-button" onClick={() => start(chat.agent.id, !chat.temporary)}><ChatHintHalf20Regular /></IconButton>
        <IconButton label="Settings and more" onClick={() => setDialog({ kind: 'settings' })}><MoreHorizontal20Regular /></IconButton>
      </header>

      {chat.storageWarning && <div className="cp-warning" role="alert">{chat.storageWarning}</div>}
      <div className="cp-announcement" role="status">{chat.notice}
        {chat.notice && <IconButton label="Dismiss notification" onClick={() => chat.setNotice(null)}><Dismiss20Regular /></IconButton>}
      </div>
      {!messages.length ? <>
        <div className="cp-welcome">
          {chat.agent.id !== 'copilot' && <div className="cp-agent-intro"><AgentIcon agent={chat.agent} /><span>{chat.agent.name}</span></div>}
          <h1>{chat.agent.greeting}</h1>
          {composer}
          <div className="cp-starters">
            {chat.agent.starters.map(starter => <button key={starter.label} type="button" onClick={() => choosePrompt(starter.prompt)}>{starter.label}</button>)}
            <button className="cp-prompt-lab" type="button" onClick={() => setDialog({ kind: 'prompts' })}>Prompt Lab</button>
          </div>
        </div>
        <footer className="cp-welcome-footer"><BookOpen20Regular /><span>Copilot Agents Cookbook <span className="cp-footer-dot">·</span> <span>Learn by trying.</span></span>
          <small>Independent educational simulation, not affiliated with Microsoft. No live AI or Microsoft 365 connection. Use fictional data only.</small>
        </footer>
      </> : <>
        <div className="cp-conversation-scroll" role="region" aria-label="Conversation">
          <div className="cp-transcript">
            {messages.map((message, index) => message.role === 'user'
              ? <article key={message.id} className="cp-user-message" aria-label="Your message"><p>{message.text}</p></article>
              : <AssistantMessage key={message.id} message={message} agent={chat.agent} last={index === messages.length - 1}
                pending={chat.pending} react={chat.react} retry={chat.retry} report={chat.setNotice}
                showSource={title => setDialog({ kind: 'source', agentId: chat.agent.id, title })} />)}
            {chat.pending && <div className="cp-thinking" role="status"><AgentIcon agent={chat.agent} plain /><span>Preparing a sample response<span className="cp-thinking-dots">...</span></span></div>}
            {!chat.pending && messages.at(-1)?.role === 'user' && <button className="cp-retry" onClick={chat.retry}><ArrowClockwise20Regular />Retry response</button>}
            <div className="cp-live-status" role="status" aria-atomic="true">{!chat.pending && messages.at(-1)?.role === 'assistant' ? 'Response ready.' : ''}</div>
            <div ref={endRef} />
          </div>
        </div>
        <div className="cp-bottom-composer">{composer}
          <p>{chat.temporary ? 'Temporary chat. Not saved to history.' : 'Simulated responses. Use fictional information only.'} <button onClick={() => setDialog({ kind: 'about' })}>About this experience</button></p>
        </div>
      </>}
      </>}
    </main>

    {dialog && <Modal title={dialogTitle} onClose={() => setDialog(null)} wide={dialog.kind === 'agents'} className="cp-dialog">
      {dialog.kind === 'agents' && <>
        <p className="cp-dialog-description">One familiar chat. Different recipes. Choose an agent to explore its fictional examples.</p>
        <div className="cp-agent-grid">{chatAgents.map(agent => <button key={agent.id} className="cp-agent-card" onClick={() => start(agent.id)}>
          <AgentIcon agent={agent} /><h3>{agent.name}</h3><p>{agent.description}</p><span>Try this agent <span aria-hidden="true">→</span></span>
        </button>)}</div>
      </>}
      {dialog.kind === 'search' && <>
        <label className="cp-search-input"><Search20Regular /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Search titles, messages or agents" aria-label="Search chats" /></label>
        <p className="cp-dialog-description">Only chats saved in this browser appear here.</p>
        <div className="cp-search-results">{filteredChats.map(item => <div key={item.id}>
          <button onClick={() => { chat.openChat(item.id); setDraft(''); setDialog(null); setMobileOpen(false) }}>
            <Chat20Regular /><span><strong>{item.title}</strong><small>{getChatAgent(item.agentId).name} · {new Date(item.updatedAt).toLocaleDateString('en-GB')}</small></span>
          </button>
          <IconButton label={`Delete ${item.title}`} onClick={() => setDialog({ kind: 'delete', id: item.id })}><Delete20Regular /></IconButton>
        </div>)}</div>
        {!filteredChats.length && <div className="cp-empty-state"><ChatMultiple20Regular /><h3>{search ? 'No matching chats' : 'A fresh start'}</h3><p>{search ? 'Try another word or an agent name.' : 'Start a conversation and it will appear here. Temporary chats are never saved.'}</p></div>}
      </>}
      {dialog.kind === 'prompts' && <>
        <p className="cp-dialog-description">Start with an example, then make it your own. Select a prompt to place it in the composer.</p>
        <div className="cp-prompt-list">{chat.agent.starters.map(starter => <button key={starter.label} onClick={() => choosePrompt(starter.prompt)}><strong>{starter.label}</strong><span>{starter.prompt}</span></button>)}</div>
      </>}
      {dialog.kind === 'settings' && <>
        <div className="cp-setting-row"><div><strong>Dark appearance</strong><p>Change the look of this playground.</p></div><button className="cp-switch" role="switch" aria-label="Dark appearance" aria-checked={theme === 'dark'} onClick={toggleTheme}><span /></button></div>
        <div className="cp-setting-row"><div><strong>Local chat history</strong><p>{savedChats.length} of 40 saved chats in this browser.</p></div><button className="cp-text-button" onClick={() => setDialog({ kind: 'reset' })}>Reset history</button></div>
        <div className="cp-setting-row"><div><strong>About the Cookbook</strong><p>A reusable chat playground, not a connected Copilot account.</p></div><button className="cp-text-button" onClick={() => setDialog({ kind: 'about' })}>Learn more</button></div>
      </>}
      {(dialog.kind === 'reset' || dialog.kind === 'delete') && <>
        <p>{dialog.kind === 'reset' ? 'This removes all saved conversations for Copilot Agents Cookbook from this browser. The separate Copilot Studio Cookbook is not affected.' : 'This removes the selected conversation from this browser. This cannot be undone.'}</p>
        <div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Cancel</button><button className="cp-danger-button" onClick={() => {
          if (dialog.kind === 'reset') chat.resetHistory()
          else if (dialog.kind === 'delete') chat.deleteChat(dialog.id)
          setDialog(null)
        }}>Delete {dialog.kind === 'reset' ? 'all chats' : 'chat'}</button></div>
      </>}
      {dialog.kind === 'source' && <>
        <div className="cp-sample-badge"><BookOpen20Regular />Fictional sample source</div>
        <p className="cp-source-content">{getChatAgent(dialog.agentId).sources.find(source => source.title === dialog.title)?.content ?? 'This sample source is no longer available in the recipe.'}</p>
        <p className="cp-dialog-description">Included with this recipe. Nothing was retrieved from your files or Microsoft 365.</p>
      </>}
      {dialog.kind === 'feature' && <>
        <div className="cp-feature-symbol"><ChatSparkle20Regular /></div><h3>The familiar controls. A focused first step.</h3>
        <p>{dialog.name} is shown to match the chat experience, but is not connected in this prototype.</p>
        <p className="cp-dialog-description">You can already chat with sample agents, switch response styles, explore sources and revisit local conversations. No files are uploaded, no microphone is activated and no external action is performed.</p>
        <div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Back to chat</button></div>
      </>}
      {dialog.kind === 'about' && <>
        <div className="cp-about-brand"><BookOpen20Regular /><span>Familiar chat. Practical recipes.</span></div>
        <p>An independent educational playground inspired by the Copilot chat interface. It is not the Microsoft Copilot service and does not imply Microsoft approval.</p>
        <h3>What is real here?</h3><p>The interface, agent switching, chat history and controls. Responses are scripted examples backed by fictional recipe content, not a live AI model.</p>
        <h3>Your data stays here</h3><p>Chats are stored in this browser, not sent to a server. Temporary chats are excluded from saved history and discarded when you leave them. Use fictional information only.</p>
        <p className="cp-dialog-description">The Work IQ switch toggles sample recipe context. The response selector changes the shape of the example, not the underlying AI model. Product-specific icons and the reference serif font load from Microsoft's public asset CDN without sending chat content or a page referrer. Bundled Fluent icons and local fonts remain available offline.</p>
      </>}
      {dialog.kind === 'builder-info' && <p className="cb-info-text">{dialog.text}</p>}
      {dialog.kind === 'builder-reset' && <><p>Remove the saved Agent Builder drafts from this browser? Chat history and the Copilot Studio Cookbook are not affected.</p><div className="cp-dialog-actions"><button onClick={() => setDialog(null)}>Cancel</button><button onClick={() => { builder.reset(); setDialog(null) }}>Reset builder drafts</button></div></>}
    </Modal>}
  </div>
}
