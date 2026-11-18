import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DismissRegular, Info16Regular } from '@fluentui/react-icons'
import { useAnchoredPosition } from '../hooks/useAnchoredPosition.ts'

export function InfoPopover({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const position = useAnchoredPosition(panel, trigger, open)

  return (
    <div className="info-control">
      <button ref={trigger} className="icon-button info-button" type="button" popoverTarget={id}
        aria-label={`About ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}>
        <Info16Regular aria-hidden="true" />
      </button>
      <div ref={panel} id={id} className="info-popover" popover="auto" role="dialog" aria-labelledby={`${id}-title`}
        style={position}
        onToggle={event => setOpen(event.newState === 'open')}>
        <div className="info-popover-heading">
          <strong id={`${id}-title`}>{title}</strong>
          <button className="icon-button" type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`Close ${title} information`}>
            <DismissRegular fontSize={16} aria-hidden="true" />
          </button>
        </div>
        <div className="info-popover-content">{children}</div>
      </div>
    </div>
  )
}
