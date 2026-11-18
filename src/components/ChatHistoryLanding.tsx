import { useState } from 'react'
import { ChatAdd20Regular, Dismiss16Regular, Search20Regular } from '@fluentui/react-icons'
import { InfoPopover } from './InfoPopover.tsx'

export function ChatHistoryLanding({ onReturnToRecipe }: { onReturnToRecipe: () => void }) {
  const [query, setQuery] = useState('')
  return (
    <main className="chat-history-landing" id="studio-main" tabIndex={-1} aria-labelledby="chat-history-title">
      <div className="chat-history-heading">
        <div className="heading-with-info"><h1 id="chat-history-title">Chat history</h1><InfoPopover title="Chat history"><p>In Copilot Studio, this page lists recent conversations across agents.</p><p>Cross-agent chat history is not simulated here. Return to your recipe and use Preview to try a conversation. Agents opens the full cookbook catalogue.</p></InfoPopover></div>
        <button className="button quiet" type="button" disabled title="Use the agent's Preview to start a local conversation."><ChatAdd20Regular aria-hidden="true" />New chat</button>
      </div>
      <div className="chat-history-search search-field"><Search20Regular aria-hidden="true" /><input type="search" aria-label="Search chat history" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => setQuery('')}><Dismiss16Regular aria-hidden="true" /></button>}</div>
      <p className="chat-history-note" role="note">Your recipe conversations stay in Preview. Cross-agent history is not connected. <button className="text-button" type="button" onClick={onReturnToRecipe}>Return to recipe</button></p>
      <section className="chat-history-empty" aria-label="Recent conversations"><p role="status">{query ? 'No matching conversations' : 'No recent conversations'}</p></section>
    </main>
  )
}
