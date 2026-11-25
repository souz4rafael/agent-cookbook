import { createContext, useContext, useEffect, useRef } from 'react'
import type { GuideCondition } from '../domain/types.ts'

export const ReviewCueContext = createContext<GuideCondition | null>(null)
export function useReviewCue() { return useContext(ReviewCueContext) }

export function useReviewSpotlight(enabled: boolean, stepId?: string) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const shell = root.current
    if (!enabled || !shell) return
    let marked: HTMLElement | undefined
    let frame = 0
    let focusFirst = !!stepId
    function refresh() {
      if (!shell) return
      // Never point through a native modal to an inert control behind it.
      const scope = Array.from(shell.querySelectorAll('dialog[open]')).at(-1) ?? shell
      const target = Array.from(scope.querySelectorAll<HTMLElement>('[data-review-cue="true"]'))
        .find(el => el.getClientRects().length && !el.matches(':disabled'))
      if (target === marked) return
      marked?.removeAttribute('data-review-spotlight')
      marked = target
      if (!target) return
      target.setAttribute('data-review-spotlight', '')
      if (focusFirst) {
        const control = target.matches('button,input,select,textarea,summary') ? target : target.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')
        control?.focus({ preventScroll: true })
        focusFirst = false
      }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    }
    function schedule() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(refresh)
    }
    // Lazy panels and nested dialogs can mount after the step has been selected.
    const observer = new MutationObserver(schedule)
    observer.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-review-cue', 'open', 'disabled', 'hidden'] })
    schedule()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); marked?.removeAttribute('data-review-spotlight') }
  }, [enabled, stepId])
  return root
}
