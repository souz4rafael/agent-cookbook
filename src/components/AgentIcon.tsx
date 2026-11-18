import { useState } from 'react'
import {
  BotRegular, ChatRegular, DocumentTextRegular, GlobeRegular,
  HatGraduationRegular, HeartRegular, PeopleCommunityRegular, SparkleRegular,
} from '@fluentui/react-icons'
import { agentIcons } from '../domain/types.ts'
import type { AgentIcon } from '../domain/types.ts'
import { Modal } from './Modal.tsx'

const icons = {
  citizen: { label: 'Community', component: PeopleCommunityRegular },
  document: { label: 'Document', component: DocumentTextRegular },
  learning: { label: 'Learning', component: HatGraduationRegular },
  benefit: { label: 'Heart', component: HeartRegular },
  bot: { label: 'Bot', component: BotRegular },
  chat: { label: 'Chat', component: ChatRegular },
  sparkle: { label: 'Sparkle', component: SparkleRegular },
  globe: { label: 'Globe', component: GlobeRegular },
}

export function AgentIconGraphic({ icon, size = 25 }: { icon: AgentIcon; size?: number }) {
  const Icon = icons[icon].component
  return <Icon fontSize={size} aria-hidden="true" />
}

export function AgentIconPicker({ icon, onSave, onClose }: {
  icon: AgentIcon
  onSave: (icon: AgentIcon) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(icon)
  return (
    <Modal title="Change agent icon" onClose={onClose}>
      <div className="modal-body">
        <p>Choose an icon for your agent.</p>
        <fieldset className="agent-icon-options">
          <legend className="sr-only">Agent icon</legend>
          {agentIcons.map(value => (
            <label key={value} className={selected === value ? 'selected' : ''}>
              <input type="radio" name="agent-icon" value={value} checked={selected === value} onChange={() => setSelected(value)} />
              <AgentIconGraphic icon={value} size={32} />
              <span>{icons[value].label}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div className="modal-footer">
        <span className="fine-print">Saved with this recipe in your browser.</span>
        <div className="footer-actions">
          <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button primary" type="button" onClick={() => { onSave(selected); onClose() }}>Save</button>
        </div>
      </div>
    </Modal>
  )
}
