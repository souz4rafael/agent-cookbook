import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  CheckmarkCircle20Regular, Circle20Regular, ChevronDown16Regular,
  DocumentEdit20Regular, Database20Regular, PlugConnected20Regular, Play20Regular, Wrench20Regular,
} from '@fluentui/react-icons'
import type { AgentProfile, CompiledRecipe, GuideStep, Session } from '../domain/types.ts'
import { isStepComplete } from '../domain/engine.ts'
import { Modal } from './Modal.tsx'
import { PreviewSettings } from './Panels.tsx'
import { LabRuleGuide } from './InteractiveLab.tsx'
import { useReviewCue } from './reviewCue.ts'

export function ReviewGuide({ recipe, session, updateProfile, onClose, onJump, onTryExample, anchorRef, guided, onGuidedChange, onSelectStep }: {
  recipe: CompiledRecipe
  session: Session
  updateProfile: (patch: Partial<AgentProfile>) => void
  onClose: () => void
  onJump: (step: GuideStep) => void
  guided: boolean
  onGuidedChange: (enabled: boolean) => void
  onSelectStep: (step: GuideStep) => void
  onTryExample: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
}) {
  const [filter, setFilter] = useState<'all' | 'remaining' | 'complete'>('all')
  const completed = recipe.journey.filter(step => isStepComplete(recipe, session, step)).length
  const remaining = recipe.journey.length - completed
  const nextStep = recipe.journey.find(step => !isStepComplete(recipe, session, step))
  const settings = useRef<HTMLDetailsElement>(null)
  const guideSettings = useReviewCue()?.type === 'behavior-edited'
  function choose(step: GuideStep) {
    onSelectStep(step)
    if (step.completeWhen.type === 'behavior-edited' && settings.current) {
      settings.current.open = true
      settings.current.querySelector('summary')?.focus()
      settings.current.scrollIntoView({ block: 'nearest' })
    } else {
      onJump(step)
    }
  }
  const visibleSteps = recipe.journey.filter(step => filter === 'all' || isStepComplete(recipe, session, step) === (filter === 'complete'))
  return (
    <Modal title="Review your recipe" onClose={onClose} anchorRef={anchorRef} className="review-panel">
      <div className="review-guide-body">
        <p className="review-intro">Open <strong>Review</strong> at any time to see your next step.</p>
        <label className="switch-label review-guided-switch"><span>Guided</span><input aria-label="Guided" type="checkbox" role="switch" checked={guided} onChange={event => onGuidedChange(event.target.checked)} aria-describedby="review-guided-help" /><span className="switch-track" aria-hidden="true" /><small aria-hidden="true">{guided ? 'On' : 'Off'}</small></label>
        <p id="review-guided-help" className="field-hint">Highlight where to click when you open a learning step.</p>
        {recipe.lab && <p className="review-intro">Complete the evidence requirements listed below. Depending on the recipe, these include named examples, source reviews, confirmed actions and evaluation. Evidence belongs to your current configuration; after changing sources, tools or profile settings, repeat the affected work. Evaluate does not replace hands-on Preview steps.</p>}
        <div className="review-filters" role="group" aria-label="Filter learning steps">
          {([
            { id: 'all', label: 'All' },
            { id: 'remaining', label: `To do (${remaining})` },
            { id: 'complete', label: `Completed (${completed})` },
          ] as const).map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        </div>
        <h3>{filter === 'complete' ? 'Completed steps' : 'Learning steps'}</h3>
        <ol className="review-checklist">
          {visibleSteps.map(step => {
            const done = isStepComplete(recipe, session, step)
            const Icon = done ? CheckmarkCircle20Regular
              : step.completeWhen.type === 'connection' ? PlugConnected20Regular
                : step.tab === 'knowledge' ? Database20Regular
                  : step.tab === 'tools' ? Wrench20Regular
                    : step.completeWhen.type === 'event' ? Play20Regular
                      : step.completeWhen.type === 'profile-edited' ? DocumentEdit20Regular : Circle20Regular
            return (
              <li key={step.id} className={done ? 'complete' : ''} aria-current={step === nextStep ? 'step' : undefined}>
                <Icon aria-hidden="true" />
                <div>
                  <div className="review-step-heading"><h4>{step.title}</h4><button type="button" data-review-cue={(guided && step === nextStep && !guideSettings) || undefined} className="button small secondary" onClick={() => choose(step)}>{done ? 'View' : step === nextStep ? 'Next step' : 'Open'}</button></div>
                  <p>{step.description}</p>
                  <span className="sr-only">{done ? 'Complete' : 'Not complete'}</span>
                </div>
              </li>
            )
          })}
        </ol>
        {visibleSteps.length === 0 && <p className="review-empty">{filter === 'remaining' ? 'All steps are complete.' : filter === 'complete' ? 'No completed steps yet.' : 'Explore this recipe in any order.'}</p>}
        <LabRuleGuide recipe={recipe} />
        <details ref={settings} className="preview-settings">
          <summary>Preview settings<ChevronDown16Regular aria-hidden="true" /></summary>
          <PreviewSettings recipe={recipe} session={session} updateProfile={updateProfile} />
        </details>
        {recipe.lab && <div className="review-try-example"><button type="button" className="button secondary small" onClick={onTryExample}><Play20Regular aria-hidden="true" />Try this example</button><p className="field-hint">When you reach a practice step, choose or edit fictional inputs here and run the example. Its result appears in Preview; you do not need to complete the whole recipe first.</p></div>}
      </div>
      <div className="review-guide-footer"><span>{completed} of {recipe.journey.length} steps complete</span><button className="text-button" type="button" onClick={onClose}>Keep exploring</button></div>
    </Modal>
  )
}
