import type { InstructionStyles } from './types.ts'

export const instructionLimit = 3000
export const instructionStyleOptions = [
  { id: 'structured', label: 'Structured', when: 'A clear starting point for most agents, especially when several people will review or maintain the instructions.', notice: 'Purpose, scope, knowledge, actions and response structure have separate sections.' },
  { id: 'stepByStep', label: 'Step-by-step', when: 'Use when the order of gathering information, checking it and proposing an action matters.', notice: 'Numbered steps make prerequisites, confirmation and failure handling explicit. Use a configured flow or topic when execution order must be enforced.' },
  { id: 'decisionRules', label: 'Decision rules', when: 'Use when different conditions lead to different answers, tools or human-review paths.', notice: 'If/when rules expose the exceptions as well as the usual path. Written instructions do not replace a validated rules service.' },
] as const
export type InstructionStyleId = typeof instructionStyleOptions[number]['id']

export function composeInstructions(styles: InstructionStyles, style: InstructionStyleId, includeExamples: boolean): string {
  const text = includeExamples ? `${styles[style]}\n\n${styles.examples}` : styles[style]
  if (text.length > instructionLimit) throw new Error(`Instructions must contain no more than ${instructionLimit} characters, including examples.`)
  return text
}

export function identifyInstructionStyle(styles: InstructionStyles, text: string): { style: InstructionStyleId; includeExamples: boolean } | null {
  for (const option of instructionStyleOptions) {
    for (const includeExamples of [false, true]) {
      if (composeInstructions(styles, option.id, includeExamples) === text) return { style: option.id, includeExamples }
    }
  }
  return null
}

export type InstructionBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }

// Deliberately limited formatting: never interpret HTML, links, images or embedded code.
export function parseInstructionBlocks(text: string): InstructionBlock[] {
  const blocks: InstructionBlock[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) { blocks.push({ kind: 'paragraph', text: '' }); continue }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) { blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] }); continue }
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    const number = /^(\d+)\.\s+(.+)$/.exec(line)
    const previous = blocks.at(-1)
    if (bullet || number) {
      const ordered = !!number
      const item = bullet ? bullet[1] : number![2]
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(item)
      else blocks.push({ kind: 'list', ordered, start: number ? Number(number[1]) : 1, items: [item] })
    } else if (previous?.kind === 'paragraph' && previous.text) previous.text += ` ${line}`
    else blocks.push({ kind: 'paragraph', text: line })
  }
  return blocks.filter(block => block.kind !== 'paragraph' || block.text)
}
