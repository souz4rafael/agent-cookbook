import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { compiledRecipeSchema } from '../src/domain/validation.ts'
import { createSession, respondLab } from '../src/domain/engine.ts'
import { defaultLabInputs } from '../src/domain/lab.ts'
import { fileURLToPath } from 'node:url'

const [original] = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))

function fixture() {
  const recipe = structuredClone(original)
  recipe.skills = [{ id: 'fixture-skill', title: 'Fixture skill', description: 'Structured local rules.', instructions: '# Scope\nUse supplied evidence only.', coverage: 'simulated' }]
  recipe.lab!.outcomes = recipe.lab!.outcomes.map(outcome => {
    const { toolId: _toolId, ...rest } = outcome
    return { ...rest, documentIds: [], skillId: 'fixture-skill' }
  })
  recipe.lab!.cases = recipe.lab!.cases.map(item => ({
    id: item.id, title: item.title, inputs: item.inputs,
    expected: { outcomeId: item.expected.outcomeId, kind: 'answer', documentIds: [] },
  }))
  recipe.journey = recipe.journey.filter(step => step.completeWhen.type !== 'action-confirmed')
  recipe.estimatedMinutes = recipe.journey.length
  return recipe
}

test('skill-backed outcomes run without fabricated source citations', () => {
  const recipe = compiledRecipeSchema.parse(fixture())
  const response = respondLab(recipe, createSession(recipe), defaultLabInputs(recipe.lab!))
  assert.equal(response.kind, 'answer')
  assert.deepEqual(response.citations, [])
  assert.equal(response.toolId, undefined)
  assert.ok(response.trace.some(line => line.includes('fixture-skill')))
  assert.ok(!response.trace.some(line => line.includes('Citations identify')))
})

test('unbacked, unknown, reference-only and duplicate skills are rejected', () => {
  for (const mutate of [
    (recipe: ReturnType<typeof fixture>) => { delete recipe.lab!.outcomes[0].skillId },
    (recipe: ReturnType<typeof fixture>) => { recipe.lab!.outcomes[0].skillId = 'unknown' },
    (recipe: ReturnType<typeof fixture>) => { recipe.skills![0].coverage = 'reference' },
    (recipe: ReturnType<typeof fixture>) => { recipe.skills!.push({ ...recipe.skills![0] }) },
    (recipe: ReturnType<typeof fixture>) => { recipe.skills!.push({ ...recipe.skills![0], id: 'unimplemented-skill' }) },
  ]) {
    const recipe = fixture()
    mutate(recipe)
    assert.equal(compiledRecipeSchema.safeParse(recipe).success, false)
  }
})
