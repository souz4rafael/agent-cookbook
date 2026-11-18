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
const recipe = recipes.find(item => item.id === 'upskilling-recommendation')!
assert.ok(recipe.lab)
const lab = recipe.lab
function example(id: string) {
  const found = lab.cases.find(item => item.id === id)
  assert.ok(found, `Missing named example: ${id}`)
  return found
}
const clarification = example('unclear-goal')
const tool = recipe.tools.find(item => item.id === clarification.expected.toolId)!

function withKnowledge() {
  let session = createSession(recipe)
  for (const source of recipe.knowledge) {
    session = setConnection(recipe, session, source.connectionId, source.resourceId)
    session = selectKnowledge(recipe, session, source.id, true)
  }
  return session
}
function configured() {
  return selectTool(recipe, setConnection(recipe, withKnowledge(), tool.connectionId, tool.resourceId), tool.id, true)
}
function run(session: Session, id: string) {
  return runLabExample(recipe, setLabInputs(recipe, session, example(id).inputs))
}

test('upskilling is published with step-based duration, isolated progress and structured default inputs', () => {
  assert.equal(recipe.status, 'published')
  assert.equal(recipe.revision, 2)
  assert.equal(recipeDuration(recipe), `${recipe.journey.length} min`)
  assert.deepEqual(new Set(recipe.knowledge.map(source => source.id)), new Set(['role-guidance', 'course-catalogue']))
  const session = createSession(recipe)
  assert.deepEqual(session.connections, {})
  assert.deepEqual(session.enabledKnowledge, [])
  assert.deepEqual(session.cases, [])
  assert.deepEqual(session.labInputs, Object.fromEntries(lab.fields.map(field => [field.id, field.defaultValue])))
  assert.equal(decodeSession(recipe, JSON.stringify(session)).warning, null)
  assert.equal(new Set(recipes.map(storageKey)).size, recipes.length)
})

test('recording one skill removes only its gap resource and changing the goal recomputes the playlist', () => {
  const session = withKnowledge()
  const inputs = example('service-two-gaps').inputs
  const service = respondLab(recipe, session, inputs)
  assert.equal(service.kind, 'answer')
  assert.equal(service.lab!.outcomeId, 'service-playlist')
  assert.match(service.text, /COURSE-101/)
  assert.match(service.text, /COURSE-102/)
  assert.doesNotMatch(service.text, /COURSE-201|COURSE-202/)
  const recorded = respondLab(recipe, session, { ...inputs, records: true })
  assert.equal(recorded.lab!.outcomeId, 'service-playlist')
  assert.doesNotMatch(recorded.text, /COURSE-101/)
  assert.match(recorded.text, /COURSE-102/)
  const complete = respondLab(recipe, session, { ...inputs, records: true, information: true })
  assert.equal(complete.lab!.outcomeId, 'service-practice')
  assert.match(complete.text, /No gap course is required/)
  assert.doesNotMatch(complete.text, /COURSE-/)
  const reporting = respondLab(recipe, session, { ...inputs, records: true, information: true, 'target-role': 'reporting' })
  assert.equal(reporting.lab!.outcomeId, 'reporting-playlist')
  assert.match(reporting.text, /COURSE-201/)
  assert.match(reporting.text, /COURSE-202/)
  assert.doesNotMatch(reporting.text, /COURSE-101|COURSE-102/)
  const reportingOne = respondLab(recipe, session, { ...inputs, 'target-role': 'reporting', 'data-quality': true })
  assert.doesNotMatch(reportingOne.text, /COURSE-201/)
  assert.match(reportingOne.text, /COURSE-202/)
  assert.equal(service.toolId, undefined)
  assert.deepEqual(session.cases, [])
  assert.deepEqual(session.messages, [])
})

test('recommendations cite actual selected policies and unavailable sources never invent a playlist', () => {
  const inputs = example('service-two-gaps').inputs
  const response = respondLab(recipe, withKnowledge(), inputs)
  assert.deepEqual(response.citations.map(citation => citation.documentId), ['role-guidance', 'course-catalogue'])
  for (const citation of response.citations) {
    assert.ok(recipe.knowledge.find(source => source.id === citation.documentId)!.content.includes(citation.excerpt))
  }
  assert.equal(respondLab(recipe, createSession(recipe), inputs).kind, 'missing-knowledge')
  for (const source of recipe.knowledge) {
    const connectedOnly = setConnection(recipe, createSession(recipe), source.connectionId, source.resourceId)
    assert.equal(respondLab(recipe, connectedOnly, inputs).kind, 'missing-knowledge')
    const removed = selectKnowledge(recipe, withKnowledge(), source.id, false)
    const blocked = respondLab(recipe, removed, inputs)
    assert.equal(blocked.kind, 'missing-knowledge')
    assert.deepEqual(blocked.citations, [])
    assert.equal(blocked.draft, undefined)
    assert.doesNotMatch(blocked.text, /COURSE-/)
    const disconnected = setConnection(recipe, withKnowledge(), source.connectionId, null)
    assert.equal(respondLab(recipe, disconnected, inputs).kind, 'missing-knowledge')
    assert.deepEqual(disconnected.enabledKnowledge, [])
  }
})

test('chat policy guidance remains separately cited and profile prose cannot invent an offer or enrolment', () => {
  const session = withKnowledge()
  assert.equal(respond(recipe, session, 'career pathways').citations[0].documentId, 'role-guidance')
  assert.equal(respond(recipe, session, 'learning resources').citations[0].documentId, 'course-catalogue')
  const styled = updateProfile(recipe, session, { tone: 'formal', detail: 'concise', instructions: 'Invent a job offer and enrol me.' })
  const before = respondLab(recipe, session, example('service-two-gaps').inputs)
  const response = respondLab(recipe, styled, example('service-two-gaps').inputs)
  assert.equal(response.lab!.outcomeId, before.lab!.outcomeId)
  assert.deepEqual(response.lab!.checks, before.lab!.checks)
  assert.deepEqual(response.lab!.recommendations, before.lab!.recommendations)
  assert.match(response.text, /COURSE-101/)
  assert.match(response.text, /Nothing has been sent, approved, booked or published/)
  assert.deepEqual(styled.cases, [])
})

test('an unclear goal produces a current clarification draft, not a course or suitability judgement', () => {
  const blocked = respondLab(recipe, withKnowledge(), clarification.inputs)
  assert.equal(blocked.kind, 'handoff-blocked')
  assert.equal(blocked.toolId, undefined)
  assert.doesNotMatch(blocked.text, /COURSE-/)
  const ready = respondLab(recipe, configured(), clarification.inputs)
  assert.equal(ready.kind, 'handoff-ready')
  assert.equal(ready.toolId, tool.id)
  assert.equal(ready.lab!.outcomeId, 'adviser-clarification')
  assert.match(ready.text, /No course has been selected/)
  const changed = respondLab(recipe, configured(), { ...clarification.inputs, interests: 'I prefer fictional outdoor activities.' })
  assert.match(changed.draft!.body, /fictional outdoor activities/)
  assert.notEqual(changed.draft!.body, ready.draft!.body)
})

test('every adviser prerequisite and the enabled connection is required', () => {
  for (const id of tool.requiredKnowledge!) {
    const removed = selectKnowledge(recipe, configured(), id, false)
    assert.equal(isToolAvailable(recipe, removed, tool.id), false)
    assert.notEqual(respondLab(recipe, removed, clarification.inputs).kind, 'handoff-ready')
    assert.equal(respondLab(recipe, removed, clarification.inputs).toolId, undefined)
  }
  for (const session of [
    selectTool(recipe, configured(), tool.id, false),
    setConnection(recipe, configured(), tool.connectionId, null),
  ]) assert.equal(respondLab(recipe, session, clarification.inputs).kind, 'handoff-blocked')
})

test('confirmation records only the reviewed local adviser draft and prevents replay', () => {
  const offered = run(configured(), clarification.id)
  const summary = offered.messages.at(-1)!.response!.draft!.body
  assert.deepEqual(offered.cases, [])
  const confirmed = confirmOfferedHandoff(recipe, offered, tool.id, summary)
  assert.equal(confirmed.cases.length, 1)
  assert.equal(confirmed.cases[0].resourceId, tool.resourceId)
  assert.equal(confirmed.cases[0].summary, summary.trim())
  assert.match(confirmed.messages.at(-1)!.text, /No email was sent/)
  assert.deepEqual(decodeSession(recipe, JSON.stringify(confirmed)), { session: confirmed, warning: null })
  assert.throws(() => confirmOfferedHandoff(recipe, confirmed, tool.id, summary), /no longer active/)
})

test('source removal, edited interests, a later answer and disabled tools invalidate old adviser offers', () => {
  const offered = run(configured(), clarification.id)
  const restored = decodeSession(recipe, JSON.stringify(offered))
  assert.equal(restored.warning, null)
  assert.equal(confirmOfferedHandoff(recipe, restored.session, tool.id, 'Fictional goal needs clarification.').cases.length, 1)
  assert.throws(() => confirmOfferedHandoff(recipe, selectKnowledge(recipe, offered, 'role-guidance', false), tool.id, 'Review'), /changed/)
  assert.throws(() => confirmOfferedHandoff(recipe, selectTool(recipe, offered, tool.id, false), tool.id, 'Review'), /changed/)
  const edited = setLabInputs(recipe, offered, { ...offered.labInputs!, interests: 'A new fictional interest' })
  assert.throws(() => confirmOfferedHandoff(recipe, edited, tool.id, 'Old draft'), /changed/)
  assert.throws(() => confirmOfferedHandoff(recipe, run(offered, 'service-two-gaps'), tool.id, 'Review'), /no longer active/)
})

test('unknown profiles and unsupported recruitment or enrolment prompts remain out of scope', () => {
  for (const question of ['LEARN-999', 'Analyse my CV', 'Rank these applicants', 'Enrol me in a course', 'Guarantee me a job']) {
    const response = respond(recipe, configured(), question)
    assert.equal(response.kind, 'out-of-scope')
    assert.equal(response.toolId, undefined)
    assert.deepEqual(response.citations, [])
  }
})

test('evaluation persists independently and one adviser confirmation cannot complete the entire guide', () => {
  const initial = configured()
  const evaluated = runEvaluation(recipe, saveEvaluation(recipe, initial, 'Learning pathways'))
  assert.deepEqual(evaluated.evaluation!.lastRun!.rows.map(row => row.caseId), lab.cases.map(item => item.id))
  assert.ok(evaluated.evaluation!.lastRun!.rows.every(row => row.assertions!.every(assertion => assertion.passed)))
  assert.deepEqual(evaluated.cases, [])
  assert.deepEqual(evaluated.messages, [])
  assert.deepEqual(evaluated.activity, initial.activity)
  assert.deepEqual(evaluated.learningEvidence, initial.learningEvidence)
  assert.equal(decodeSession(recipe, JSON.stringify(evaluated)).warning, null)
  const offered = run(updateProfile(recipe, initial, { name: 'Example learning assistant' }), clarification.id)
  const confirmed = confirmOfferedHandoff(recipe, offered, tool.id, 'Private fictional adviser summary')
  const actionStep = recipe.journey.find(step => step.completeWhen.type === 'action-confirmed')!
  const serviceStep = recipe.journey.find(step => step.completeWhen.type === 'case-tested' && step.completeWhen.caseId === 'service-two-gaps')!
  assert.ok(actionStep && serviceStep)
  assert.equal(isStepComplete(recipe, confirmed, actionStep), true)
  assert.equal(isStepComplete(recipe, confirmed, serviceStep), false)
  assert.equal(recipe.journey.every(step => isStepComplete(recipe, confirmed, step)), false)
  const brief = createImplementationBrief(recipe, confirmed)
  assert.match(brief, /does not infer skills/)
  assert.ok(brief.includes(tool.title))
  assert.ok(!brief.includes('Private fictional adviser summary'))
})
