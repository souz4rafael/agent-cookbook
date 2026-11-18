import { useId, useRef, useState } from 'react'
import {
  ArrowCounterclockwise20Regular, ArrowDownload20Regular, Delete20Regular, Flash20Regular, Keyboard20Regular,
  MoreHorizontal24Filled, Settings20Regular,
} from '@fluentui/react-icons'
import { PopupMenu } from './PopupMenu.tsx'

export function AgentOptionsMenu({ onReset }: { onReset: () => void }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  return (
    <>
      <button ref={trigger} className="icon-button" type="button" onClick={() => setOpen(!open)}
        aria-label="Agent options" title="More options" aria-haspopup="menu" aria-expanded={open} aria-controls={id}><MoreHorizontal24Filled fontSize={20} aria-hidden="true" /></button>
      <PopupMenu id={id} label="Agent options" open={open} anchorRef={trigger} onClose={() => setOpen(false)}>
        <button role="menuitem" type="button" disabled><Settings20Regular aria-hidden="true" />Settings</button>
        <button role="menuitem" type="button" disabled><Flash20Regular aria-hidden="true" />Hooks<span className="menu-preview-tag">Preview</span></button>
        <button role="menuitem" type="button" disabled><Keyboard20Regular aria-hidden="true" />Keyboard shortcuts</button>
        <button role="menuitem" type="button" disabled><ArrowDownload20Regular aria-hidden="true" />Download</button>
        <div role="separator" className="menu-separator" />
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onReset() }}><ArrowCounterclockwise20Regular aria-hidden="true" />Reset recipe</button>
        <button role="menuitem" className="menu-danger" type="button" disabled><Delete20Regular aria-hidden="true" />Delete agent</button>
      </PopupMenu>
    </>
  )
}
