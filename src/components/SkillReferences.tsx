import { useState } from 'react'
import type { CompiledRecipe } from '../domain/types.ts'
import { Modal } from './Modal.tsx'
import { parseInstructionBlocks } from '../domain/instructions.ts'

export function SkillReferences({ skills }: { skills: NonNullable<CompiledRecipe['skills']> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = skills.find(skill => skill.id === selectedId)
  return <>
    <div className="configuration-chips">{skills.map(skill =>
      <span className="configuration-chip" key={skill.id}>
        <button type="button" onClick={() => setSelectedId(skill.id)} title={skill.coverage === 'simulated' ? 'Local teaching exercise available' : 'Reference only - not executable'}>
          <span>{skill.title}</span>
        </button>
      </span>)}</div>
    {selected && <Modal title={selected.title} eyebrow={selected.coverage === 'simulated' ? 'LOCAL TEACHING ADAPTATION' : 'REFERENCE ONLY - NOT EXECUTABLE'} onClose={() => setSelectedId(null)} wide>
      <div className="modal-body">
        <p>{selected.description}</p>
        <p className="fine-print">Skill key: <code>{selected.id}</code>. This is a paraphrased reference, not the uploaded skill file. No model or native skill executes here.</p>
        {parseInstructionBlocks(selected.instructions).map((block, index) => block.kind === 'heading' ? <h3 key={index}>{block.text}</h3>
          : block.kind === 'paragraph' ? <p key={index}>{block.text}</p>
            : block.ordered ? <ol key={index} start={block.start}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>
              : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>)}
      </div>
      <div className="modal-footer"><span className="fine-print">{selected.coverage === 'simulated' ? 'Open Review > Try this example to run the bounded exercise.' : 'This skill is documented for orientation only.'}</span><button className="button secondary" type="button" onClick={() => setSelectedId(null)}>Close</button></div>
    </Modal>}
  </>
}
