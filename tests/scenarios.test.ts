import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { businessScenarios, getBusinessScenarios, getRecipeScenario, getScenarioRecipe, scenarioLibraryUrl } from '../src/content/scenarios.ts'
import { compiledRecipeSchema } from '../src/domain/validation.ts'

const recipes = compiledRecipeSchema.array().parse(JSON.parse(readFileSync(new URL('../src/generated/recipes.json', import.meta.url), 'utf8')))

test('all catalogue scenarios have complete business narratives and truthful source links', () => {
  assert.deepEqual(businessScenarios.map(scenario => scenario.id), ['citizen-qa', 'document-processing-routing', 'upskilling-recommendation', 'benefit-eligibility'])
  assert.equal(new Set(businessScenarios.map(scenario => scenario.id)).size, businessScenarios.length)
  for (const scenario of businessScenarios) {
    for (const field of ['name', 'headline', 'summary', 'problem', 'impact', 'approach', 'startSmall', 'potentialValue', 'measure', 'boundary'] as const) {
      assert.ok(scenario[field].trim().length > 0, `${scenario.id} needs ${field}`)
    }
    const source = new URL(scenario.sourceUrl)
    assert.equal(source.origin, new URL(scenarioLibraryUrl).origin)
    assert.equal(source.pathname, `/en-gb/scenario-library/government/${scenario.id}-agent/`)
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
})

test('recipe-authored stories are validated and indexed from the active catalogue, with an explicit draft opt-in', () => {
  const { id: _id, recipeId: _recipeId, name: _name, summary: _summary, icon: _icon, sourceUrl: _url, ...editorial } = businessScenarios[0]
  const scenario = { ...editorial, group: {journey:'Fictional journey', perspective:'operations'} }
  const draft = compiledRecipeSchema.parse({ ...recipes[0], id: 'example-draft', scenario, status: 'draft' })
  assert.deepEqual(getBusinessScenarios([draft]), businessScenarios)
  const list = getBusinessScenarios([draft], true)
  assert.equal(list.length, businessScenarios.length + 1)
  assert.equal(list.at(-1)?.recipeId, draft.id)
  assert.deepEqual(list.at(-1), getRecipeScenario(draft))
  assert.equal(getScenarioRecipe(list.at(-1)!, [draft], true), draft)
  const published = compiledRecipeSchema.parse({ ...draft, status:'published' })
  assert.deepEqual(getBusinessScenarios([published]), list)
  assert.equal(compiledRecipeSchema.safeParse({ ...draft, scenario: {...scenario, home: {...scenario.home, experiment: 'TBD'}} }).success, false)
  assert.equal(compiledRecipeSchema.safeParse({ ...draft, scenario: {...scenario, group: {...scenario.group, perspective:'invalid'}} }).success, false)
})

test('the 28 public scenarios include four originals, ten complete journey pairs and four Gallery adaptations', () => {
  const stories = getBusinessScenarios(recipes)
  assert.equal(stories.length, 28)
  assert.equal(new Set(stories.map(story => getScenarioRecipe(story, recipes)?.id)).size, 28)
  assert.ok(stories.every(story => getScenarioRecipe(story, recipes)))
  const pairs = new Map<string, string[]>()
  for (const { group } of stories) if (group) pairs.set(group.journey, [...pairs.get(group.journey) ?? [], group.perspective])
  assert.equal(pairs.size, 10)
  for (const roles of pairs.values()) assert.deepEqual(roles.sort(), ['guidance','operations'])
  assert.equal(stories.filter(story => story.id.startsWith('gallery-')).length, 4)
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
