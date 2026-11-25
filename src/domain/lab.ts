import type { EvaluationAssertion, LabCheckResult, LabDefinition, LabInputs, LabOutcome, LabRequirement, LabValue, LabCase } from './lab-types.ts'
import type { TestResponse } from './types.ts'
import { labInputsValid } from './lab-validation.ts'

export function defaultLabInputs(lab: LabDefinition): LabInputs {
  return Object.fromEntries(lab.fields.map(field => [field.id, field.defaultValue]))
}

export function checkedLabInputs(lab: LabDefinition, inputs: LabInputs): LabInputs {
  if (!labInputsValid(lab, inputs)) throw new Error('Review the fictional input fields: use the listed choices, valid numbers and the permitted text lengths.')
  return { ...inputs }
}

export function inputsEqual(lab: LabDefinition, left: LabInputs, right: LabInputs): boolean {
  return lab.fields.every(field => left[field.id] === right[field.id])
}

function present(value: LabValue): boolean {
  return value !== null && (typeof value !== 'string' || value.trim().length > 0)
}

function comparable(value: LabValue): LabValue {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : value
}

export function formatLabValue(value: LabValue): string {
  return value === null || value === '' ? 'Not provided' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value)
}

export function calculateLab(lab: LabDefinition, rawInputs: LabInputs, conversation = '', availableDocuments: ReadonlySet<string> = new Set()) {
  const inputs = checkedLabInputs(lab, rawInputs)
  const checks: LabCheckResult[] = lab.checks.map(check => {
    const actual = inputs[check.field]
    const expected = check.otherField ? inputs[check.otherField] : check.value ?? null
    let passed = false
    if (check.operator === 'present') passed = present(actual)
    else if (present(actual) && present(expected)) {
      switch (check.operator) {
        case 'eq': passed = comparable(actual) === comparable(expected); break
        case 'neq': passed = comparable(actual) !== comparable(expected); break
        case 'gt': passed = typeof actual === 'number' && typeof expected === 'number' && actual > expected; break
        case 'gte': passed = typeof actual === 'number' && typeof expected === 'number' && actual >= expected; break
        case 'lt': passed = typeof actual === 'number' && typeof expected === 'number' && actual < expected; break
        case 'lte': passed = typeof actual === 'number' && typeof expected === 'number' && actual <= expected; break
      }
    }
    return { id: check.id, label: check.label, actual, expected, passed }
  })
  const satisfied = (requirement: LabRequirement) => {
    const result = checks.find(check => check.id === requirement.checkId)
    if (!result) throw new Error(`Unknown check "${requirement.checkId}".`)
    return result.passed === requirement.equals
  }
  const rule = lab.rules.find(item => item.all.every(satisfied) && (!item.any || item.any.some(satisfied))
    && (!item.requiresKnowledge || item.requiresKnowledge.every(id => availableDocuments.has(id))))
  if (!rule) throw new Error('This recipe has no matching rule. Ask its maintainer to add a fallback outcome.')
  const outcome = lab.outcomes.find(item => item.id === rule.outcomeId)
  if (!outcome) throw new Error(`Unknown outcome "${rule.outcomeId}".`)
  const checkText = checks.map(check => `${check.label}: ${check.passed ? 'Met' : 'Not met / unknown'} (input: ${formatLabValue(check.actual)}${check.expected === null ? '' : `; compared with: ${formatLabValue(check.expected)}`}).`).join('\n')
  const render = (text: string) => text.replace(/\{\{([\w-]+)\}\}/g, (_match, key: string) => {
    if (key === 'checks') return checkText
    if (key === 'conversation') return conversation || 'No previous conversation.'
    if (!Object.hasOwn(inputs, key)) throw new Error(`Unknown template input "${key}".`)
    return formatLabValue(inputs[key])
  })
  const recommendations = (outcome.recommendations ?? []).filter(item => !item.when || satisfied(item.when))
    .map(item => `${render(item.title)}: ${render(item.description)}`)
  const title = render(outcome.title)
  const summary = render(outcome.summary)
  const draft = outcome.draft ? { title: render(outcome.draft.title), body: render(outcome.draft.body) } : undefined
  if (title.length > 6000 || summary.length > 10_000 || recommendations.some(item => item.length > 6000) || (draft && (draft.body.length > 6000 || draft.title.length > 6000))) throw new Error('This example produced too much text. Shorten the fictional context before running it again.')
  return { inputs, checks, rule, outcome, title, summary, recommendations, draft }
}

export function compareLabExpectation(testCase: LabCase, response: TestResponse): EvaluationAssertion[] {
  const expected = testCase.expected
  const producedText = [response.text, response.draft?.title ?? '', response.draft?.body ?? ''].join('\n')
  const compare = (label: string, wanted: string, actual: string): EvaluationAssertion => ({ label, expected: wanted, actual, passed: wanted === actual })
  return [
    compare('Outcome', expected.outcomeId, response.lab?.outcomeId ?? 'none'),
    compare('Response type', expected.kind, response.kind),
    compare('Tool / destination', expected.toolId ?? 'none', response.toolId ?? 'none'),
    compare('Policy sources', [...expected.documentIds].sort().join(', ') || 'none', response.citations.map(item => item.documentId).sort().join(', ') || 'none'),
    ...(expected.contains ?? []).map(text => ({ label: 'Required response / draft content', expected: text, actual: producedText.includes(text) ? text : 'Not found in response or draft', passed: producedText.includes(text) })),
  ]
}

export function labOutcome(lab: LabDefinition, id: string): LabOutcome {
  const outcome = lab.outcomes.find(item => item.id === id)
  if (!outcome) throw new Error(`Unknown outcome "${id}".`)
  return outcome
}
