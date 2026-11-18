import { useId, useRef, useState } from 'react'
import {
  BookOpen20Regular, BookOpen24Regular, MoreHorizontal24Filled, Megaphone20Regular,
  LightbulbFilament20Regular, Open20Regular, Settings20Regular, Info20Regular,
  PanelLeftContract20Regular, PanelLeftExpand20Regular,
} from '@fluentui/react-icons'
import { BrandName, ThemeToggle } from '../App.tsx'
import { StudioNavigationIcon } from './StudioNavigationIcon.tsx'
import { PopupMenu } from './PopupMenu.tsx'
import { CollectionLink } from '../collection/CollectionLink.tsx'

export function StudioNavigation({ activePage, initiallyExpanded = false, onChat, onEnvironment }: {
  activePage?: 'home' | 'agents' | 'chat'
  initiallyExpanded?: boolean
  onChat?: () => void
  onEnvironment: () => void
}) {
  const [expanded, setExpanded] = useState(() => initiallyExpanded && window.matchMedia('(min-width: 801px)').matches)
  const [showMore, setShowMore] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const navigationId = useId()
  return (
    <>
      {expanded && <button className="navigation-scrim" type="button" aria-label="Collapse navigation" onClick={() => setExpanded(false)} />}
      <aside className={`nav-rail${expanded ? ' expanded' : ''}`} aria-label="Application navigation">
        <div className="rail-heading">
          {expanded ? <span className="rail-brand-toggle"><BookOpen24Regular aria-hidden="true" /></span> : <button type="button" className="rail-brand-toggle" aria-label="Expand navigation"
            aria-expanded={false} aria-controls={navigationId} onClick={() => setExpanded(true)}>
            <BookOpen24Regular className="rail-brand-symbol" aria-hidden="true" />
            <PanelLeftExpand20Regular className="rail-expand-symbol" aria-hidden="true" />
          </button>}
          <a className="rail-heading-name" href="#/" aria-label="Copilot Studio Agents Cookbook home"><BrandName /></a>
          {expanded && <button className="icon-button rail-collapse" type="button" onClick={() => setExpanded(false)} aria-expanded={true} aria-controls={navigationId} aria-label="Collapse navigation"><PanelLeftContract20Regular aria-hidden="true" /></button>}
        </div>
        <nav id={navigationId} aria-label="Main navigation">
          <a className={`rail-item${activePage === 'home' ? ' active' : ''}`} href="#/" aria-label="Home" aria-current={activePage === 'home' ? 'page' : undefined} title="Home"><span className="rail-symbol"><StudioNavigationIcon name="home" /></span><span className="rail-label">Home</span></a>
          <button className={`rail-item${activePage === 'chat' ? ' active' : ''}`} type="button" disabled={!onChat} onClick={onChat} aria-label="Chat history" aria-current={activePage === 'chat' ? 'page' : undefined} title={onChat ? 'Chat' : 'Open an agent to explore its chat history'}><span className="rail-symbol"><StudioNavigationIcon name="chat" /></span><span className="rail-label">Chat</span></button>
          <span className="rail-divider" />
          <a className={`rail-item${activePage === 'agents' ? ' active' : ''}`} href="#/agents" aria-label="Agents" aria-current={activePage === 'agents' ? 'page' : undefined} title="Agents"><span className="rail-symbol"><StudioNavigationIcon name="agents" /></span><span className="rail-label">Agents</span></a>
          <button className="rail-item" type="button" disabled aria-label="Workflows: not simulated" title="Workflows are not simulated"><span className="rail-symbol"><StudioNavigationIcon name="workflows" /></span><span className="rail-label">Workflows</span></button>
          <button className="rail-item" type="button" disabled aria-label="Apps: not simulated" title="Apps are not simulated"><span className="rail-symbol"><StudioNavigationIcon name="apps" /></span><span className="rail-label">Apps <span>(Preview)</span></span></button>
        </nav>
        <div className="rail-bottom">
          <CollectionLink className="rail-item"><span className="rail-symbol"><BookOpen20Regular aria-hidden="true" /></span><span className="rail-label">All cookbooks</span></CollectionLink>
          <button className="rail-item" type="button" onClick={onEnvironment} aria-label="About the learning environment" title="Learning environment"><span className="rail-symbol"><StudioNavigationIcon name="environment" /></span><span className="rail-label">Learning environment</span></button>
          <div className="rail-account">
            <span className="rail-avatar" aria-label="Fictional learner identity">AC</span><span className="rail-account-name">Learner</span>
            <button ref={menuButton} className="icon-button rail-app-menu-button" type="button" onClick={() => setShowMore(!showMore)} aria-haspopup="menu" aria-expanded={showMore} aria-controls={menuId} aria-label="More application options"><MoreHorizontal24Filled aria-hidden="true" /></button>
          </div>
        </div>
        <PopupMenu id={menuId} label="Application options" className="application-options-menu" align="start" open={showMore} anchorRef={menuButton} onClose={() => setShowMore(false)}>
          <div role="group" aria-labelledby={`${menuId}-explore`}>
            <div className="application-menu-heading" id={`${menuId}-explore`}>Explore</div>
            <a role="menuitem" href="https://learn.microsoft.com/en-us/microsoft-copilot-studio/whats-new" target="_blank" rel="noopener noreferrer" onClick={() => setShowMore(false)}><Megaphone20Regular aria-hidden="true" />See what's new<span className="sr-only"> (opens in a new tab)</span></a>
            <button role="menuitem" type="button" disabled><LightbulbFilament20Regular aria-hidden="true" />Solutions</button>
            <button role="menuitem" type="button" disabled><Open20Regular aria-hidden="true" />Open classic experience</button>
          </div>
          <div role="group" aria-labelledby={`${menuId}-admin`}>
            <div className="application-menu-heading" id={`${menuId}-admin`}>Admin</div>
            <button role="menuitem" type="button" disabled><Settings20Regular aria-hidden="true" />Power Platform Admin Center</button>
          </div>
          <div role="group" aria-labelledby={`${menuId}-help`}>
            <div className="application-menu-heading" id={`${menuId}-help`}>Help</div>
            <a role="menuitem" href="https://learn.microsoft.com/en-us/microsoft-copilot-studio/" target="_blank" rel="noopener noreferrer" onClick={() => setShowMore(false)}><BookOpen20Regular aria-hidden="true" />Learning resources<span className="sr-only"> (opens in a new tab)</span></a>
            <button role="menuitem" type="button" disabled><Info20Regular aria-hidden="true" />Session details</button>
          </div>
          <div role="separator" className="menu-separator" />
          <ThemeToggle menuItem />
        </PopupMenu>
      </aside>
    </>
  )
}
