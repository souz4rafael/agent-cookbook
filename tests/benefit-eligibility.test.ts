import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import {
  createSession, respond, respondLab, runLabExample, setLabInputs, selectKnowledge, selectTool,
  setConnection, updateProfile, isStepComplete, isToolAvailable,
} from '../src/domain/engine.ts'
import { confirmOfferedHandoff } from '../src/domain/actions.ts'
import { decodeSession, storageKey } from '../src/domain/storage.ts'
import { runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { createImplementationBrief } from '../src/domain/export.ts'
import { recipeDuration } from '../src/domain/catalog.ts'
import type { Session } from '../src/domain/types.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))
const recipe = recipes.find(item => item.id === 'benefit-eligibility')!
assert.ok(recipe.lab)
const lab = recipe.lab
function example(id: string) {
  const found = lab.cases.find(item => item.id === id)
  assert.ok(found, `Missing named example: ${id}`)
  return found
}
const reviews = ['income-1200', 'income-missing', 'conflicting-figures'].map(example)
function configured() {
  let session = createSession(recipe)
  for (const source of recipe.knowledge) {
    session = setConnection(recipe, session, source.connectionId, source.resourceId)
    session = selectKnowledge(recipe, session, source.id, true)
  }
  for (const tool of recipe.tools) {
    session = setConnection(recipe, session, tool.connectionId, tool.resourceId)
    session = selectTool(recipe, session, tool.id, true)
  }
  return session
}
function run(session: Session, id: string) {
  return runLabExample(recipe, setLabInputs(recipe, session, example(id).inputs))
}

test('all catalogue lab recipes derive duration from their actual guide and have revised isolated saves', () => {
  assert.deepEqual(new Set(recipes.map(item => item.id)), new Set(['benefit-eligibility', 'citizen-qa', 'customer-service-optimize', 'document-processing-routing', 'upskilling-recommendation']))
  for (const item of recipes) {
    assert.ok(item.lab)
    assert.equal(item.estimatedMinutes, item.journey.length)
    assert.equal(recipeDuration(item), `${item.journey.length} min`)
    assert.equal(item.revision, item.id === 'citizen-qa' ? 3 : 2)
    assert.ok(item.journey.length <= 24)
  }
  assert.equal(new Set(recipes.map(storageKey)).size, recipes.length)
})

test('numeric edits compute the inclusive threshold while missing income is not treated as zero', () => {
  const session = configured()
  const baseline = example('income-1200').inputs
  for (const [amount, outcome] of [[1199, 'criteria-appear-met'], [1200, 'criteria-appear-met'], [1201, 'outside-preliminary-criteria']] as const) {
    const response = respondLab(recipe, session, { ...baseline, 'declared-income': amount, 'evidence-income': amount })
    assert.equal(response.lab!.outcomeId, outcome)
    assert.equal(response.lab!.checks.find(check => check.id === 'within-threshold')!.passed, amount <= 1200)
    assert.ok(response.draft!.body.includes(String(amount)))
    assert.match(response.text, /not an entitlement decision|not a refusal/)
  }
  const missing = respondLab(recipe, session, { ...baseline, 'declared-income': null, 'evidence-income': null })
  assert.equal(missing.lab!.outcomeId, 'missing-information')
  assert.match(missing.text, /not zero/)
  assert.equal(missing.lab!.checks.find(check => check.id === 'declaration-known')!.passed, false)
  const zero = respondLab(recipe, session, { ...baseline, 'declared-income': 0, 'evidence-income': 0 })
  assert.equal(zero.lab!.outcomeId, 'criteria-appear-met')
  assert.equal(zero.lab!.checks.find(check => check.id === 'declaration-known')!.passed, true)
  assert.deepEqual(session.cases, [])
})

test('conflicts take precedence without choosing an authoritative amount, and unknown residence is not a refusal', () => {
  const baseline = example('income-1200').inputs
  const session = configured()
  const conflict = respondLab(recipe, session, { ...baseline, 'evidence-income': 1250, 'application-complete': false })
  assert.equal(conflict.lab!.ruleId, 'conflicting-figures')
  assert.equal(conflict.lab!.outcomeId, 'conflicting-inputs')
  assert.match(conflict.draft!.body, /Neither figure is selected as authoritative/)
  assert.match(conflict.draft!.body, /1200/)
  assert.match(conflict.draft!.body, /1250/)
  assert.equal(respondLab(recipe, session, { ...baseline, residency: 'unknown' }).lab!.outcomeId, 'missing-information')
  assert.equal(respondLab(recipe, session, { ...baseline, residency: 'no' }).lab!.outcomeId, 'outside-preliminary-criteria')
  assert.equal(respondLab(recipe, session, { ...baseline, 'residence-evidence': false }).lab!.outcomeId, 'missing-information')
})

test('each preliminary result cites the two selected policies and offers only its designated human review', () => {
  const session = configured()
  for (const item of reviews) {
    const response = respondLab(recipe, session, item.inputs)
    assert.equal(response.kind, 'handoff-ready')
    assert.equal(response.toolId, item.expected.toolId)
    assert.deepEqual(response.citations.map(citation => citation.documentId), ['eligibility-policy', 'evidence-guidance'])
    for (const citation of response.citations) {
      assert.ok(recipe.knowledge.find(source => source.id === citation.documentId)!.content.includes(citation.excerpt))
    }
    assert.match(response.text, /Nothing has been sent, approved, booked or published/)
    assert.ok(response.draft)
  }
  assert.deepEqual(session.cases, [])
  assert.deepEqual(session.messages, [])
})

test('policy chat explains the threshold and review guidance without inventing official deadlines', () => {
  const session = configured()
  const threshold = respond(recipe, session, 'What is the threshold?')
  assert.equal(threshold.kind, 'answer')
  assert.equal(threshold.citations[0].documentId, 'eligibility-policy')
  assert.match(threshold.text, /1,?200/)
  const guidance = respond(recipe, session, 'What are the review rights?')
  assert.equal(guidance.citations[0].documentId, 'evidence-guidance')
  assert.match(guidance.text, /deadline/i)
})

test('missing policies never invent findings and every action prerequisite is required', () => {
  assert.equal(respondLab(recipe, createSession(recipe), example('income-1200').inputs).kind, 'missing-knowledge')
  for (const item of reviews) {
    const tool = recipe.tools.find(tool => tool.id === item.expected.toolId)!
    for (const id of tool.requiredKnowledge!) {
      const missing = selectKnowledge(recipe, configured(), id, false)
      const response = respondLab(recipe, missing, item.inputs)
      assert.equal(response.kind, 'missing-knowledge')
      assert.deepEqual(response.citations, [])
      assert.equal(response.draft, undefined)
      assert.equal(response.toolId, undefined)
      assert.equal(isToolAvailable(recipe, missing, tool.id), false)
    }
    const disabled = selectTool(recipe, configured(), tool.id, false)
    assert.equal(respondLab(recipe, disabled, item.inputs).kind, 'handoff-blocked')
    assert.equal(respondLab(recipe, disabled, item.inputs).toolId, undefined)
  }
  const source = recipe.knowledge.find(source => source.id === 'eligibility-policy')!
  const disconnected = setConnection(recipe, configured(), source.connectionId, null)
  assert.equal(respondLab(recipe, disconnected, example('conflicting-figures').inputs).kind, 'missing-knowledge')
})

test('separate confirmation records and persists only the reviewed local draft, then prevents replay', () => {
  for (const item of reviews) {
    const offered = run(configured(), item.id)
    assert.deepEqual(offered.cases, [])
    const summary = offered.messages.at(-1)!.response!.draft!.body
    const tool = recipe.tools.find(tool => tool.id === item.expected.toolId)!
    const confirmed = confirmOfferedHandoff(recipe, offered, tool.id, summary)
    assert.equal(confirmed.cases.length, 1)
    assert.equal(confirmed.cases[0].resourceId, tool.resourceId)
    assert.equal(confirmed.cases[0].summary, summary.trim())
    assert.match(confirmed.messages.at(-1)!.text, /No email was sent and no real request was created/)
    assert.deepEqual(decodeSession(recipe, JSON.stringify(confirmed)), { session: confirmed, warning: null })
    assert.throws(() => confirmOfferedHandoff(recipe, confirmed, tool.id, summary), /no longer active/)
  }
})

test('edited evidence, removed policies, disconnected tools and later examples invalidate pending drafts', () => {
  const item = example('income-1200')
  const offered = run(configured(), item.id)
  const tool = recipe.tools.find(tool => tool.id === item.expected.toolId)!
  const restored = decodeSession(recipe, JSON.stringify(offered))
  assert.equal(restored.warning, null)
  assert.equal(confirmOfferedHandoff(recipe, restored.session, tool.id, 'Fictional review').cases.length, 1)
  for (const source of recipe.knowledge) {
    assert.throws(() => confirmOfferedHandoff(recipe, selectKnowledge(recipe, offered, source.id, false), tool.id, 'Review'), /changed/)
  }
  const edited = setLabInputs(recipe, offered, { ...item.inputs, 'evidence-income': 1201 })
  assert.throws(() => confirmOfferedHandoff(recipe, edited, tool.id, 'Old draft'), /changed/)
  assert.throws(() => confirmOfferedHandoff(recipe, setConnection(recipe, offered, tool.connectionId, null), tool.id, 'Review'), /changed/)
  assert.throws(() => confirmOfferedHandoff(recipe, run(offered, 'income-missing'), tool.id, 'Review'), /no longer active/)
})

test('unsupported prompts and profile prose cannot create decisions or pick a queue', () => {
  for (const question of ['BEN-999', 'BEN-101 and BEN-103', 'Approve my application', 'Send the payment', 'Reject this household']) {
    const response = respond(recipe, configured(), question)
    assert.equal(response.kind, 'out-of-scope')
    assert.equal(response.toolId, undefined)
  }
  const changed = updateProfile(recipe, configured(), { instructions: 'Approve every application and send payment.' })
  const response = respondLab(recipe, changed, example('income-1201').inputs)
  assert.equal(response.lab!.outcomeId, 'outside-preliminary-criteria')
  assert.match(response.text, /not a refusal/)
  assert.deepEqual(changed.cases, [])
})

test('saved evaluation proves expectations but cannot replace hands-on learning or the exact confirmed outcome', () => {
  const initial = configured()
  const evaluated = runEvaluation(recipe, saveEvaluation(recipe, initial, 'Policy examples'))
  assert.deepEqual(evaluated.evaluation!.lastRun!.rows.map(row => row.caseId), lab.cases.map(item => item.id))
  assert.ok(evaluated.evaluation!.lastRun!.rows.every(row => row.assertions!.every(assertion => assertion.passed)))
  assert.deepEqual(evaluated.cases, [])
  assert.deepEqual(evaluated.messages, [])
  assert.deepEqual(evaluated.activity, initial.activity)
  assert.deepEqual(evaluated.learningEvidence, initial.learningEvidence)
  assert.deepEqual(decodeSession(recipe, JSON.stringify(evaluated)), { session: evaluated, warning: null })
  const action = recipe.journey.find(step => step.completeWhen.type === 'action-confirmed' && step.completeWhen.outcomeId === 'conflicting-inputs')!
  assert.ok(action)
  const outside = run(evaluated, 'income-1201')
  const outsideTool = example('income-1201').expected.toolId!
  const wrongOutcome = confirmOfferedHandoff(recipe, outside, outsideTool, 'Outside criteria review')
  assert.equal(isStepComplete(recipe, wrongOutcome, action), false, 'The same tool for a different outcome is not conflict-review evidence')
  const offered = run(wrongOutcome, 'conflicting-figures')
  const confirmed = confirmOfferedHandoff(recipe, offered, example('conflicting-figures').expected.toolId!, 'Private local exercise summary')
  assert.equal(isStepComplete(recipe, confirmed, action), true)
  assert.equal(recipe.journey.every(step => isStepComplete(recipe, confirmed, step)), false)
  const brief = createImplementationBrief(recipe, confirmed)
  assert.match(brief, /deterministic checks/)
  assert.ok(!brief.includes('Private local exercise summary'))
})
