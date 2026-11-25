import { useState } from 'react'
import { Play20Regular, ArrowReset20Regular } from '@fluentui/react-icons'
import type { CompiledRecipe, Session, TestResponse } from '../domain/types.ts'
import type { LabInputs } from '../domain/lab-types.ts'
import { defaultLabInputs, formatLabValue, inputsEqual } from '../domain/lab.ts'
import { useReviewCue } from './reviewCue.ts'
import './InteractiveLab.css'

export function InteractiveLab({ recipe, session, onChange, onRun }: {
  recipe: CompiledRecipe
  session: Session
  onChange: (inputs: LabInputs) => boolean
  onRun: () => boolean
}) {
  const lab = recipe.lab
  const cue = useReviewCue()
  const runTarget = cue?.type === 'case-tested' || cue?.type === 'citation-opened' || cue?.type === 'action-confirmed'
  if (!lab) return null
  const inputs = session.labInputs ?? defaultLabInputs(lab)
  const examples = lab.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length)
  const selected = examples.find(item => inputsEqual(lab, item.inputs, inputs))?.id ?? ''
  function update(id: string, value: LabInputs[string]) { onChange({ ...inputs, [id]: value }) }
  return (
    <div className="interactive-lab">
      <div className="lab-content">
        <p>{lab.description}</p>
        <p className="fine-print">Cookbook learning controls opened from Review, not part of the original Preview. Edits are saved locally; only Run example adds a result to the chat. No upload, AI, external lookup or real action.</p>
        <div className="lab-example-picker"><label htmlFor="lab-example">Load an example</label><select id="lab-example" value={selected} onChange={event => {
          const example = examples.find(item => item.id === event.target.value)
          if (example) onChange({ ...example.inputs })
        }}><option value="" disabled>Custom inputs</option>{examples.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
        <div className="lab-fields">
          {lab.fields.map(field => <div className={`lab-field lab-field-${field.type}`} key={field.id}>
            <label htmlFor={`lab-${field.id}`}>{field.label}</label>
            {field.type === 'boolean' ? <input id={`lab-${field.id}`} type="checkbox" checked={inputs[field.id] === true} onChange={event => update(field.id, event.target.checked)} aria-describedby={`lab-help-${field.id}`} />
              : field.type === 'select' ? <select id={`lab-${field.id}`} value={String(inputs[field.id])} onChange={event => update(field.id, event.target.value)} aria-describedby={`lab-help-${field.id}`}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                : field.type === 'number' ? <input id={`lab-${field.id}`} type="number" step="any" min={field.min} max={field.max} value={inputs[field.id] === null ? '' : String(inputs[field.id])} onChange={event => update(field.id, event.target.value === '' ? null : Number(event.target.value))} aria-describedby={`lab-help-${field.id}`} />
                  : <input id={`lab-${field.id}`} type="text" maxLength={800} value={String(inputs[field.id])} onChange={event => update(field.id, event.target.value)} aria-describedby={`lab-help-${field.id}`} />}
            <span id={`lab-help-${field.id}`} className="field-hint">{field.hint}</span>
          </div>)}
        </div>
        <div className="lab-actions"><button type="button" className="button primary" onClick={onRun} data-review-cue={runTarget || undefined}><Play20Regular aria-hidden="true" />Run example</button><button type="button" className="button quiet" onClick={() => onChange(defaultLabInputs(lab))}><ArrowReset20Regular aria-hidden="true" />Restore inputs</button><span>Running calculates an outcome. It never executes a tool.</span></div>
      </div>
    </div>
  )
}

export function LabResultDetails({ response }: { response: TestResponse }) {
  const lab = response.lab
  if (!lab) return null
  return <details className="lab-result"><summary>Inputs and rule-by-rule evidence</summary>
    <div className="lab-check-scroll"><table><thead><tr><th>Check</th><th>Input</th><th>Compared with</th><th>Result</th></tr></thead><tbody>{lab.checks.map(check => <tr key={check.id}><th scope="row">{check.label}</th><td>{formatLabValue(check.actual)}</td><td>{formatLabValue(check.expected)}</td><td>{check.passed ? 'Met' : check.actual === null || check.actual === '' ? 'Unknown' : 'Not met'}</td></tr>)}</tbody></table></div>
    <p className="fine-print">Matched rule: {lab.ruleId}. Outcome: {lab.outcomeId}. This is a deterministic check record, not an AI reasoning trace.</p>
  </details>
}

export function ReviewableDraft({ response, onReview }: { response: TestResponse; onReview?: (text: string) => void }) {
  const [text, setText] = useState(response.draft?.body ?? '')
  if (!response.draft) return null
  return <details className="lab-draft"><summary>{response.draft.title}</summary>
    <label>Reviewable draft<textarea aria-label={response.draft.title} value={text} onChange={event => setText(event.target.value)} maxLength={6000} rows={7} /></label>
    {onReview && <button className="button secondary small" type="button" disabled={!text.trim()} onClick={() => onReview(text)}>Review action with this draft</button>}
    <p className="fine-print">A local editable preview, not an official communication. Draft edits stay here until you use them in a confirmed local request; no message is sent.</p>
  </details>
}

export function LabRuleGuide({ recipe }: { recipe: CompiledRecipe }) {
  const lab = recipe.lab
  if (!lab) return null
  const checkLabels = new Map(lab.checks.map(check => [check.id, check.label]))
  return <details className="lab-rule-guide">
      <summary>How this exercise works</summary>
      <p>{lab.description}</p>
      <p className="fine-print">Rules run in this order; the first match wins. Use Try this example in Review to edit inputs and run a case, then read the result in Preview. Rules are declared by the recipe, not generated from free-text instructions.</p>
      <ol>{lab.rules.map(rule => <li key={rule.id}><strong>{rule.label}</strong><p>{rule.all.length ? rule.all.map(item => `${checkLabels.get(item.checkId)} = ${item.equals ? 'met' : 'not met'}`).join(' AND ') : rule.any || rule.requiresKnowledge ? 'Conditional rule' : 'Fallback'}{rule.any ? `; at least one: ${rule.any.map(item => `${checkLabels.get(item.checkId)} = ${item.equals ? 'met' : 'not met'}`).join(' OR ')}` : ''}</p>{rule.requiresKnowledge && <p>Requires selected sources: {rule.requiresKnowledge.map(id => recipe.knowledge.find(doc => doc.id === id)!.title).join('; ')}</p>}<p>Outcome: {lab.outcomes.find(item => item.id === rule.outcomeId)?.title}</p></li>)}</ol>
      <p className="fine-print">Use Publish to download the configuration and implementation brief. No real deployment takes place here.</p>
    </details>
}
