import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { compiledRecipeSchema } from '../src/domain/validation.ts'
import { allCategories, catalogOptions, compareCategories, getScenarioEntries, matchesCategories } from '../src/domain/catalog.ts'
import { readRoute, recipeHref } from '../src/domain/routes.ts'

const recipes = compiledRecipeSchema.array().parse(JSON.parse(readFileSync(new URL('../src/generated/recipes.json', import.meta.url), 'utf8')))

test('discovery retains story-only entries and eligible standalone recipes without inventing stories', () => {
  const extra = { ...recipes[0], id: 'future-agent', title: 'Future agent', scenario: undefined }
  const entries = getScenarioEntries([extra])
  assert.equal(entries.find(item => item.id === extra.id)?.recipe, extra)
  assert.equal(entries.find(item => item.id === extra.id)?.story, undefined)
  assert.ok(entries.some(entry => entry.story && !entry.recipe))
  const draft = { ...extra, status: 'draft' as const }
  assert.ok(!getScenarioEntries([draft]).some(entry => entry.id === draft.id))
  assert.ok(getScenarioEntries([draft], true).some(entry => entry.recipe === draft))
})

test('a simulator link opens the preview for its recipe and normal recipe links keep the build entry', () => {
  for (const id of ['citizen-qa', 'example agent']) {
    const preview = recipeHref(id, 'preview')
    assert.deepEqual(readRoute(`${preview}/`), { kind: 'recipe', id, entryMode: 'preview' })
    assert.deepEqual(readRoute(recipeHref(id)), { kind: 'recipe', id })
  }
  for (const invalid of ['#/recipes/%ZZ/preview', '#/recipes/test/preview/other', '#/recipes/test/previewing']) {
    assert.deepEqual(readRoute(invalid), { kind: 'not-found' })
  }
})

test('category filters combine, use available metadata and preserve unclassified stories by default', () => {
  const a = { difficulty: 'beginner', industry: 'Travel' } as const
  const b = { difficulty: 'intermediate', industry: 'Finance' } as const
  assert.deepEqual(catalogOptions([b, a, a]), { difficulties: ['Beginner', 'Intermediate'], industries: ['Finance', 'Travel'] })
  assert.equal(matchesCategories(undefined, allCategories), true)
  const filters = { difficulty: 'Beginner', industry: 'Travel' }
  assert.equal(matchesCategories(a, filters), true)
  assert.equal(matchesCategories(undefined, filters), false)
  assert.equal(matchesCategories(b, { ...filters, industry: 'Finance' }), false)
  assert.equal(matchesCategories(a, { ...filters, industry: 'Finance' }), false)
  assert.ok(compareCategories(a, b, 'difficulty') < 0)
  assert.ok(compareCategories(a, b, 'industry') > 0)
  assert.ok(compareCategories(undefined, a, 'difficulty') > 0)
})

test('only dialogs for available recipes offer a single primary recipe link to the guided Build entry', async () => {
  const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' })
  try {
    const { ScenarioExplorer, ScenarioDetails } = await server.ssrLoadModule('/src/components/ScenarioExplorer.tsx')
    const catalogue = renderToStaticMarkup(createElement(ScenarioExplorer, { recipes }))
    assert.equal(catalogue.match(/aria-haspopup="dialog"/g)?.length, getScenarioEntries(recipes).length)
    assert.doesNotMatch(catalogue, /href="#\/recipes\/|<dialog|PUBLIC SERVICES &amp;/)
    assert.doesNotMatch(catalogue, /Scenario navigation|Browse agents/)
    for (const entry of getScenarioEntries(recipes)) {
      const detail = renderToStaticMarkup(createElement(ScenarioDetails, { entry, onClose: () => {} }))
      assert.ok(detail.includes('<dialog'))
      if (entry.story) for (const label of ['The problem', 'Why it matters', 'How an agent helps', 'Start small', 'How to measure progress']) assert.ok(detail.includes(label))
      if (entry.recipe) {
        assert.equal(detail.match(/href="#\/recipes\//g)?.length, 1)
        assert.ok(detail.includes(`class="button primary" href="${recipeHref(entry.recipe.id)}"`))
        assert.equal(detail.match(/Cook this recipe/g)?.length, 1)
        assert.doesNotMatch(detail, /Open in simulator/)
      }
    }
    const storyOnly = getScenarioEntries([])[0]
    const detail = renderToStaticMarkup(createElement(ScenarioDetails, { entry: storyOnly, onClose: () => {} }))
    assert.doesNotMatch(detail, /Cook this recipe|Open in simulator|href="#\/recipes\//)
  } finally {
    await server.close()
  }
})
