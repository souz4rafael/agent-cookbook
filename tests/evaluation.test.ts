import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyRecipe as recipe } from './legacy-fixture.ts'
import {
  createSession, getConfigurationFingerprint, isStepComplete, selectKnowledge, selectTool,
  setAgentIcon, setConnection, toggleMessageReaction, updateProfile,
} from '../src/domain/engine.ts'
import { runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { decodeSession } from '../src/domain/storage.ts'

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

test('saving creates one bounded named evaluation without changing the recipe or exercise', () => {
  const before = configured()
  const saved = saveEvaluation(recipe, before, '  Citizen checks  ')
  assert.equal(saved.evaluation?.name, 'Citizen checks')
  assert.equal(saved.evaluation?.lastRun, undefined)
  assert.ok(Number.isFinite(Date.parse(saved.evaluation!.createdAt)))
  assert.equal(before.evaluation, undefined)
  assert.equal(saved.profile, before.profile)
  assert.equal(saved.messages, before.messages)
  assert.equal(saved.activity, before.activity)
  assert.equal(saved.cases, before.cases)
  assert.equal(saveEvaluation(recipe, saved, 'Citizen checks'), saved)
  for (const name of ['', ' ', 'x'.repeat(101)]) assert.throws(() => saveEvaluation(recipe, before, name), /1 to 100/)
  assert.throws(() => runEvaluation(recipe, before), /Create an evaluation/)
  assert.throws(() => saveEvaluation({ ...recipe, revision: recipe.revision + 1 }, before, 'Checks'), /does not match/)
})

test('running uses precisely the five existing questions in order and never executes a tool', () => {
  assert.deepEqual(recipe.test.suggestedQuestions, [
    'What documents do I need for the Community Card?',
    'How long does the assessment take?',
    'How do I appeal a decision?',
    'I would like human support.',
    'What is the weather forecast for tomorrow?',
  ])
  const before = saveEvaluation(recipe, configured(), 'Five recipe tests')
  const result = runEvaluation(recipe, before)
  const run = result.evaluation!.lastRun!
  assert.equal(run.rows.length, 5)
  assert.deepEqual(run.rows.map(row => row.question), recipe.test.suggestedQuestions)
  assert.deepEqual(run.rows.map(row => row.response.kind), ['answer', 'answer', 'answer', 'handoff-ready', 'out-of-scope'])
  assert.deepEqual(run.rows.slice(0, 3).map(row => row.response.citations.length), [1, 1, 1])
  assert.equal(run.fingerprint, getConfigurationFingerprint(before))
  assert.equal(result.messages, before.messages)
  assert.equal(result.activity, before.activity)
  assert.equal(result.cases, before.cases)
  assert.deepEqual(recipe.journey.map(step => isStepComplete(recipe, result, step)), recipe.journey.map(step => isStepComplete(recipe, before, step)))
  assert.equal(before.evaluation!.lastRun, undefined)
})

test('configuration changes mark the snapshot stale and reruns use current tone and source availability', () => {
  const first = runEvaluation(recipe, saveEvaluation(recipe, configured(), 'Recipe evaluation'))
  const previous = first.evaluation!.lastRun!
  let changed = selectKnowledge(recipe, first, recipe.knowledge[0].id, false)
  changed = updateProfile(recipe, changed, { tone: 'formal' })
  assert.notEqual(getConfigurationFingerprint(changed), previous.fingerprint)
  assert.equal(changed.evaluation!.lastRun, previous)
  assert.equal(decodeSession(recipe, JSON.stringify(changed)).warning, null)
  const rerun = runEvaluation(recipe, changed)
  assert.equal(rerun.evaluation!.lastRun!.rows[0].response.kind, 'missing-knowledge')
  assert.match(rerun.evaluation!.lastRun!.rows[1].response.text, /Dear resident/)
  assert.equal(previous.rows[0].response.kind, 'answer')
  assert.equal(rerun.evaluation!.lastRun!.fingerprint, getConfigurationFingerprint(changed))
})

test('unconfigured checks report missing knowledge and blocked handoff, not invented success scores', () => {
  const result = runEvaluation(recipe, saveEvaluation(recipe, createSession(recipe), 'No sources yet'))
  assert.deepEqual(result.evaluation!.lastRun!.rows.map(row => row.response.kind), [
    'missing-knowledge', 'missing-knowledge', 'missing-knowledge', 'handoff-blocked', 'out-of-scope',
  ])
  assert.ok(result.evaluation!.lastRun!.rows.every(row => row.response.citations.length === 0))
  assert.deepEqual(result.cases, [])
  assert.deepEqual(result.activity, [])
})

test('cosmetic changes, evaluation renames, feedback and selection ordering do not stale a result', () => {
  let session = runEvaluation(recipe, saveEvaluation(recipe, configured(), 'Checks'))
  const fingerprint = getConfigurationFingerprint(session)
  session = saveEvaluation(recipe, setAgentIcon(recipe, session, 'bot'), 'Renamed checks')
  session = { ...session, messages: [{ id: 'answer', role: 'assistant', text: 'Example answer' }] }
  session = toggleMessageReaction(recipe, session, 'answer', 'like')
  session = {
    ...session,
    connections: Object.fromEntries(Object.entries(session.connections).reverse()),
    enabledKnowledge: [...session.enabledKnowledge].reverse(),
    enabledTools: [...session.enabledTools].reverse(),
  }
  assert.equal(getConfigurationFingerprint(session), fingerprint)
  assert.equal(session.evaluation!.lastRun!.fingerprint, fingerprint)
})

test('definition and results survive reload and legacy saves still load without resetting progress', () => {
  const session = runEvaluation(recipe, saveEvaluation(recipe, configured(), 'Saved evaluation'))
  assert.deepEqual(decodeSession(recipe, JSON.stringify(session)), { session, warning: null })
  const legacy = { ...session }
  delete legacy.evaluation
  assert.deepEqual(decodeSession(recipe, JSON.stringify(legacy)), { session: legacy, warning: null })
  assert.equal(createSession(recipe).evaluation, undefined)
})

test('saved evaluation cannot inject new questions, rows, methods or invalid historical references', () => {
  const original = runEvaluation(recipe, saveEvaluation(recipe, configured(), 'Checks'))
  for (const alter of [
    (value: typeof original) => { value.evaluation!.lastRun!.rows[0].question = 'An arbitrary new test' },
    (value: typeof original) => { value.evaluation!.lastRun!.rows.pop() },
    (value: typeof original) => { value.evaluation!.lastRun!.rows.reverse() },
    (value: typeof original) => { value.evaluation!.lastRun!.rows[0].response.citations[0].documentId = 'unknown-source' },
    (value: typeof original) => { value.evaluation!.lastRun!.rows[3].response.toolId = 'unknown-tool' },
  ]) {
    const invalid = structuredClone(original)
    alter(invalid)
    assert.ok(decodeSession(recipe, JSON.stringify(invalid)).warning)
  }
  assert.ok(decodeSession(recipe, JSON.stringify({ ...original, evaluation: { ...original.evaluation, method: 'external-ai' } })).warning)
})

test('failed runs do not mutate a previous successful snapshot', () => {
  const session = runEvaluation(recipe, saveEvaluation(recipe, configured(), 'Checks'))
  const snapshot = structuredClone(session)
  const invalidRecipe = { ...recipe, test: { ...recipe.test, suggestedQuestions: [''] } }
  assert.throws(() => runEvaluation(invalidRecipe, session), /cannot be blank/)
  assert.deepEqual(session, snapshot)
})
