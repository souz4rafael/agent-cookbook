import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  classifyCreditResponse, creditModel, creditProfiles, estimateConversation, estimateCreditCounts,
  estimateResponses, formatCreditRange, getRecipeCreditBaseline, projectCredits, sumCreditRanges,
} from '../src/domain/credits.ts'
import { createSession, selectKnowledge, selectTool, setConnection, updateProfile } from '../src/domain/engine.ts'
import { getEvaluationRows, runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { decodeSession } from '../src/domain/storage.ts'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import type { CompiledRecipe, TestResponse } from '../src/domain/types.ts'

function response(sources = 0, checks = 0, draft = false): TestResponse {
  return {
    kind: 'answer', text: 'Fictional response', trace: [],
    citations: Array.from({ length: sources }, (_, index) => ({ documentId: `source-${index}`, title: `Source ${index}`, excerpt: 'Example policy' })),
    ...(checks ? { lab: {
      outcomeId: 'example', ruleId: 'rule', inputs: {}, recommendations: [], fingerprint: 'example',
      checks: Array.from({ length: checks }, (_, index) => ({ id: `check-${index}`, label: 'A rule', passed: true, actual: 1, expected: 1 })),
    } } : {}),
    ...(draft ? { draft: { title: 'Review', body: 'Fictional draft' } } : {}),
  }
}

test('published interaction bands retain the open-ended Heavy upper bound and separate calculator scopes', () => {
  assert.deepEqual(creditProfiles.light.range, { min: 100, max: 300 })
  assert.deepEqual(creditProfiles.medium.range, { min: 300, max: 500 })
  assert.deepEqual(creditProfiles.heavy.range, { min: 500, max: null })
  assert.equal(creditModel.estimatorUrl, 'https://nptnlopppecostweb.azurewebsites.net/#/estimator')
  assert.equal(creditModel.githubEstimatorUrl, 'https://microsoft.github.io/copilot-studio-estimator/')
  assert.match(creditModel.version, /^2026-11-17/u)
})

test('classification reflects task evidence, not a fixed fee for each source or proposed tool', () => {
  assert.equal(classifyCreditResponse(response()).profile, 'light')
  assert.equal(classifyCreditResponse(response(2)).profile, 'light')
  assert.equal(classifyCreditResponse(response(3)).profile, 'medium')
  assert.equal(classifyCreditResponse(response(1, 3, true)).profile, 'medium')
  assert.equal(classifyCreditResponse(response(1, 8)).profile, 'light')
  assert.equal(classifyCreditResponse(response(5, 8, true)).profile, 'heavy')
  assert.equal(classifyCreditResponse(response(5, 7, true)).profile, 'medium')
  assert.equal(classifyCreditResponse(response(4, 8, true)).profile, 'medium')
  assert.equal(classifyCreditResponse({ ...response(), kind: 'handoff-ready', toolId: 'proposed' }).profile, 'light')
  assert.equal(classifyCreditResponse({ ...response(1, 3, true), kind: 'handoff-blocked' }).profile, 'medium')
  for (const kind of ['missing-knowledge', 'out-of-scope'] as const) {
    assert.equal(classifyCreditResponse({ ...response(0, 8), kind }).profile, 'light')
  }
  const duplicate = response(1)
  duplicate.citations.push(...Array(4).fill(duplicate.citations[0]))
  assert.equal(classifyCreditResponse(duplicate).profile, 'light')
  const recommendations = response(0, 1)
  recommendations.lab!.recommendations = ['One', 'Two', 'Three']
  assert.equal(classifyCreditResponse(recommendations).profile, 'medium')
})

test('totals add whole interaction bounds once and never fabricate a Heavy ceiling', () => {
  const finite = estimateResponses([response(), response(3)])
  assert.equal(finite.count, 2)
  assert.deepEqual(finite.range, { min: 400, max: 800 })
  assert.equal(finite.groups.find(group => group.profile === 'heavy')?.range.max, 0)
  const open = estimateResponses([response(), response(3), response(5, 8, true)])
  assert.deepEqual(open.range, { min: 900, max: null })
  assert.equal(formatCreditRange(open.range), '900+')
  assert.deepEqual(sumCreditRanges([]), { min: 0, max: 0 })
  assert.deepEqual(sumCreditRanges([{ min: 1, max: null }, { min: 2, max: 3 }]), { min: 3, max: null })
})

test('monthly projections use responses rather than people, preserve open bounds, and reject invalid counts', () => {
  const finite = estimateResponses([response(), response(3)])
  assert.deepEqual(projectCredits(finite, 1000), { min: 200_000, max: 400_000 })
  const open = estimateResponses([response(5, 8, true)])
  assert.deepEqual(projectCredits(open, 1000), { min: 500_000, max: null })
  assert.deepEqual(projectCredits(open, 0), { min: 0, max: 0 })
  assert.throws(() => projectCredits(estimateResponses([]), 1000), /baseline response/u)
  for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => projectCredits(finite, count), /safe integers/u)
    assert.throws(() => estimateCreditCounts({ light: count, medium: 0, heavy: 0 }), /safe integers/u)
  }
  assert.equal(formatCreditRange({ min: 100 / 3, max: 200 / 3 }), '33.3\u201366.7')
  assert.equal(formatCreditRange({ min: 0, max: 0 }), '0')
})

test('conversation totals omit user bubbles, welcome/status messages, and tool confirmation receipts', () => {
  const result = estimateConversation([
    { id: 'welcome', role: 'assistant', text: 'Hello' },
    { id: 'user', role: 'user', text: 'Example' },
    { id: 'response', role: 'assistant', text: 'Example', response: response() },
    { id: 'receipt', role: 'assistant', text: 'Simulated case confirmed' },
    { id: 'status', role: 'assistant', text: 'Preparing' },
  ])
  assert.equal(result.count, 1)
  assert.deepEqual(result.range, { min: 100, max: 300 })
  assert.ok(result.reason)
  assert.equal(estimateConversation([]).count, 0)
  assert.deepEqual(estimateConversation([]).range, { min: 0, max: 0 })
})

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))

function configured(recipe: CompiledRecipe) {
  let session = createSession(recipe)
  for (const connection of recipe.connections) session = setConnection(recipe, session, connection.id, connection.resources[0].id)
  for (const source of recipe.knowledge) session = selectKnowledge(recipe, session, source.id, true)
  for (const tool of recipe.tools) session = selectTool(recipe, session, tool.id, true)
  return session
}

for (const recipe of recipes) {
  test(`${recipe.id}: evaluation estimates use the same responses as a run without recording activity`, () => {
    const session = configured(recipe)
    const before = structuredClone(session)
    const planned = getEvaluationRows(recipe, session)
    const run = runEvaluation(recipe, saveEvaluation(recipe, session, 'Credits'))
    assert.deepEqual(planned, run.evaluation!.lastRun!.rows)
    assert.deepEqual(session, before)
    const estimate = estimateResponses(planned.map(row => row.response))
    assert.equal(estimate.count, recipe.lab!.cases.length)
    assert.deepEqual(estimate.range, sumCreditRanges(planned.map(row => estimateResponses([row.response]).range)))
    assert.ok(estimate.range.min > 0)
    for (const group of estimate.groups) {
      assert.equal(group.count, planned.filter(row => classifyCreditResponse(row.response).profile === group.profile).length)
    }
    const changed = updateProfile(recipe, run, { detail: run.profile.detail === 'concise' ? 'detailed' : 'concise' })
    const restored = decodeSession(recipe, JSON.stringify(changed))
    assert.equal(restored.warning, null)
    assert.deepEqual(estimateResponses(restored.session.evaluation!.lastRun!.rows.map(row => row.response)), estimate)
  })

  test(`${recipe.id}: recipe projection excludes deliberate broken-resource tests, but surfaces a broken current setup`, () => {
    const session = configured(recipe)
    const baseline = getRecipeCreditBaseline(recipe, session)
    const cases = recipe.lab!.cases.filter(item => !item.disabledKnowledge?.length && !item.disabledTools?.length)
    assert.equal(baseline.estimate.count, cases.length)
    assert.deepEqual(baseline.estimate, estimateResponses(getEvaluationRows(recipe, session)
      .filter(row => cases.some(item => item.id === row.caseId)).map(row => row.response)))
    const broken = getRecipeCreditBaseline(recipe, createSession(recipe))
    if (recipe.knowledge.length || recipe.tools.length) {
      assert.ok(broken.blockedCount > 0)
    } else {
      assert.equal(broken.blockedCount, 0)
      assert.deepEqual(broken.estimate, baseline.estimate)
    }
    assert.equal(broken.estimate.count, cases.length)
  })
}
