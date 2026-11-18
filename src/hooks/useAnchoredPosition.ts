import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

export function useAnchoredPosition(
  panel: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  { align = 'start', placement = 'auto' }: { align?: 'start' | 'end'; placement?: 'auto' | 'below' } = {},
): CSSProperties {
  const [positioned, setPositioned] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !panel.current || !anchor.current) return
    const element = panel.current
    function position() {
      if (!anchor.current) return
      const target = anchor.current.getBoundingClientRect()
      const margin = 12
      const gap = 5
      const below = window.innerHeight - target.bottom - gap - margin
      const above = placement === 'auto' && element.scrollHeight > below && target.top > below
      const maxHeight = Math.max(80, above ? target.top - gap - margin : below)
      const bounds = element.getBoundingClientRect()
      const height = Math.min(bounds.height, maxHeight)
      const left = align === 'end' ? target.right - bounds.width : target.left
      const top = above ? target.top - height - gap : target.bottom + gap
      const next = {
        left: Math.max(margin, Math.min(left, window.innerWidth - bounds.width - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
        maxHeight,
      }
      setPositioned(previous => previous?.left === next.left && previous.top === next.top && previous.maxHeight === maxHeight ? previous : next)
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(element)
    observer.observe(anchor.current)
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  }, [align, anchor, open, panel, placement])
  return { ...positioned, visibility: open && positioned ? 'visible' : 'hidden' }
}
