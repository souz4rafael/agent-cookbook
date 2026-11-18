export type LabValue = string | number | boolean | null
export type LabInputs = Record<string, LabValue>

export interface LabField {
  id: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select'
  defaultValue: LabValue
  hint: string
  options?: { value: string; label: string }[]
  min?: number
  max?: number
}

export interface LabCheck {
  id: string
  label: string
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'present'
  value?: LabValue
  otherField?: string
}

export interface LabRequirement { checkId: string; equals: boolean }
export interface LabRule {
  id: string
  label: string
  all: LabRequirement[]
  any?: LabRequirement[]
  outcomeId: string
}
export interface LabDraft { title: string; body: string }
export interface LabOutcome {
  id: string
  title: string
  summary: string
  documentIds: string[]
  skillId?: string
  toolId?: string
  draft?: LabDraft
  recommendations?: { when?: LabRequirement; title: string; description: string }[]
}
export interface LabExpectation {
  outcomeId: string
  kind: 'answer' | 'missing-knowledge' | 'handoff-ready' | 'handoff-blocked'
  toolId?: string
  documentIds: string[]
  contains?: string[]
}
export interface LabCase {
  id: string
  title: string
  inputs: LabInputs
  expected: LabExpectation
  disabledKnowledge?: string[]
  disabledTools?: string[]
}
export interface LabDefinition {
  title: string
  description: string
  fields: LabField[]
  checks: LabCheck[]
  rules: LabRule[]
  outcomes: LabOutcome[]
  cases: LabCase[]
}
export interface LabCheckResult {
  id: string
  label: string
  passed: boolean
  actual: LabValue
  expected: LabValue
}
export interface LabResponse {
  outcomeId: string
  ruleId: string
  inputs: LabInputs
  checks: LabCheckResult[]
  recommendations: string[]
  fingerprint: string
}
export interface LearningEvidence {
  testedCases: { id: string; fingerprint: string }[]
  citations: { documentId: string; fingerprint: string }[]
  actions: { toolId: string; outcomeId: string; fingerprint: string }[]
}
export interface EvaluationAssertion { label: string; passed: boolean; expected: string; actual: string }
