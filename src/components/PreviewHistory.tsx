import { useState } from 'react'
import { ArrowLeft20Regular, ArrowSync20Regular, ColumnEdit20Regular, History24Regular, Search20Regular } from '@fluentui/react-icons'
import type { Session } from '../domain/types.ts'
import { InfoPopover } from './InfoPopover.tsx'

export function PreviewHistory({ active, session, onBack }: { active: boolean; session: Session; onBack: () => void }) {
  const [filter, setFilter] = useState('All')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const visible = session.messages.length > 0 && (filter === 'All' || filter === 'Completed')
    && (!query || 'local-preview'.includes(query.toLowerCase()))
  return (
    <section className="preview-history-page" hidden={!active} aria-labelledby="preview-history-title">
      <div className="preview-history-heading"><button className="icon-button" type="button" onClick={onBack} aria-label="Back to Preview"><ArrowLeft20Regular aria-hidden="true" /></button><h1 id="preview-history-title">History</h1><InfoPopover title="Preview history"><p>Inspect sessions started while testing an agent.</p><p>This exercise retains only the current local conversation. New chat clears it; there is no cloud session archive.</p></InfoPopover></div>
      <div className="preview-history-tools">
        <div className="history-filters" role="group" aria-label="Filter preview history">{['All', 'In progress', 'Completed', 'Failed', 'Cancelled', 'Auth required', 'Input required'].map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
        <div className="history-actions"><button className="button quiet small" type="button" onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen}><Search20Regular aria-hidden="true" />Find by ID</button><button className="icon-button" type="button" aria-label="Refresh history" onClick={() => setNotice('The current local conversation is up to date.')}><ArrowSync20Regular aria-hidden="true" /></button><button className="icon-button" type="button" disabled aria-label="Edit columns"><ColumnEdit20Regular aria-hidden="true" /></button></div>
      </div>
      {searchOpen && <label className="search-field history-search"><Search20Regular aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Find a session by ID" placeholder="Find by ID" /></label>}
      {visible ? <div className="preview-history-table"><table><thead><tr><th>Session</th><th>Status</th><th>Messages</th><th><span className="sr-only">Action</span></th></tr></thead><tbody><tr><td><strong>Current preview</strong><span>local-preview</span></td><td>Completed</td><td>{session.messages.length}</td><td><button className="text-button" type="button" onClick={onBack}>Open conversation</button></td></tr></tbody></table></div>
        : <div className="preview-history-empty"><History24Regular aria-hidden="true" /><h2>No activity to display</h2><p>{session.messages.length ? 'No local conversation matches this filter.' : "When you test your agent, you'll see the current local conversation here."}</p><button className="button secondary" type="button" onClick={() => setNotice('The current local conversation is up to date.')}><ArrowSync20Regular aria-hidden="true" />Refresh</button></div>}
      <p className="fine-print" role="status">{notice}</p>
    </section>
  )
}
