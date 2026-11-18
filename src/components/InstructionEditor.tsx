import { useId, useState } from 'react'
import type { CompiledRecipe } from '../domain/types.ts'
import { composeInstructions, identifyInstructionStyle, instructionLimit, instructionStyleOptions, parseInstructionBlocks } from '../domain/instructions.ts'
import type { InstructionStyleId } from '../domain/instructions.ts'
import { Modal } from './Modal.tsx'
import { InfoPopover } from './InfoPopover.tsx'
import './InstructionEditor.css'

function FormattedInstructions({ text }: { text: string }) {
  const blocks = parseInstructionBlocks(text)
  return <div className="instruction-formatted">
    {blocks.length === 0 && <p className="fine-print">No candidate instructions to preview.</p>}
    {blocks.map((block, index) => {
      if (block.kind === 'heading') return <div key={index} role="heading" aria-level={Math.min(block.level + 2, 6)} className={`instruction-heading instruction-heading-${block.level}`}>{block.text}</div>
      if (block.kind === 'list') return block.ordered
        ? <ol key={index} start={block.start}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>
        : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
      return <p key={index}>{block.text}</p>
    })}
  </div>
}

export function InstructionEditor({ recipe, value, onChange }: {
  recipe: CompiledRecipe
  value: string
  onChange: (value: string) => boolean
}) {
  const styles = recipe.instructionStyles
  const currentStyle = styles ? identifyInstructionStyle(styles, value) : null
  const [selectedStyle, setSelectedStyle] = useState<InstructionStyleId>(() => currentStyle?.style ?? 'structured')
  const [includeExamples, setIncludeExamples] = useState(() => currentStyle?.includeExamples ?? false)
  const [candidateMode, setCandidateMode] = useState<'text' | 'formatted'>('formatted')
  const [pending, setPending] = useState<{ candidate: string; previous: string } | null>(null)
  const [message, setMessage] = useState('')
  const [applyError, setApplyError] = useState('')
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null)
  const id = useId()
  const editable = recipe.editable.includes('instructions')
  const selected = instructionStyleOptions.find(option => option.id === selectedStyle)!
  const candidate = styles ? composeInstructions(styles, selectedStyle, includeExamples) : ''
  function chooseStyle(style: InstructionStyleId) {
    setSelectedStyle(style)
    setMessage('')
  }
  function applyCandidate() {
    if (!pending) return
    if (value !== pending.previous) {
      setApplyError('Your instructions changed while this dialog was open. Close it and review the current text before trying again.')
      return
    }
    if (!onChange(pending.candidate)) {
      setApplyError('The version could not be applied. Your previous text is unchanged. Close this dialog and review the editor notice.')
      return
    }
    setUndo({ before: value, after: pending.candidate })
    setPending(null)
    setMessage('Version applied to your instructions and included in the implementation brief. Check the save indicator for browser-storage status.')
  }
  return (
    <section className="instructions-section instruction-editor" aria-labelledby={`${id}-heading`}>
      <div className="instructions-toolbar">
        <div className="heading-with-info"><h2 id={`${id}-heading`}>Instructions</h2><InfoPopover title="Instructions"><p>Describe the agent's purpose, scope, use of configured resources, missing-information handling and response structure.</p><p>These are writing styles for learning, not official Copilot Studio modes. Applying or editing instructions updates your saved planning text, not the deterministic rules in this simulator.</p></InfoPopover></div>
        <span>Plain text <span className="toolbar-divider">|</span> {value.length}/{instructionLimit}</span>
      </div>
      <label className="sr-only" htmlFor="agent-instructions">Instructions</label>
      <textarea id="agent-instructions" className="instructions-canvas" value={value} maxLength={instructionLimit} readOnly={!editable} onChange={event => { onChange(event.target.value); setMessage('') }} aria-describedby={`${id}-simulator-note`} placeholder="Describe purpose, scope, resources, actions and response structure." />

      <details className="instruction-learning-aids">
      <summary className="instruction-learning-heading">Writing guidance <span>Cookbook learning aids</span></summary>
      <p id={`${id}-simulator-note`} className="instruction-simulator-note">Authoring practice only: these instructions are saved and exported, but do not change simulated answers. Test their generative effect in a real Copilot Studio environment. Applying a different text can mark existing learning evidence and evaluations as needing a rerun.</p>
      {styles && <details className="instruction-style-picker">
        <summary>Compare instruction styles <span>Structured · Step-by-step · Decision rules</span></summary>
        <div className="instruction-style-content">
          <div className="instruction-style-controls">
            <label htmlFor={`${id}-style`}>Instruction style</label>
            <select id={`${id}-style`} value={selectedStyle} onChange={event => {
              const option = instructionStyleOptions.find(item => item.id === event.target.value)
              if (option) chooseStyle(option.id)
            }}>{instructionStyleOptions.map(option => <option key={option.id} value={option.id}>{option.label}{option.id === 'structured' ? ' (recommended)' : ''}</option>)}</select>
            <label className="instruction-example-option"><input type="checkbox" checked={includeExamples} onChange={event => { setIncludeExamples(event.target.checked); setMessage('') }} />Include behaviour examples</label>
          </div>
          <dl className="instruction-style-guidance"><div><dt>When to use this style</dt><dd>{selected.when}</dd></div><div><dt>What to notice</dt><dd>{selected.notice}</dd></div></dl>
          {includeExamples && <p className="fine-print">Examples show missing information, declined actions or exceptions. They complement the instructions; they do not configure tools or guarantee a result.</p>}
          <div className="instruction-preview-toolbar">
            <strong>Candidate version <span>Not applied</span></strong>
            <div className="instruction-view-switch" role="group" aria-label="Candidate view">
              <button type="button" aria-pressed={candidateMode === 'text'} onClick={() => setCandidateMode('text')}>Text</button>
              <button type="button" aria-pressed={candidateMode === 'formatted'} onClick={() => setCandidateMode('formatted')}>Formatted preview</button>
            </div>
          </div>
          <div className="instruction-candidate">{candidateMode === 'formatted' ? <FormattedInstructions text={candidate} /> : <textarea aria-label="Candidate instructions" readOnly value={candidate} rows={14} />}</div>
          <p className="fine-print">Preview supports headings, paragraphs, bullet lists and numbered steps. Other Markdown and HTML remain plain text.</p>
          <div className="instruction-apply-row"><button type="button" className="button primary" disabled={!editable || candidate === value} onClick={() => { setApplyError(''); setPending({ candidate, previous: value }) }}>Use this version</button><span>{candidate.length}/{instructionLimit} characters{candidate === value ? ' · Matches your current instructions' : ' · Your current text stays unchanged until you confirm'}</span></div>
          {undo && value === undo.after && <button className="text-button" type="button" onClick={() => {
            if (onChange(undo.before)) { setUndo(null); setMessage('Restored the text from before the last template application.') }
          }}>Undo last template application</button>}
          {message && <p className="instruction-status" role="status">{message}</p>}
        </div>
      </details>}
      </details>
      {pending && <Modal title="Replace your instructions?" onClose={() => setPending(null)}>
        <div className="modal-body"><p>This replaces your current instructions with the candidate version. It does not merge text. Existing edits will be replaced; you can cancel or undo the last application while the replacement remains unchanged.</p><p className="field-hint">Simulator outcomes do not change, but this configuration edit can require learning evidence and evaluations to be repeated.</p><details className="instruction-previous"><summary>Review your current text before replacing it</summary><pre>{pending.previous}</pre></details>{applyError && <p className="error-notice" role="alert">{applyError}</p>}</div>
        <div className="modal-footer"><button type="button" className="button secondary" onClick={() => setPending(null)}>Keep my instructions</button><button type="button" className="button primary" disabled={!editable || value !== pending.previous} onClick={applyCandidate}>Replace instructions</button></div>
      </Modal>}
    </section>
  )
}
