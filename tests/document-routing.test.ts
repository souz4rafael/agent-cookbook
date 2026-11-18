import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import {
  createSession, respond, respondLab, runLabExample, setLabInputs, selectKnowledge, selectTool,
  setConnection, isToolAvailable, executeHandoff, isStepComplete, recordCitationOpen,
} from '../src/domain/engine.ts'
import { confirmOfferedHandoff } from '../src/domain/actions.ts'
import { decodeSession, storageKey } from '../src/domain/storage.ts'
import { recipeSchema } from '../src/domain/validation.ts'
import { runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { recipeDuration } from '../src/domain/catalog.ts'
import { createImplementationBrief } from '../src/domain/export.ts'
import { legacyRecipe } from './legacy-fixture.ts'
import type { CompiledRecipe, Session } from '../src/domain/types.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))
const recipe = recipes.find(item => item.id === 'document-processing-routing')!
assert.ok(recipe.lab)
const lab = recipe.lab
function example(id: string) {
  const found = lab.cases.find(item => item.id === id)
  assert.ok(found, `Missing named example: ${id}`)
  return found
}
const routes = ['complete-happy', 'permission-missing', 'permission-conflict'].map(example)

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

test('duration follows the actual guide and routing progress remains recipe-scoped', () => {
  assert.equal(recipeDuration(recipe), `${recipe.journey.length} min`)
  assert.equal(recipeDuration({ estimatedMinutes: 12 }), '12 min')
  assert.equal(recipe.revision, 2)
  assert.deepEqual(new Set(recipe.knowledge.map(source => source.id)), new Set(['intake-checklist', 'routing-guide']))
  assert.deepEqual(new Set(recipe.tools.map(tool => tool.id)), new Set(routes.map(item => item.expected.toolId)))
  assert.notEqual(storageKey(recipe), storageKey(recipes.find(item => item.id === 'citizen-qa')!))
})

test('editing actual presence and references recomputes routes rather than looking up a package ID', () => {
  const session = configured()
  const inputs = example('complete-happy').inputs
  const complete = respondLab(recipe, session, inputs)
  assert.equal(complete.lab!.ruleId, 'complete')
  assert.equal(complete.lab!.outcomeId, 'complete-package')
  const missing = respondLab(recipe, session, { ...inputs, 'permission-present': false })
  assert.equal(missing.lab!.outcomeId, 'missing-evidence')
  assert.equal(missing.toolId, example('permission-missing').expected.toolId)
  const conflict = respondLab(recipe, session, { ...inputs, 'permission-ref': 'ROOM-OTHER' })
  assert.equal(conflict.lab!.ruleId, 'permission-conflict')
  assert.equal(conflict.lab!.outcomeId, 'reference-conflict')
  assert.equal(conflict.toolId, example('permission-conflict').expected.toolId)
  assert.match(conflict.draft!.body, /ROOM-OTHER/)
  const absent = respondLab(recipe, session, { ...inputs, 'permission-present': false, 'permission-ref': 'ROOM-OTHER' })
  assert.equal(absent.lab!.outcomeId, 'missing-evidence', 'An absent document cannot establish a conflict')
  const mixed = respondLab(recipe, session, { ...inputs, 'permission-ref': 'ROOM-OTHER', 'plan-present': false })
  assert.equal(mixed.lab!.outcomeId, 'reference-conflict', 'Known conflicts take priority over other missing evidence')
  assert.equal(respondLab(recipe, session, { ...inputs, 'permission-ref': '' }).lab!.outcomeId, 'missing-evidence')
  assert.equal(respondLab(recipe, session, { ...inputs, package: 'NEW-FICTIONAL-PACKAGE' }).lab!.outcomeId, 'complete-package')
  assert.deepEqual(session.cases, [])
  assert.deepEqual(session.messages, [])
})

test('every destination cites selected policies, never a frozen package report', () => {
  for (const item of routes) {
    const response = respondLab(recipe, configured(), item.inputs)
    assert.equal(response.kind, 'handoff-ready')
    assert.equal(response.toolId, item.expected.toolId)
    assert.deepEqual(response.citations.map(citation => citation.documentId), ['intake-checklist', 'routing-guide'])
    for (const citation of response.citations) {
      assert.ok(recipe.knowledge.find(source => source.id === citation.documentId)!.content.includes(citation.excerpt))
    }
    assert.match(response.text, /Nothing has been sent/)
    assert.ok(response.draft)
  }
})

test('missing policy and disabled destinations remain distinct failures with no available action', () => {
  const inputs = example('complete-happy').inputs
  assert.equal(respondLab(recipe, createSession(recipe), inputs).kind, 'missing-knowledge')
  for (const item of routes) {
    const tool = recipe.tools.find(tool => tool.id === item.expected.toolId)!
    for (const id of tool.requiredKnowledge!) {
      const removed = selectKnowledge(recipe, configured(), id, false)
      const response = respondLab(recipe, removed, item.inputs)
      assert.equal(response.kind, 'missing-knowledge')
      assert.deepEqual(response.citations, [])
      assert.equal(response.draft, undefined)
      assert.equal(response.toolId, undefined)
      assert.equal(isToolAvailable(recipe, removed, tool.id), false)
      assert.throws(() => executeHandoff(recipe, removed, tool.id, 'Fictional package'), /required knowledge/)
    }
    const disabled = selectTool(recipe, configured(), tool.id, false)
    assert.equal(respondLab(recipe, disabled, item.inputs).kind, 'handoff-blocked')
    assert.equal(respondLab(recipe, disabled, item.inputs).toolId, undefined)
  }
  const missingTool = selectTool(recipe, configured(), example('permission-missing').expected.toolId!, false)
  assert.equal(respondLab(recipe, missingTool, inputs).kind, 'handoff-ready')
})

test('unknown, ambiguous and generic handoff prompts never choose an arbitrary queue', () => {
  for (const question of ['PKG-999', 'PKG-101 and PKG-102', 'Please route this uploaded PDF', 'human support']) {
    const response = respond(recipe, configured(), question)
    assert.equal(response.kind, 'out-of-scope')
    assert.equal(response.toolId, undefined)
  }
})

test('confirming each current draft creates exactly one correct local receipt and persists evidence', () => {
  for (const item of routes) {
    const offered = run(configured(), item.id)
    const response = offered.messages.at(-1)!.response!
    const summary = response.draft!.body
    assert.deepEqual(offered.cases, [])
    const confirmed = confirmOfferedHandoff(recipe, offered, item.expected.toolId!, summary)
    const tool = recipe.tools.find(tool => tool.id === item.expected.toolId)!
    assert.equal(confirmed.cases.length, 1)
    assert.equal(confirmed.cases[0].resourceId, tool.resourceId)
    assert.equal(confirmed.cases[0].summary, summary.trim())
    assert.equal(confirmed.activity.at(-1)?.type, 'escalated')
    assert.equal(confirmed.learningEvidence!.actions[0].outcomeId, item.expected.outcomeId)
    assert.throws(() => confirmOfferedHandoff(recipe, confirmed, tool.id, summary), /no longer active/)
    assert.deepEqual(decodeSession(recipe, JSON.stringify(confirmed)), { session: confirmed, warning: null })
    assert.equal(recipe.journey.every(step => isStepComplete(recipe, confirmed, step)), false)
  }
})

test('edited inputs, removed prerequisites, changed messages and wrong tool IDs invalidate old offers', () => {
  const offered = run(configured(), 'complete-happy')
  const toolId = example('complete-happy').expected.toolId!
  const changedInputs = setLabInputs(recipe, offered, { ...offered.labInputs!, 'permission-present': false })
  assert.throws(() => confirmOfferedHandoff(recipe, changedInputs, toolId, 'Old draft'), /changed/)
  for (const source of recipe.knowledge) {
    assert.throws(() => confirmOfferedHandoff(recipe, selectKnowledge(recipe, offered, source.id, false), toolId, 'Old draft'), /changed/)
  }
  const tool = recipe.tools.find(tool => tool.id === toolId)!
  assert.throws(() => confirmOfferedHandoff(recipe, setConnection(recipe, offered, tool.connectionId, null), toolId, 'Old draft'), /changed/)
  assert.throws(() => confirmOfferedHandoff(recipe, run(offered, 'permission-missing'), toolId, 'Old draft'), /no longer active/)
  assert.throws(() => confirmOfferedHandoff(recipe, offered, example('permission-missing').expected.toolId!, 'Old draft'), /no longer active/)
  const restored = decodeSession(recipe, JSON.stringify(offered))
  assert.equal(restored.warning, null)
  assert.equal(confirmOfferedHandoff(recipe, restored.session, toolId, 'Reviewed draft').cases.length, 1)
})

test('evaluation saves expected results but does not award hands-on or citation completion', () => {
  const initial = configured()
  const evaluated = runEvaluation(recipe, saveEvaluation(recipe, initial, 'Intake paths'))
  assert.deepEqual(evaluated.evaluation!.lastRun!.rows.map(row => row.caseId), lab.cases.map(item => item.id))
  assert.ok(evaluated.evaluation!.lastRun!.rows.every(row => row.assertions!.every(assertion => assertion.passed)))
  assert.deepEqual(evaluated.cases, [])
  assert.deepEqual(evaluated.messages, [])
  assert.deepEqual(evaluated.learningEvidence, initial.learningEvidence)
  assert.deepEqual(decodeSession(recipe, JSON.stringify(evaluated)), { session: evaluated, warning: null })
  const caseStep = recipe.journey.find(step => step.completeWhen.type === 'case-tested' && step.completeWhen.caseId === 'complete-happy')!
  const citationStep = recipe.journey.find(step => step.completeWhen.type === 'citation-opened')!
  assert.ok(caseStep && citationStep)
  assert.equal(isStepComplete(recipe, evaluated, caseStep), false)
  assert.equal(isStepComplete(recipe, evaluated, citationStep), false)
  let practiced = run(evaluated, 'complete-happy')
  assert.equal(isStepComplete(recipe, practiced, caseStep), true)
  assert.equal(isStepComplete(recipe, practiced, citationStep), false)
  assert.equal(citationStep.completeWhen.type, 'citation-opened')
  if (citationStep.completeWhen.type === 'citation-opened') {
    practiced = recordCitationOpen(recipe, practiced, citationStep.completeWhen.documentId)
  }
  assert.equal(isStepComplete(recipe, practiced, citationStep), true)
  assert.equal(recipe.journey.every(step => isStepComplete(recipe, practiced, step)), false)
  const brief = createImplementationBrief(recipe, evaluated)
  assert.match(brief, /OCR/)
  for (const tool of recipe.tools) assert.ok(brief.includes(tool.title))
})

test('legacy fact routing still validates designated tools and all required source references', () => {
  const routed = structuredClone(legacyRecipe)
  routed.facts[0].toolId = routed.tools[0].id
  routed.tools[0].requiredKnowledge = [routed.facts[0].documentId, 'processing-deadlines']
  const source = (value: CompiledRecipe) => ({ ...value, knowledge: value.knowledge.map(({ content: _content, ...document }) => document) })
  assert.ok(recipeSchema.safeParse(source(routed)).success)
  for (const mutate of [
    (value: CompiledRecipe) => { value.facts[0].toolId = 'unknown-tool' },
    (value: CompiledRecipe) => { value.tools[0].requiredKnowledge = ['unknown-document'] },
    (value: CompiledRecipe) => { value.tools[0].requiredKnowledge = ['processing-deadlines'] },
    (value: CompiledRecipe) => { value.tools[0].requiredKnowledge!.push(value.facts[0].documentId) },
  ]) {
    const changed = structuredClone(routed)
    mutate(changed)
    assert.equal(recipeSchema.safeParse(source(changed)).success, false)
  }
})
