import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { createSession, respond, respondLab, runLabExample, setLabInputs, isStepComplete } from '../src/domain/engine.ts'
import { runEvaluation, saveEvaluation } from '../src/domain/evaluation.ts'
import { createImplementationBrief } from '../src/domain/export.ts'
import { defaultLabInputs } from '../src/domain/lab.ts'
import { decodeSession } from '../src/domain/storage.ts'
import { composeInstructions, instructionStyleOptions } from '../src/domain/instructions.ts'
import type { LabInputs } from '../src/domain/lab-types.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))
const recipe = recipes.find(item => item.id === 'customer-service-optimize')!
assert.ok(recipe?.lab)
const lab = recipe.lab
const initial = createSession(recipe)
const defaults = defaultLabInputs(lab)
const run = (change: LabInputs = {}) => respondLab(recipe, initial, { ...defaults, ...change })

test('all examples evaluate without fake knowledge or tool connections', () => {
  assert.equal(recipe.skills?.length, 7)
  assert.equal(recipe.skills.filter(skill => skill.coverage === 'simulated').length, 1)
  assert.deepEqual([recipe.connections, recipe.tools, recipe.knowledge], [[], [], []])
  const evaluated = runEvaluation(recipe, saveEvaluation(recipe, initial, 'Closure cases'))
  assert.equal(evaluated.evaluation!.lastRun!.rows.length, 15)
  for (const row of evaluated.evaluation!.lastRun!.rows) {
    assert.ok(row.assertions?.every(item => item.passed), JSON.stringify(row))
    assert.deepEqual(row.response.citations, [])
    assert.equal(row.response.toolId, undefined)
  }
  assert.deepEqual(evaluated.cases, [])
})

test('threshold edits recompute verdicts including equality, zero and unknown values', () => {
  assert.equal(run().lab?.outcomeId, 'critical')
  assert.equal(run({ 'critical-hours': 1 }).lab?.outcomeId, 'strained')
  assert.equal(run({ hours: 4 }).lab?.outcomeId, 'critical')
  assert.equal(run({ hours: 4.001 }).lab?.outcomeId, 'strained')
  assert.equal(run({ hours: 0, 'critical-hours': 0 }).lab?.outcomeId, 'critical')
  assert.equal(run({ hours: null }).lab?.outcomeId, 'strained')
  assert.match(run({ hours: null }).text, /Interval not measured/)
  assert.equal(run({ 'critical-enabled': false }).lab?.outcomeId, 'strained')
  assert.equal(run({ 'critical-hours': null }).lab?.outcomeId, 'insufficient-evidence')
  assert.equal(run({ 'critical-enabled': false, 'critical-hours': null }).lab?.outcomeId, 'strained')
  assert.throws(() => run({ hours: -1 }), /Review the fictional input/)
})

test('applicability, unknown evidence and confirmation remain distinct', () => {
  assert.equal(run({ state: 'active' }).lab?.outcomeId, 'not-applicable')
  assert.equal(run({ configured: false }).lab?.outcomeId, 'not-applicable')
  assert.equal(run({ state: 'cancelled' }).lab?.outcomeId, 'critical')
  const unknownInputs: LabInputs[] = [{ state: 'unknown' }, { confirmation: 'unknown' }, { 'last-human': 'unknown' }, { complete: false }]
  for (const change of unknownInputs) {
    assert.equal(run(change).lab?.outcomeId, 'insufficient-evidence')
  }
  assert.equal(run({ confirmation: 'accepted', 'last-human': 'inbound' }).lab?.outcomeId, 'confirmed')
  assert.equal(run({ confirmation: 'accepted', 'last-human': 'none' }).lab?.outcomeId, 'insufficient-evidence')
  assert.equal(run({ 'last-human': 'inbound' }).lab?.outcomeId, 'no-match')
  assert.match(run({ 'last-human': 'inbound' }).text, /question is not confirmation/)
  assert.match(run({ 'last-human': 'none' }).text, /not proof of satisfaction/)
})

test('journey needs hands-on evidence and persists without executing external actions', () => {
  const evaluated = runEvaluation(recipe, saveEvaluation(recipe, initial, 'Learning'))
  assert.equal(recipe.journey.every(step => isStepComplete(recipe, evaluated, step)), false)
  let practiced = evaluated
  for (const step of recipe.journey) {
    if (step.completeWhen.type !== 'case-tested') continue
    const id = step.completeWhen.caseId
    const example = lab.cases.find(item => item.id === id)!
    practiced = runLabExample(recipe, setLabInputs(recipe, practiced, example.inputs))
  }
  assert.ok(recipe.journey.every(step => isStepComplete(recipe, practiced, step)))
  assert.deepEqual(practiced.cases, [])
  assert.deepEqual(decodeSession(recipe, JSON.stringify(practiced)), { session: practiced, warning: null })
  assert.match(run().trace.join('\n'), /no native skill or model was invoked/)
})

test('native execution limits and all skill coverage survive exports', () => {
  for (const question of ['Analyse this case', '{"skillKey":"stalled-cases-pass1-evaluate-v1"}']) {
    assert.equal(respond(recipe, initial, question).kind, 'out-of-scope')
    assert.match(respond(recipe, initial, question).text, /does not accept/)
  }
  const brief = createImplementationBrief(recipe, initial)
  for (const skill of recipe.skills!) assert.ok(brief.includes(skill.id))
  assert.match(brief, /reference only; not executable/)
  assert.match(brief, /four-hour Critical maximum is invented/)
  assert.match(brief, /part of the main Cookbook catalogue/)
  assert.doesNotMatch(brief, /excluded from the normal compiler|port 4194/)
  for (const style of instructionStyleOptions) {
    assert.ok(composeInstructions(recipe.instructionStyles!, style.id, true).length <= 3000)
    assert.ok(recipe.instructionStyles![style.id].length > 700)
  }
})
