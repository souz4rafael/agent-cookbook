import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { labDefinitionSchema, labInputsValid, labReferenceIssues } from '../src/domain/lab-validation.ts'
import { compiledRecipeSchema, recipeSchema } from '../src/domain/validation.ts'
import { decodeSession, saveSession } from '../src/domain/storage.ts'
import type { CompiledRecipe, Session, TestResponse } from '../src/domain/types.ts'
import type { LabDefinition, LabInputs } from '../src/domain/lab-types.ts'

const inputs: LabInputs = { age: 20, consent: true, category: 'standard', notes: '' }
const lab: LabDefinition = {
  title: 'Eligibility lab', description: 'A deterministic, grounded exercise.',
  fields: [
    { id: 'age', label: 'Age', type: 'number', defaultValue: null, hint: 'Enter an age.', min: 0, max: 120 },
    { id: 'consent', label: 'Consent', type: 'boolean', defaultValue: false, hint: 'Consent to processing.' },
    { id: 'category', label: 'Category', type: 'select', defaultValue: 'standard', hint: 'Choose a category.', options: [{ value: 'standard', label: 'Standard' }] },
    { id: 'notes', label: 'Notes', type: 'text', defaultValue: '', hint: 'Optional notes.' },
  ],
  checks: [
    { id: 'adult', label: 'Adult', field: 'age', operator: 'gte', value: 18 },
    { id: 'consented', label: 'Consented', field: 'consent', operator: 'eq', value: true },
  ],
  rules: [
    { id: 'eligible', label: 'Eligible', all: [{ checkId: 'adult', equals: true }, { checkId: 'consented', equals: true }], outcomeId: 'submit' },
    { id: 'fallback', label: 'Fallback', all: [], outcomeId: 'review' },
  ],
  outcomes: [
    {
      id: 'submit', title: 'Submit request', summary: 'Eligible at age {{age}}.', documentIds: ['policy'], toolId: 'create-request',
      draft: { title: 'Request: {{category}}', body: '{{notes}}\n{{checks}}\n{{conversation}}' },
      recommendations: [{ when: { checkId: 'consented', equals: true }, title: 'Next step', description: 'Review {{category}}.' }],
    },
    { id: 'review', title: 'Review requirements', summary: 'Review the policy.', documentIds: ['policy'] },
  ],
  cases: [
    { id: 'eligible-case', title: 'Eligible applicant', inputs, expected: { outcomeId: 'submit', kind: 'handoff-ready', toolId: 'create-request', documentIds: ['policy'], contains: ['Eligible'] } },
    { id: 'review-case', title: 'Applicant without consent', inputs: { ...inputs, consent: false }, expected: { outcomeId: 'review', kind: 'answer', documentIds: ['policy'] } },
    { id: 'blocked-case', title: 'Disabled action', inputs, disabledTools: ['create-request'], expected: { outcomeId: 'submit', kind: 'handoff-blocked', documentIds: ['policy'] } },
    { id: 'ungrounded-case', title: 'Disabled policy', inputs, disabledKnowledge: ['policy'], expected: { outcomeId: 'submit', kind: 'missing-knowledge', documentIds: [] } },
  ],
}
const recipe: CompiledRecipe = {
  schemaVersion: 1, revision: 1, id: 'schema-fixture', status: 'published',
  title: 'Schema fixture', summary: 'A self-contained fixture.', industry: 'Testing', difficulty: 'beginner',
  estimatedMinutes: 1, accentIcon: 'citizen', learningGoals: ['Validate a lab.'], sourceUrl: 'https://example.com/fixture',
  agent: { name: 'Fixture agent', description: '', instructions: '', tone: 'friendly', detail: 'concise' },
  editable: ['name', 'tone'],
  connections: [
    { id: 'knowledge', type: 'sharepoint', title: 'Knowledge', description: 'Policy source.', accountLabel: 'Demo', resources: [{ id: 'library', label: 'Library', description: 'Policy library.' }], realWorldNote: 'Simulated.' },
    { id: 'service', type: 'service-desk', title: 'Service', description: 'Request destination.', accountLabel: 'Demo', resources: [{ id: 'queue', label: 'Queue', description: 'Request queue.' }], realWorldNote: 'Simulated.' },
  ],
  knowledge: [{ id: 'policy', title: 'Policy', summary: 'Eligibility policy.', connectionId: 'knowledge', resourceId: 'library', file: 'policy.txt', content: 'Adults who consent may submit a request.' }],
  facts: [],
  tools: [{ id: 'create-request', type: 'create-case', title: 'Create request', description: 'Create a request.', connectionId: 'service', resourceId: 'queue', realWorldNote: 'Simulated.', requiredKnowledge: ['policy'] }],
  journey: [{ id: 'start', title: 'Start', description: 'Edit the name.', tab: 'overview', completeWhen: { type: 'profile-edited' } }],
  test: { suggestedQuestions: ['What is the policy?'], handoffKeywords: [], unknownAnswer: 'Unknown.', missingKnowledgeAnswer: 'Missing.', handoffBlockedAnswer: 'Blocked.', handoffReadyAnswer: 'Ready.' },
  implementation: [{ title: 'Implement', description: 'Use a real service.' }], lab,
}

function session(): Session {
  return {
    version: 1, recipeId: recipe.id, recipeRevision: recipe.revision, profile: { ...recipe.agent }, agentIcon: recipe.accentIcon,
    connections: {}, enabledKnowledge: [], enabledTools: [], messages: [], activity: [], cases: [],
    labInputs: { ...inputs },
    learningEvidence: { testedCases: [], citations: [], actions: [] },
  }
}

function response(): TestResponse {
  return {
    kind: 'handoff-ready', text: 'Eligible at age 20.', toolId: 'create-request',
    citations: [{ documentId: 'policy', title: 'Policy', excerpt: 'Adults who consent may submit a request.' }],
    trace: ['Checked age and consent.'], draft: { title: 'Request', body: 'Review and confirm.' },
    lab: {
      outcomeId: 'submit', ruleId: 'eligible', inputs: { ...inputs }, fingerprint: 'old-configuration',
      checks: [
        { id: 'adult', label: 'Adult', passed: true, actual: 20, expected: 18 },
        { id: 'consented', label: 'Consented', passed: true, actual: true, expected: true },
      ],
      recommendations: ['Next step: review standard.'],
    },
  }
}

function saved(): Session {
  const state = session()
  state.messages = [{ id: 'reply', role: 'assistant', text: 'Eligible.', response: response() }]
  state.cases = [{ id: 'case-1', toolId: 'create-request', resourceId: 'queue', outcomeId: 'submit', summary: 'Submitted.', at: '2026-11-16T00:00:00.000Z' }]
  state.learningEvidence = {
    testedCases: [{ id: 'eligible-case', fingerprint: 'old-configuration' }],
    citations: [{ documentId: 'policy', fingerprint: 'old-configuration' }],
    actions: [{ toolId: 'create-request', outcomeId: 'submit', fingerprint: 'old-configuration' }],
  }
  return state
}

test('lab definitions are strict, exportable, and support legacy recipes without a lab', () => {
  assert.ok(labDefinitionSchema.safeParse(lab).success)
  assert.ok(compiledRecipeSchema.safeParse(recipe).success)
  assert.equal(z.toJSONSchema(labDefinitionSchema).type, 'object')
  assert.equal(z.toJSONSchema(recipeSchema).type, 'object')
  const legacy = structuredClone(recipe)
  delete legacy.lab
  assert.ok(compiledRecipeSchema.safeParse(legacy).success)
  assert.equal(labDefinitionSchema.safeParse({ ...lab, code: 'execute()' }).success, false)
  assert.deepEqual(labReferenceIssues(recipe), [])
})

test('full input maps reject missing, extra, wrongly typed, oversized, and out-of-bounds values', () => {
  assert.ok(labInputsValid(lab, inputs))
  assert.ok(labInputsValid(lab, { ...inputs, age: null }))
  const invalid: LabInputs[] = [
    { ...inputs, age: -1 }, { ...inputs, age: 121 }, { ...inputs, age: Infinity },
    { ...inputs, age: '20' }, { ...inputs, consent: null }, { ...inputs, consent: 'true' },
    { ...inputs, category: 'unknown' }, { ...inputs, notes: 'x'.repeat(801) }, { ...inputs, extra: true },
    { consent: true, category: 'standard', notes: '' },
  ]
  for (const candidate of invalid) {
    assert.equal(labInputsValid(lab, candidate), false)
    const invalidLab = structuredClone(lab)
    invalidLab.cases[0].inputs = candidate
    assert.equal(labDefinitionSchema.safeParse(invalidLab).success, false)
  }
})

test('optional source gates refer to known, cited documents and cannot gate the final fallback', () => {
  const withGate = structuredClone(recipe)
  withGate.lab!.rules[0].requiresKnowledge = ['policy']
  assert.ok(compiledRecipeSchema.safeParse(withGate).success)
  for (const sources of [[], ['missing'], ['policy','policy']]) {
    const invalid = structuredClone(withGate)
    invalid.lab!.rules[0].requiresKnowledge = sources
    assert.equal(compiledRecipeSchema.safeParse(invalid).success, false)
  }
  const uncited = structuredClone(withGate)
  uncited.knowledge.push({...uncited.knowledge[0], id:'other-policy'})
  uncited.lab!.rules[0].requiresKnowledge = ['other-policy']
  assert.equal(compiledRecipeSchema.safeParse(uncited).success, false)
  withGate.lab!.rules.at(-1)!.requiresKnowledge = ['policy']
  assert.equal(compiledRecipeSchema.safeParse(withGate).success, false)
})

test('defaults, field metadata, and all comparison variants are validated', () => {
  const mutations: ((value: LabDefinition) => void)[] = [
    value => { value.fields[0].defaultValue = -1 },
    value => { value.fields[1].defaultValue = null },
    value => { value.fields[2].defaultValue = 'unknown' },
    value => { delete value.fields[2].options },
    value => { value.fields[0].min = 121 },
    value => { value.fields[1].min = 0 },
    value => { value.fields[0].options = [{ value: 'x', label: 'X' }] },
    value => { value.fields[2].options!.push({ value: 'standard', label: 'Duplicate' }) },
    value => { value.fields[3].id = 'checks' },
    value => { value.checks[0].otherField = 'consent' },
    value => { value.checks[0].field = 'missing' },
    value => { value.checks[0].otherField = 'missing'; delete value.checks[0].value },
    value => { value.checks[0].otherField = 'consent'; delete value.checks[0].value },
    value => { value.checks[0].operator = 'present' },
    value => { value.checks[0].value = null },
    value => { delete value.checks[0].value },
    value => { value.checks[1].operator = 'gt' },
    value => { value.checks[1].value = 'true' },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(lab)
    mutate(candidate)
    assert.equal(labDefinitionSchema.safeParse(candidate).success, false)
  }
  const comparisons = structuredClone(lab)
  comparisons.checks = [
    ...comparisons.checks,
    { id: 'present', label: 'Present', field: 'notes', operator: 'present' },
    { id: 'same-field', label: 'Same field', field: 'age', operator: 'eq', otherField: 'age' },
    { id: 'unset', label: 'Unset', field: 'age', operator: 'eq', value: null },
  ]
  assert.ok(labDefinitionSchema.safeParse(comparisons).success)
})

test('rules require known checks and outcomes and a final unconditional fallback', () => {
  const mutations: ((value: LabDefinition) => void)[] = [
    value => { value.rules[0].all[0].checkId = 'unknown' },
    value => { value.rules[0].all.push(value.rules[0].all[0]) },
    value => { value.rules[0].any = [{ checkId: 'unknown', equals: false }] },
    value => { value.rules[0].outcomeId = 'unknown' },
    value => { value.rules[0].all = [] },
    value => { value.rules[1].all = [{ checkId: 'adult', equals: false }] },
    value => { value.rules[1].any = [{ checkId: 'adult', equals: false }] },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(lab)
    mutate(candidate)
    assert.equal(labDefinitionSchema.safeParse(candidate).success, false)
  }
  const anyRule = structuredClone(lab)
  anyRule.rules[0].all = []
  anyRule.rules[0].any = [{ checkId: 'adult', equals: true }]
  assert.ok(labDefinitionSchema.safeParse(anyRule).success)
})

test('duplicate identifiers are rejected in every lab namespace', () => {
  for (const namespace of ['fields', 'checks', 'rules', 'outcomes', 'cases'] as const) {
    const candidate = structuredClone(lab)
    candidate[namespace][1].id = candidate[namespace][0].id
    const parsed = labDefinitionSchema.safeParse(candidate)
    assert.equal(parsed.success, false)
    if (!parsed.success) assert.match(parsed.error.message, /Duplicate identifier/)
  }
})

test('templates reject unknown and malformed references and oversized authoring text', () => {
  for (const text of ['{{unknown}}', '{{age', '{{age}} }}', '{{ age }}', 'x'.repeat(3001)]) {
    const candidate = structuredClone(lab)
    candidate.outcomes[0].draft!.body = text
    assert.equal(labDefinitionSchema.safeParse(candidate).success, false)
  }
  const candidate = structuredClone(lab)
  candidate.outcomes[0].recommendations![0].when!.checkId = 'unknown'
  assert.equal(labDefinitionSchema.safeParse(candidate).success, false)
})

test('grounding, fixture overrides, and action expectations validate document and tool references', () => {
  const mutations: ((value: CompiledRecipe) => void)[] = [
    value => { value.lab!.outcomes[0].documentIds = [] },
    value => { value.lab!.outcomes[0].documentIds = ['missing'] },
    value => { value.lab!.outcomes[0].documentIds.push('policy') },
    value => { value.lab!.outcomes[0].toolId = 'missing' },
    value => { delete value.tools[0].requiredKnowledge },
    value => { value.lab!.cases[0].expected.outcomeId = 'missing' },
    value => { value.lab!.cases[0].expected.toolId = 'missing' },
    value => { delete value.lab!.cases[0].expected.toolId },
    value => { value.lab!.cases[0].expected.documentIds = ['missing'] },
    value => { value.lab!.cases[0].disabledTools = ['missing'] },
    value => { value.lab!.cases[0].disabledKnowledge = ['missing'] },
    value => { value.lab!.cases[1].expected.toolId = 'create-request' },
    value => { value.lab!.cases[2].expected.toolId = 'create-request' },
    value => { value.lab!.cases[3].expected.toolId = 'create-request' },
    value => { value.lab!.cases[0].expected.kind = 'answer'; delete value.lab!.cases[0].expected.toolId },
  ]
  for (const mutate of mutations) {
    const candidate = structuredClone(recipe)
    mutate(candidate)
    assert.equal(compiledRecipeSchema.safeParse(candidate).success, false)
  }
})

test('new guide references and twenty-four-minute compiled journeys validate', () => {
  const candidate = structuredClone(recipe)
  candidate.journey = [
    { ...candidate.journey[0], id: 'test', completeWhen: { type: 'case-tested', caseId: 'eligible-case' } },
    { ...candidate.journey[0], id: 'cite', completeWhen: { type: 'citation-opened', documentId: 'policy' } },
    { ...candidate.journey[0], id: 'act', completeWhen: { type: 'action-confirmed', toolId: 'create-request', outcomeId: 'submit' } },
    { ...candidate.journey[0], id: 'evaluate', completeWhen: { type: 'evaluation-passed' } },
  ]
  candidate.estimatedMinutes = candidate.journey.length
  assert.ok(compiledRecipeSchema.safeParse(candidate).success)
  for (const completeWhen of [
    { type: 'case-tested' as const, caseId: 'missing' },
    { type: 'citation-opened' as const, documentId: 'missing' },
    { type: 'action-confirmed' as const, toolId: 'create-request', outcomeId: 'review' },
    { type: 'action-confirmed' as const, toolId: 'missing', outcomeId: 'submit' },
  ]) {
    const invalid = structuredClone(candidate)
    invalid.journey[0].completeWhen = completeWhen
    assert.equal(compiledRecipeSchema.safeParse(invalid).success, false)
    delete invalid.lab
    assert.ok(compiledRecipeSchema.safeParse(invalid).success)
  }
  candidate.journey = Array.from({ length: 24 }, (_, index) => ({ ...recipe.journey[0], id: `step-${index}` }))
  candidate.estimatedMinutes = 24
  assert.ok(compiledRecipeSchema.safeParse(candidate).success)
  candidate.estimatedMinutes = 23
  assert.equal(compiledRecipeSchema.safeParse(candidate).success, false)
})

test('lab collection limits are enforced', () => {
  for (const [namespace, maximum] of [['fields', 20], ['checks', 40], ['rules', 30], ['outcomes', 20], ['cases', 30]] as const) {
    const candidate = structuredClone(lab)
    Object.assign(candidate, { [namespace]: Array.from({ length: maximum + 1 }, (_, index) => ({ ...candidate[namespace][0], id: `item-${index}` })) })
    assert.equal(labDefinitionSchema.safeParse(candidate).success, false)
  }
  assert.equal(labDefinitionSchema.safeParse({ ...lab, cases: [] }).success, false)
})

test('saved lab snapshots and learning evidence roundtrip independently of the current configuration', () => {
  const state = saved()
  state.labInputs!.age = 10
  assert.deepEqual(decodeSession(recipe, JSON.stringify(state)), { session: state, warning: null })
  delete state.labInputs
  delete state.learningEvidence
  assert.deepEqual(decodeSession(recipe, JSON.stringify(state)), { session: state, warning: null })
})

test('invalid saved inputs and lab, action, or learning references explicitly reset', () => {
  const mutations: ((state: Session) => void)[] = [
    state => { state.labInputs!.age = -1 },
    state => { delete state.labInputs!.age },
    state => { state.labInputs!.unknown = true },
    state => { state.messages[0].response!.lab!.inputs.consent = null },
    state => { state.messages[0].response!.lab!.outcomeId = 'missing' },
    state => { state.messages[0].response!.lab!.ruleId = 'fallback' },
    state => { state.messages[0].response!.lab!.checks[0].id = 'missing' },
    state => { state.messages[0].response!.lab!.checks.pop() },
    state => { state.messages[0].response!.kind = 'answer' },
    state => { state.cases[0].outcomeId = 'review' },
    state => { state.learningEvidence!.testedCases[0].id = 'missing' },
    state => { state.learningEvidence!.citations[0].documentId = 'missing' },
    state => { state.learningEvidence!.actions[0].toolId = 'missing' },
    state => { state.learningEvidence!.actions[0].outcomeId = 'review' },
  ]
  for (const mutate of mutations) {
    const state = saved()
    mutate(state)
    assert.ok(decodeSession(recipe, JSON.stringify(state)).warning)
  }
})

test('orphan lab state is rejected while old lab-free sessions keep working', () => {
  const legacy = structuredClone(recipe)
  delete legacy.lab
  const clean = session()
  delete clean.labInputs
  delete clean.learningEvidence
  assert.equal(decodeSession(legacy, JSON.stringify(clean)).warning, null)
  for (const extra of [
    { labInputs: inputs },
    { learningEvidence: { testedCases: [], citations: [], actions: [] } },
    { messages: saved().messages },
    { cases: saved().cases },
    { messages: [{ id: 'draft', role: 'assistant', text: 'Draft.', response: { kind: 'answer', text: 'Draft.', trace: [], citations: [], draft: { title: 'Title', body: 'Body' } } }] },
  ]) assert.ok(decodeSession(legacy, JSON.stringify({ ...clean, ...extra })).warning)
})

test('ordinary ready handoffs retain bounded drafts only with a valid tool', () => {
  const legacy = structuredClone(recipe)
  delete legacy.lab
  const state = session()
  delete state.labInputs
  delete state.learningEvidence
  const handoff = response()
  delete handoff.lab
  state.messages = [{ id: 'handoff', role: 'assistant', text: handoff.text, response: handoff }]
  assert.deepEqual(decodeSession(legacy, JSON.stringify(state)), { session: state, warning: null })
  for (const mutate of [
    (value: TestResponse) => { delete value.toolId },
    (value: TestResponse) => { value.toolId = 'unknown' },
    (value: TestResponse) => { value.kind = 'handoff-blocked' },
    (value: TestResponse) => { value.kind = 'answer' },
    (value: TestResponse) => { value.draft!.body = 'x'.repeat(6001) },
  ]) {
    const invalid = structuredClone(state)
    mutate(invalid.messages[0].response!)
    assert.ok(decodeSession(legacy, JSON.stringify(invalid)).warning)
  }
})

test('blocked lab handoffs omit the executable tool and preserve declared previews', () => {
  const state = saved()
  const blocked = state.messages[0].response!
  blocked.kind = 'handoff-blocked'
  delete blocked.toolId
  assert.deepEqual(decodeSession(recipe, JSON.stringify(state)), { session: state, warning: null })
  blocked.toolId = 'create-request'
  assert.ok(decodeSession(recipe, JSON.stringify(state)).warning)
  delete blocked.toolId
  blocked.kind = 'missing-knowledge'
  blocked.citations = []
  assert.ok(decodeSession(recipe, JSON.stringify(state)).warning)
  delete blocked.draft
  assert.equal(decodeSession(recipe, JSON.stringify(state)).warning, null)
})

test('non-action outcomes may declare reviewable drafts, but undeclared drafts are rejected', () => {
  const previewRecipe = structuredClone(recipe)
  previewRecipe.lab!.outcomes[1].draft = { title: 'Learning plan', body: 'Review requirements for {{category}}.' }
  assert.ok(compiledRecipeSchema.safeParse(previewRecipe).success)
  const state = saved()
  const preview = state.messages[0].response!
  preview.kind = 'answer'
  delete preview.toolId
  preview.lab!.outcomeId = 'review'
  preview.lab!.ruleId = 'fallback'
  assert.deepEqual(decodeSession(previewRecipe, JSON.stringify(state)), { session: state, warning: null })
  assert.ok(decodeSession(recipe, JSON.stringify(state)).warning)
  preview.kind = 'handoff-blocked'
  assert.ok(decodeSession(previewRecipe, JSON.stringify(state)).warning)
})

test('evaluations use ordered lab case IDs and titles and accept stale assertion results', () => {
  const state = saved()
  state.evaluation = {
    name: 'Cases', createdAt: '2026-11-16T00:00:00.000Z',
    lastRun: {
      ranAt: '2026-11-16T00:00:00.000Z', fingerprint: 'stale',
      rows: lab.cases.map(item => ({
        question: item.title, caseId: item.id, response: response(),
        assertions: [{ label: 'Outcome', passed: false, expected: item.expected.outcomeId, actual: 'submit' }],
      })),
    },
  }
  assert.equal(decodeSession(recipe, JSON.stringify(state)).warning, null)
  for (const mutate of [
    (value: Session) => { value.evaluation!.lastRun!.rows.reverse() },
    (value: Session) => { value.evaluation!.lastRun!.rows[0].caseId = 'missing' },
    (value: Session) => { value.evaluation!.lastRun!.rows[0].question = 'Different title' },
    (value: Session) => { value.evaluation!.lastRun!.rows[0].assertions![0].label = ' ' },
    (value: Session) => { value.evaluation!.lastRun!.rows[0].assertions = [] },
  ]) {
    const invalid = structuredClone(state)
    mutate(invalid)
    assert.ok(decodeSession(recipe, JSON.stringify(invalid)).warning)
  }
})

test('runtime draft, trace, response, and case-summary limits preserve valid large saves', () => {
  const state = saved()
  const reply = state.messages[0].response!
  reply.text = 'r'.repeat(15_000)
  state.messages[0].text = reply.text
  reply.draft = { title: 'Title', body: 'd'.repeat(6000) }
  reply.trace = Array.from({ length: 80 }, () => 't'.repeat(2000))
  state.cases[0].summary = reply.draft.body
  let persisted = ''
  assert.equal(saveSession(recipe, state, { setItem: (_key, value) => { persisted = value } }), null)
  assert.deepEqual(decodeSession(recipe, persisted), { session: state, warning: null })
  for (const mutate of [
    (value: Session) => { value.messages[0].response!.draft!.body += 'x' },
    (value: Session) => { value.messages[0].response!.trace.push('Extra') },
    (value: Session) => { value.messages[0].response!.text += 'x' },
    (value: Session) => { value.cases[0].summary += 'x' },
    (value: Session) => { value.messages.push({ id: 'user', role: 'user', text: 'u'.repeat(2001) }) },
    (value: Session) => { value.learningEvidence!.testedCases = Array.from({ length: 201 }, () => ({ id: 'eligible-case', fingerprint: 'old' })) },
  ]) {
    const invalid = structuredClone(state)
    mutate(invalid)
    assert.ok(decodeSession(recipe, JSON.stringify(invalid)).warning)
    assert.ok(saveSession(recipe, invalid, { setItem: () => { assert.fail('Invalid save must not overwrite progress') } }))
  }
})
