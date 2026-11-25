import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { readRoute } from '../src/domain/routes.ts'
import { filterRecipes, orderHomeRecipes, recipeHarness } from '../src/domain/catalog.ts'
import { getRecipeScenario } from '../src/content/scenarios.ts'
import { compiledRecipeSchema } from '../src/domain/validation.ts'

const recipes = compiledRecipeSchema.array().parse(JSON.parse(readFileSync(new URL('../src/generated/recipes.json', import.meta.url), 'utf8')))

test('harness uses native Topics unless Additional settings exposes Web browsing', () => {
  assert.equal(recipeHarness({}), 'Copilot Harness')
  for (const topics of [false, true]) {
    assert.equal(recipeHarness({ harnessFeatures: { topics, additionalSettingsWebBrowsing: false } }), topics ? 'Standard Harness' : 'Copilot Harness')
    assert.equal(recipeHarness({ harnessFeatures: { topics, additionalSettingsWebBrowsing: true } }), 'Copilot Chat')
  }
})

test('home, agents and legacy catalogue links have distinct routes', () => {
  for (const hash of ['', '#', '#/']) assert.deepEqual(readRoute(hash), { kind: 'home' })
  for (const hash of ['#/agents', '#/agents/', '#/recipes', '#/recipes/']) assert.deepEqual(readRoute(hash), { kind: 'agents', search: '' })
  assert.deepEqual(readRoute('#/agents?search=public%20services'), { kind: 'agents', search: 'public services' })
  for (const hash of ['#/scenarios', '#/scenarios/']) assert.deepEqual(readRoute(hash), { kind: 'scenarios' })
})

test('home introduces the simplest recipe first without changing the manifest or dropping new recipes', () => {
  const original = [...recipes]
  const extra = { ...recipes[0], id: 'future-recipe', title: 'Future recipe' }
  const ordered = orderHomeRecipes([...recipes, extra])
  const originals = ['citizen-qa', 'document-processing-routing', 'upskilling-recommendation', 'benefit-eligibility']
  assert.deepEqual(ordered.map(recipe => recipe.id), [...originals, ...recipes.filter(recipe => !originals.includes(recipe.id)).map(recipe => recipe.id), extra.id])
  assert.deepEqual(recipes, original)
  assert.deepEqual(orderHomeRecipes([]), [])
  assert.deepEqual(orderHomeRecipes([extra]), [extra])
  assert.equal(getRecipeScenario(extra), undefined)
})

test('each home scenario explains the challenge, experiment, learning and simulation boundary', () => {
  for (const recipe of recipes) {
    const home = getRecipeScenario(recipe)?.home
    assert.ok(home, recipe.id)
    for (const text of Object.values(home)) {
      assert.ok(text.trim().length > 20)
      assert.ok(text.length <= 200, 'Home summaries must remain scannable')
    }
    assert.ok(filterRecipes(recipes, home.challenge).some(item => item.id === recipe.id))
    assert.ok(filterRecipes(recipes, home.experiment).some(item => item.id === recipe.id))
  }
})

test('recipe deep links and invalid paths retain their handling', () => {
  assert.deepEqual(readRoute('#/recipes/citizen-qa'), { kind: 'recipe', id: 'citizen-qa' })
  assert.deepEqual(readRoute('#/recipes/example%20agent/'), { kind: 'recipe', id: 'example agent' })
  for (const hash of ['#/recipes/%E0%A4%A', '#/unknown', '#/recipes/a/b']) assert.deepEqual(readRoute(hash), { kind: 'not-found' })
})

test('catalogue includes every recipe and does not mutate manifest order when sorted', () => {
  const first = recipes[0]
  assert.ok(first)
  const multiple = [first, { ...first, id: 'another-agent', title: 'Another agent' }]
  const result = filterRecipes(multiple, ' ')
  assert.equal(result.length, multiple.length)
  result.reverse()
  assert.equal(multiple[0], first)
  assert.deepEqual(filterRecipes([], ''), [])
})

test('catalogue search matches names, industries, summaries and learning goals without case sensitivity', () => {
  const first = recipes[0]
  assert.ok(first)
  for (const query of [first.title.toUpperCase(), `  ${first.industry}  `, first.agent.name, first.learningGoals[0]]) {
    assert.ok(filterRecipes(recipes, query).some(recipe => recipe.id === first.id))
  }
  assert.deepEqual(filterRecipes(recipes, 'no-such-agent-zyxw'), [])
  assert.deepEqual(filterRecipes(recipes, `${first.title} no-such-agent-zyxw`), [])
})
