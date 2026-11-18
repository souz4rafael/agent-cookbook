import { useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useAnchoredPosition } from '../hooks/useAnchoredPosition.ts'

export function PopupMenu({ id, label, open, anchorRef, onClose, children, className = '', align = 'end' }: {
  id: string
  label: string
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (open) {
      ref.current?.showPopover()
      ref.current?.focus()
    } else {
      ref.current?.hidePopover()
    }
  }, [open])
  const position = useAnchoredPosition(ref, anchorRef, open, { align })
  useLayoutEffect(() => {
    if (open && position.visibility === 'visible') ref.current?.focus()
  }, [open, position.visibility])
  return (
    <div ref={ref} id={id} role="menu" aria-label={label} tabIndex={-1} popover="auto"
      className={`studio-popup-menu ${className}`} style={position}
      onToggle={event => { if (event.newState === 'closed' && open) onClose() }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          ref.current?.hidePopover()
          onClose()
          anchorRef.current?.focus()
        }
      }}>
      {children}
    </div>
  )
}
