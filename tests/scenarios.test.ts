import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { businessScenarios, getScenarioRecipe, scenarioLibraryUrl } from '../src/content/scenarios.ts'
import { compiledRecipeSchema } from '../src/domain/validation.ts'

const recipes = compiledRecipeSchema.array().parse(JSON.parse(readFileSync(new URL('../src/generated/recipes.json', import.meta.url), 'utf8')))

test('all catalogue scenarios have complete business narratives and truthful source links', () => {
  assert.deepEqual(businessScenarios.map(scenario => scenario.id), ['citizen-qa', 'document-processing-routing', 'upskilling-recommendation', 'benefit-eligibility', 'customer-service-optimize'])
  assert.equal(new Set(businessScenarios.map(scenario => scenario.id)).size, businessScenarios.length)
  for (const scenario of businessScenarios) {
    for (const field of ['name', 'headline', 'summary', 'problem', 'impact', 'approach', 'startSmall', 'potentialValue', 'measure', 'boundary'] as const) {
      assert.ok(scenario[field].trim().length > 0, `${scenario.id} needs ${field}`)
    }
    const source = new URL(scenario.sourceUrl)
    if (scenario.id === 'customer-service-optimize') {
      assert.equal(source.href, 'https://copilotstudio.microsoft.com/')
      assert.equal(scenario.sourceLabel, 'Copilot Studio product')
    } else {
      assert.equal(source.origin, new URL(scenarioLibraryUrl).origin)
      assert.equal(source.pathname, `/en-gb/scenario-library/government/${scenario.id}-agent/`)
    }
  }
})

test('only available published recipes receive interactive scenario links', () => {
  const citizen = businessScenarios[0]
  assert.equal(getScenarioRecipe(citizen, recipes)?.id, 'citizen-qa')
  assert.equal(getScenarioRecipe(citizen, [])?.id, undefined)
  const recipe = recipes.find(item => item.id === 'citizen-qa')
  assert.ok(recipe)
  assert.equal(getScenarioRecipe(citizen, [{ ...recipe, status: 'draft' }]), undefined)
  assert.equal(getScenarioRecipe(businessScenarios[1], recipes)?.id, 'document-processing-routing')
  assert.equal(getScenarioRecipe(businessScenarios[2], recipes)?.id, 'upskilling-recommendation')
  assert.equal(getScenarioRecipe(businessScenarios[3], recipes)?.id, 'benefit-eligibility')
  assert.equal(getScenarioRecipe(businessScenarios[4], recipes)?.id, 'customer-service-optimize')
})

test('Optimize catalogue entry retains the bounded skill-based exercise without fake connections', () => {
  const scenario = businessScenarios.find(item => item.id === 'customer-service-optimize')!
  const recipe = getScenarioRecipe(scenario, recipes)
  assert.ok(recipe)
  assert.equal(recipe.sourceUrl, scenario.sourceUrl)
  assert.equal(recipe.title, scenario.name)
  assert.ok(!recipe.title.includes('(local)'))
  assert.equal(recipe.skills?.length, 7)
  assert.equal(recipe.skills.filter(skill => skill.coverage === 'simulated').length, 1)
  assert.equal(recipe.lab?.cases.length, 15)
  assert.deepEqual([recipe.knowledge, recipe.tools, recipe.connections], [[], [], []])
  assert.match(scenario.boundary, /six other skills are references/)
})

test('citizen example has the sources and interactive cases described by the page', () => {
  const recipe = getScenarioRecipe(businessScenarios[0], recipes)
  assert.ok(recipe)
  assert.equal(recipe.sourceUrl, businessScenarios[0].sourceUrl)
  assert.ok(recipe.lab?.cases.length)
  assert.ok(recipe.test.suggestedQuestions.length)
  assert.deepEqual(new Set(recipe.knowledge.map(source => source.id)), new Set(['required-documents', 'processing-deadlines', 'appeals-contact']))
  assert.ok(recipe.tools.some(tool => tool.id === 'create-citizen-case'))
})
