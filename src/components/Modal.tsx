import { useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Dismiss20Regular as X } from '@fluentui/react-icons'
import { useAnchoredPosition } from '../hooks/useAnchoredPosition.ts'

export function Modal({ title, eyebrow, children, onClose, wide = false, className = '', anchorRef }: {
  title: string
  eyebrow?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  className?: string
  anchorRef?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const noAnchor = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = anchorRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener?.isConnected && !opener.matches(':disabled')) opener.focus()
      else document.getElementById('test-message')?.focus()
    }
  }, [anchorRef])
  const position = useAnchoredPosition(ref, anchorRef ?? noAnchor, !!anchorRef, { align: 'end', placement: 'below' })
  return (
    <dialog ref={ref} className={`modal${wide ? ' modal-wide' : ''}${anchorRef ? ' anchored-dialog' : ''} ${className}`} aria-labelledby={titleId}
      style={anchorRef ? position : undefined}
      onCancel={event => { event.preventDefault(); onClose() }}
      onPointerDown={event => {
        if (!anchorRef || event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }}>
      <div className="modal-header">
        <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X fontSize={20} aria-hidden="true" /></button>
      </div>
      {children}
    </dialog>
  )
}
