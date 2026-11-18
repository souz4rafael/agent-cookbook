import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import {
  createSession, getConfigurationFingerprint, isStepComplete, recordCitationOpen, respondLab,
  runLabExample, selectKnowledge, selectTool, setConnection, setLabInputs, updateProfile,
} from '../src/domain/engine.ts'
import { calculateLab, compareLabExpectation, defaultLabInputs } from '../src/domain/lab.ts'
import { confirmOfferedHandoff } from '../src/domain/actions.ts'
import { runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { decodeSession } from '../src/domain/storage.ts'
import type { CompiledRecipe, Session } from '../src/domain/types.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))

function configured(recipe: CompiledRecipe): Session {
  let session = createSession(recipe)
  for (const connection of recipe.connections) session = setConnection(recipe, session, connection.id, connection.resources[0].id)
  for (const document of recipe.knowledge) session = selectKnowledge(recipe, session, document.id, true)
  for (const tool of recipe.tools) session = selectTool(recipe, session, tool.id, true)
  return session
}

for (const recipe of recipes) {
  test(`${recipe.id}: published standard has causal inputs, expected cases and specific completion`, () => {
    assert.ok(recipe.lab)
    assert.ok(recipe.lab.fields.length > 1)
    assert.ok(new Set(recipe.lab.cases.map(item => item.expected.outcomeId)).size > 1)
    assert.ok(recipe.journey.some(step => step.completeWhen.type === 'case-tested'))
    assert.equal(recipe.journey.some(step => step.completeWhen.type === 'citation-opened'), recipe.knowledge.length > 0)
    assert.equal(recipe.journey.some(step => step.completeWhen.type === 'action-confirmed'), recipe.tools.length > 0)
    if (!recipe.knowledge.length) {
      assert.ok(recipe.lab.outcomes.every(outcome => recipe.skills?.some(skill => skill.id === outcome.skillId && skill.coverage === 'simulated')))
    }
    assert.ok(recipe.journey.some(step => step.completeWhen.type === 'evaluation-passed'))
    assert.ok(!recipe.journey.some(step => step.completeWhen.type === 'event'), 'Generic activity is not proof of learning')
    assert.equal(recipe.estimatedMinutes, recipe.journey.length)
  })

  test(`${recipe.id}: every declared acceptance case passes without changing inputs or executing tools`, () => {
    const session = configured(recipe)
    const before = structuredClone(session)
    const run = runEvaluation(recipe, saveEvaluation(recipe, session, 'Acceptance checks'))
    assert.equal(run.evaluation!.lastRun!.rows.length, recipe.lab!.cases.length)
    for (const row of run.evaluation!.lastRun!.rows) {
      assert.ok(row.assertions?.length)
      assert.ok(row.assertions.every(assertion => assertion.passed), `${row.caseId}: ${JSON.stringify(row.assertions.filter(item => !item.passed))}`)
    }
    assert.deepEqual(run.messages, before.messages)
    assert.deepEqual(run.cases, before.cases)
    assert.deepEqual(run.labInputs, before.labInputs)
    assert.deepEqual(run.learningEvidence, before.learningEvidence)
    assert.equal(decodeSession(recipe, JSON.stringify(run)).warning, null)
  })

  test(`${recipe.id}: changing inputs recalculates declared checks instead of loading a report`, () => {
    const session = configured(recipe)
    const cases = recipe.lab!.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length)
    const first = cases[0]
    const changed = cases.find(item => item.expected.outcomeId !== first.expected.outcomeId)
    assert.ok(changed)
    const original = respondLab(recipe, session, first.inputs)
    const recalculated = respondLab(recipe, session, changed.inputs)
    assert.notEqual(original.lab!.outcomeId, recalculated.lab!.outcomeId)
    assert.deepEqual(recalculated.lab!.inputs, changed.inputs)
    assert.ok(recalculated.lab!.checks.some((check, index) => check.passed !== original.lab!.checks[index].passed))
    assert.deepEqual(session.labInputs, defaultLabInputs(recipe.lab!))
    assert.equal(session.cases.length, 0)
  })

  test(`${recipe.id}: configuration and a single arbitrary answer cannot complete the tutorial`, () => {
    let session = updateProfile(recipe, configured(recipe), { name: `${recipe.agent.name} demo`.slice(0, 100) })
    session = { ...session, activity: [...session.activity, { id: 'legacy-answer', at: new Date().toISOString(), type: 'answered', text: 'Not evidence of any specific case.' }] }
    session = runEvaluation(recipe, saveEvaluation(recipe, session, 'All checks'))
    assert.ok(!recipe.journey.every(step => isStepComplete(recipe, session, step)))
    assert.ok(recipe.journey.filter(step => step.completeWhen.type === 'case-tested' || step.completeWhen.type === 'citation-opened' || step.completeWhen.type === 'action-confirmed').every(step => !isStepComplete(recipe, session, step)))
  })

  test(`${recipe.id}: demonstrable cases, actual citation views, confirmations and evaluation complete the journey`, () => {
    let session = updateProfile(recipe, configured(recipe), { name: `${recipe.agent.name} demo`.slice(0, 100) })
    for (const step of recipe.journey) {
      const condition = step.completeWhen
      if (condition.type !== 'case-tested') continue
      const testCase = recipe.lab!.cases.find(item => item.id === condition.caseId)!
      assert.ok(testCase)
      assert.ok(!testCase.disabledKnowledge?.length && !testCase.disabledTools?.length)
      session = runLabExample(recipe, setLabInputs(recipe, session, testCase.inputs))
      assert.equal(isStepComplete(recipe, session, step), true, step.id)
    }
    for (const step of recipe.journey) {
      const condition = step.completeWhen
      if (condition.type !== 'citation-opened') continue
      if (!session.messages.some(message => message.response?.citations.some(source => source.documentId === condition.documentId))) {
        const testCase = recipe.lab!.cases.find(item => item.expected.documentIds.includes(condition.documentId) && !item.disabledKnowledge?.length && !item.disabledTools?.length)!
        assert.ok(testCase)
        session = runLabExample(recipe, setLabInputs(recipe, session, testCase.inputs))
      }
      session = recordCitationOpen(recipe, session, condition.documentId)
    }
    for (const step of recipe.journey) {
      const condition = step.completeWhen
      if (condition.type !== 'action-confirmed') continue
      const testCase = recipe.lab!.cases.find(item => item.expected.outcomeId === condition.outcomeId && item.expected.toolId === condition.toolId && item.expected.kind === 'handoff-ready')!
      assert.ok(testCase, `No reachable action example for ${step.id}`)
      session = runLabExample(recipe, setLabInputs(recipe, session, testCase.inputs))
      const offer = session.messages.at(-1)!.response!
      assert.ok(offer.draft)
      session = confirmOfferedHandoff(recipe, session, condition.toolId, offer.draft.body)
    }
    session = runEvaluation(recipe, saveEvaluation(recipe, session, 'Final checks'))
    assert.ok(recipe.journey.every(step => isStepComplete(recipe, session, step)), recipe.journey.filter(step => !isStepComplete(recipe, session, step)).map(step => step.id).join(', '))
    const restored = decodeSession(recipe, JSON.stringify(session))
    assert.equal(restored.warning, null)
    assert.deepEqual(restored.session, session)
    assert.ok(recipe.journey.every(step => isStepComplete(recipe, restored.session, step)))
    const changed = recipe.knowledge.length
      ? selectKnowledge(recipe, session, recipe.knowledge[0].id, false)
      : updateProfile(recipe, session, { name: 'Changed skill-based exercise' })
    assert.ok(!recipe.journey.every(step => isStepComplete(recipe, changed, step)), 'Changing configuration invalidates current evidence')
  })

  if (recipe.tools.length) test(`${recipe.id}: stale inputs, source removal and repeated confirmation cannot execute a pending action`, () => {
    const testCase = recipe.lab!.cases.find(item => item.expected.kind === 'handoff-ready')!
    assert.ok(testCase)
    const offered = runLabExample(recipe, setLabInputs(recipe, configured(recipe), testCase.inputs))
    const offer = offered.messages.at(-1)!.response!
    const another = recipe.lab!.cases.find(item => JSON.stringify(item.inputs) !== JSON.stringify(testCase.inputs))!
    assert.ok(another)
    const edited = setLabInputs(recipe, offered, another.inputs)
    assert.throws(() => confirmOfferedHandoff(recipe, edited, offer.toolId!, 'Fictional review'), /changed/)
    const sourceRemoved = selectKnowledge(recipe, offered, offer.citations[0].documentId, false)
    assert.throws(() => confirmOfferedHandoff(recipe, sourceRemoved, offer.toolId!, 'Fictional review'), /changed/)
    const restored = decodeSession(recipe, JSON.stringify(offered))
    assert.equal(restored.warning, null)
    const confirmed = confirmOfferedHandoff(recipe, restored.session, offer.toolId!, 'Edited fictional request summary')
    assert.equal(confirmed.cases.at(-1)?.summary, 'Edited fictional request summary')
    assert.throws(() => confirmOfferedHandoff(recipe, confirmed, offer.toolId!, 'Again'), /no longer active/)
  })

  if (recipe.knowledge.length) test(`${recipe.id}: missing sources suppress drafts and expected checks fail for a broken configuration`, () => {
    const testCase = recipe.lab!.cases.find(item => item.expected.kind === 'handoff-ready')!
    let session = configured(recipe)
    session = selectKnowledge(recipe, session, testCase.expected.documentIds[0], false)
    const result = respondLab(recipe, session, testCase.inputs)
    assert.equal(result.kind, 'missing-knowledge')
    assert.equal(result.draft, undefined)
    assert.equal(result.toolId, undefined)
    assert.equal(result.citations.length, 0)
    assert.ok(compareLabExpectation(testCase, result).some(item => !item.passed))
    const evaluated = runEvaluation(recipe, saveEvaluation(recipe, session, 'Broken setup'))
    const completion = recipe.journey.find(step => step.completeWhen.type === 'evaluation-passed')!
    assert.equal(isStepComplete(recipe, evaluated, completion), false)
  })

  test(`${recipe.id}: invalid input values do not mutate progress; cosmetic edits do not affect calculations`, () => {
    const session = configured(recipe)
    const snapshot = structuredClone(session)
    assert.throws(() => setLabInputs(recipe, session, { ...session.labInputs, injected: 'unknown field' }), /input fields/)
    assert.throws(() => setLabInputs(recipe, session, {}), /input fields/)
    assert.deepEqual(session, snapshot)
    const calculated = calculateLab(recipe.lab!, session.labInputs!)
    const renamed = updateProfile(recipe, session, { name: 'Fictional renamed agent' })
    assert.deepEqual(calculateLab(recipe.lab!, renamed.labInputs!), calculated)
    assert.notEqual(getConfigurationFingerprint(session), getConfigurationFingerprint(renamed))
  })
}
