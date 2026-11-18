import assert from 'node:assert/strict'
import test from 'node:test'
import { demoProject, featuredModels, navigationSections, searchHome } from '../src/foundry/home.ts'

test('Foundry home exposes only the New Foundry navigation structure', () => {
  assert.deepEqual(navigationSections.map(section => section.title), ['', 'Create', 'Observe', 'Improve'])
  assert.deepEqual(navigationSections.flatMap(section => [...section.items]), [
    'Home', 'Catalog', 'Agents', 'Models', 'Services', 'Tools', 'Knowledge', 'Memory',
    'Guardrails', 'Monitor', 'Traces', 'Data', 'Evaluations', 'Training',
  ])
})

test('Foundry preview endpoints are reserved fictional addresses, not Azure resources', () => {
  for (const endpoint of [demoProject.endpoint, demoProject.openAIEndpoint]) {
    assert.ok(new URL(endpoint).hostname.endsWith('.invalid'))
  }
  assert.equal(demoProject.name, 'agents-cookbook')
})

test('home search covers navigation, model names and publishers without calling a service', () => {
  assert.deepEqual(searchHome('  GUARDRAILS '), [{ name: 'Guardrails', category: 'Page', description: 'Create' }])
  assert.equal(searchHome('OpenAI').length, 2)
  assert.equal(searchHome('gpt-6.2-sol')[0]?.category, 'Model')
  assert.deepEqual(searchHome('no-such-item'), [])
  assert.equal(searchHome('  ').length, navigationSections.reduce((count, section) => count + section.items.length, 0) + featuredModels.length)
})

test('featured catalog snapshot has unique models and explicit publisher marks', () => {
  assert.equal(new Set(featuredModels.map(model => model.name)).size, featuredModels.length)
  assert.ok(featuredModels.every(model => model.name && model.publisher && model.icon))
})
