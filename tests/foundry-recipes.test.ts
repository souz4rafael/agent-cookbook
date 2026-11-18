import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { filterFoundryRecipes, foundryRecipeLimits, foundryRecipeSchema, loadFoundryRecipes } from '../src/foundry/recipes/schema.ts'
import type { FoundryRecipe } from '../src/foundry/recipes/schema.ts'
import {
  createFoundryDraft, decodeFoundryDrafts, encodeFoundryDrafts, foundryDraftStorageKey,
  readFoundryRoute, recipeHref, validateFoundryDraft, validateFoundryName,
} from '../src/foundry/recipes/state.ts'
import { builderStorageKey } from '../src/copilot/builder/state.ts'
import { validateFoundryRecipeFiles } from '../scripts/validate-foundry-recipes.ts'

const directory = new URL('../foundry/recipes/', import.meta.url)
const scanner = foundryRecipeSchema.parse(JSON.parse(readFileSync(new URL('industry-news-trend-scanner.json', directory), 'utf8')))

const museum: FoundryRecipe = {
  ...structuredClone(scanner),
  id: 'museum-labels',
  title: 'Museum Labels',
  summary: 'Draft fictional exhibit labels from sample notes.',
  publisher: 'Cookbook example',
  createdOn: '2026-11-18',
  featuredOrder: 2,
  tools: [{ id: 'sample-files', name: 'Fictional exhibit notes', icon: 'file' }],
  sections: [{
    id: 'what-it-does',
    title: 'Exhibit label drafts',
    blocks: [{ kind: 'paragraph', text: 'Write a **reviewable** label from fictional notes.' }, { kind: 'list', items: ['Name the object.', 'Mark uncertain provenance.'] }],
  }],
  manifest: {
    defaultName: 'museum-labels',
    instructions: 'Draft labels from fictional notes. Do not invent provenance or publish anything.',
    model: 'example-model',
    toolIds: ['sample-files'],
  },
}

test('all automatically discovered Foundry recipes validate and match their filenames', () => {
  const files = readdirSync(directory).filter(name => name.endsWith('.json')).sort()
  assert.ok(files.length > 0)
  const recipes = loadFoundryRecipes(files.map(file => JSON.parse(readFileSync(new URL(file, directory), 'utf8'))))
  assert.deepEqual(recipes.map(recipe => `${recipe.id}.json`), files)
})

test('initial manifest preserves the reference metadata, text, tool identity, and instructions', () => {
  assert.equal(scanner.title, 'Industry News & Trend Scanner')
  assert.equal(scanner.publisher, 'Microsoft')
  assert.equal(scanner.createdOn, '2026-06-15')
  assert.equal(scanner.source.version, '2')
  assert.equal(scanner.tools[0].name, 'Grounding with Bing Search')
  assert.equal(scanner.tools[0].icon, 'bing')
  assert.deepEqual(scanner.sections.map(section => section.title), [
    'What this agent manifest does', 'The tools it uses', 'Use this agent manifest to understand',
  ])
  assert.match(scanner.manifest.instructions, /Run at least 4 distinct searches/)
  assert.match(scanner.manifest.instructions, /default: last 7 days/)
  assert.match(scanner.manifest.instructions, /cannot send, email, or post/)
  assert.match(scanner.source.licenseText, /Distributable Code/)
})

test('an unrelated second recipe works with the same registry, filtering, routes, and drafts', () => {
  const recipes = loadFoundryRecipes([scanner, museum])
  assert.equal(recipes.length, 2)
  assert.deepEqual(filterFoundryRecipes(recipes, 'museum notes', 'featured').map(recipe => recipe.id), ['museum-labels'])
  assert.deepEqual(filterFoundryRecipes(recipes, ' BING ', 'featured').map(recipe => recipe.id), [scanner.id])
  assert.deepEqual(filterFoundryRecipes(recipes, '', 'newest').map(recipe => recipe.id), ['museum-labels', scanner.id])
  assert.deepEqual(filterFoundryRecipes(recipes, '', 'name-desc').map(recipe => recipe.id), ['museum-labels', scanner.id])
  assert.deepEqual(filterFoundryRecipes(recipes, '', 'name-asc').map(recipe => recipe.id), [scanner.id, 'museum-labels'])
  assert.deepEqual(filterFoundryRecipes(recipes, 'no-such-item', 'featured'), [])
  assert.deepEqual(readFoundryRoute(recipeHref(museum.id)), { kind: 'recipe', recipeId: museum.id })
  const draft = createFoundryDraft(museum, 'exhibit-draft', [])
  assert.equal(draft.instructions, museum.manifest.instructions)
  assert.deepEqual(draft.toolIds, ['sample-files'])
  assert.deepEqual(decodeFoundryDrafts(encodeFoundryDrafts([draft], recipes), recipes), [draft])
  assert.equal(recipes[0].id, scanner.id, 'Filtering must not reorder the source registry')
})

test('recipe schema rejects duplicates, invalid references, unsupported metadata, and unsafe links', () => {
  const invalidCases: ((recipe: FoundryRecipe) => void)[] = [
    recipe => { recipe.tools.push({ ...recipe.tools[0] }) },
    recipe => { recipe.sections.push(structuredClone(recipe.sections[0])) },
    recipe => { recipe.manifest.toolIds.push(recipe.manifest.toolIds[0]) },
    recipe => { recipe.manifest.toolIds = ['missing'] },
    recipe => { recipe.id = '../escape' },
    recipe => { recipe.createdOn = '2026-13-40' },
    recipe => { recipe.source.licenseUrl = 'javascript:alert(1)' },
    recipe => { recipe.source.url = 'https://example.invalid/' },
    recipe => { recipe.source.url = 'https://password@ai.azure.com/' },
    recipe => { recipe.revision = 0 },
    recipe => { recipe.manifest.instructions = 'api_key=abcdefghijklmnopqrstuvwxyz' },
    recipe => { recipe.summary = ' ' },
  ]
  for (const change of invalidCases) {
    const value = structuredClone(scanner)
    change(value)
    assert.equal(foundryRecipeSchema.safeParse(value).success, false)
  }
  assert.equal(foundryRecipeSchema.safeParse({ ...scanner, run: 'eval()' }).success, false)
  assert.throws(() => loadFoundryRecipes([scanner, scanner]), /Duplicate/)
  assert.throws(() => loadFoundryRecipes([{ ...scanner, schemaVersion: 2 }]), /Invalid/)
})

test('local named drafts are independent and cannot overwrite a duplicate name', () => {
  const before = JSON.stringify(scanner)
  const first = createFoundryDraft(scanner, scanner.manifest.defaultName, [])
  const second = createFoundryDraft(scanner, 'another-scan', [first])
  assert.notEqual(first.id, second.id)
  assert.equal(validateFoundryName(first.name, [first], first.id), null)
  assert.match(validateFoundryName(first.name, [first]) ?? '', /already exists/)
  assert.throws(() => createFoundryDraft(scanner, first.name, [first]), /already exists/)
  for (const name of ['', ' ', '-start', 'end-', 'two--hyphens', 'Name', 'x'.repeat(65), 'agent\n']) {
    assert.ok(validateFoundryName(name, []), name)
  }
  first.instructions = 'Edited local draft.'
  first.toolIds.length = 0
  assert.equal(second.instructions, scanner.manifest.instructions)
  assert.deepEqual(second.toolIds, scanner.manifest.toolIds)
  assert.equal(JSON.stringify(scanner), before)
})

test('draft validation rejects mismatched recipes and revisions without resetting saved data', () => {
  const draft = createFoundryDraft(scanner, 'scanner', [])
  assert.throws(() => validateFoundryDraft(museum, draft), /does not match/)
  assert.throws(() => validateFoundryDraft({ ...scanner, revision: 2 }, draft), /does not match/)
  assert.throws(() => validateFoundryDraft(scanner, { ...draft, toolIds: ['unknown'] }), /unknown tools/)
  assert.throws(() => validateFoundryDraft(scanner, { ...draft, model: 'another-model' }), /model/)
  assert.throws(() => validateFoundryDraft(scanner, { ...draft, instructions: ' ' }), /Invalid/)
})

test('storage is isolated, round-trips multiple drafts, and rejects corrupt or oversized data', () => {
  const first = createFoundryDraft(scanner, 'scanner', [])
  const second = createFoundryDraft(museum, 'labels', [first])
  const recipes = [scanner, museum]
  assert.notEqual(foundryDraftStorageKey, builderStorageKey)
  assert.deepEqual(decodeFoundryDrafts(null, recipes), [])
  assert.deepEqual(decodeFoundryDrafts(encodeFoundryDrafts([first, second], recipes), recipes), [first, second])
  assert.throws(() => decodeFoundryDrafts('{', recipes), SyntaxError)
  assert.throws(() => decodeFoundryDrafts('null', recipes), /invalid/)
  assert.throws(() => decodeFoundryDrafts(JSON.stringify({ version: 2, drafts: [] }), recipes), /invalid/)
  assert.throws(() => encodeFoundryDrafts([first, first], recipes), /duplicate/)
  assert.throws(() => decodeFoundryDrafts(encodeFoundryDrafts([second], recipes), [scanner]), /no longer available/)
  assert.throws(() => decodeFoundryDrafts('x'.repeat(foundryRecipeLimits.storage + 1), recipes), /storage limit/)
})

test('hash routes support reload and history without accepting malformed or unrelated paths', () => {
  assert.deepEqual(readFoundryRoute(''), { kind: 'home' })
  assert.deepEqual(readFoundryRoute('#/home'), { kind: 'home' })
  assert.deepEqual(readFoundryRoute('#/catalog/agents'), { kind: 'catalog' })
  assert.deepEqual(readFoundryRoute(recipeHref(scanner.id)), { kind: 'recipe', recipeId: scanner.id })
  for (const route of ['#/classic', '#/catalog/models', '#/catalog/agents/%ZZ', '#/catalog/agents/../home', '#/catalog/agents/id/extra']) {
    assert.deepEqual(readFoundryRoute(route), { kind: 'not-found' })
  }
})

test('prebuild validation rejects malformed JSON, empty catalogs, and mismatched filenames', async () => {
  const root = await mkdtemp(join(fileURLToPath(new URL('./', import.meta.url)), '.foundry-validation-'))
  const url = pathToFileURL(root + sep)
  try {
    await assert.rejects(validateFoundryRecipeFiles(url), /at least one recipe/)
    const file = join(root, 'wrong-name.json')
    await writeFile(file, '{')
    await assert.rejects(validateFoundryRecipeFiles(url), /Invalid JSON in wrong-name.json/)
    await writeFile(file, JSON.stringify(scanner))
    await assert.rejects(validateFoundryRecipeFiles(url), /must be in industry-news-trend-scanner.json/)
    await rm(file)
    await writeFile(join(root, `${scanner.id}.json`), JSON.stringify(scanner))
    assert.deepEqual((await validateFoundryRecipeFiles(url)).map(recipe => recipe.id), [scanner.id])
  } finally { await rm(root, { recursive: true, force: true }) }
})
