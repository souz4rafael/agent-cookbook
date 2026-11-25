import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { authorMain, authoringCatalog, checkDrafts, packAuthoring, scaffoldRecipe } from '../scripts/recipe-author.ts'
import { compileRecipes } from '../scripts/compile-recipes.ts'

const project = fileURLToPath(new URL('../', import.meta.url))

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(project, 'tests', '.authoring-'))
  try {
    for (const segments of [['recipes'], ['copilot', 'recipes'], ['foundry', 'recipes'], ['authoring']]) {
      await mkdir(join(root, ...segments.slice(0, -1)), { recursive: true })
      await cp(join(project, ...segments), join(root, ...segments), { recursive: true })
    }
    for (const file of ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt']) await cp(join(project, file), join(root, file))
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('one authoring catalog discovers all three product-specific recipe formats', async () => {
  const catalog = await authoringCatalog(project)
  assert.ok(catalog.studio.some(recipe => recipe.id === 'citizen-qa'))
  assert.ok(catalog.copilot.some(recipe => recipe.id === 'rle-starter'))
  assert.ok(catalog.foundry.some(recipe => recipe.id === 'industry-news-trend-scanner'))
})

test('scaffolds validate in isolation and never add recipes to learner catalogs', async () => {
  await fixture(async root => {
    const before = await authoringCatalog(root)
    for (const [product, template] of [
      ['studio', 'citizen-qa'], ['copilot', 'rle-starter'], ['foundry', 'industry-news-trend-scanner'],
    ] as const) {
      const path = await scaffoldRecipe(root, product, 'new-learning-recipe', template)
      assert.ok(path.startsWith(join(root, 'recipe-drafts', product)))
      const result = await checkDrafts(product, join(root, 'recipe-drafts', product))
      assert.equal(result.recipes, 1)
      if (product === 'studio') {
        assert.ok(result.cases! > 0)
        const draft = parse(await readFile(join(path, 'recipe.yaml'), 'utf8'))
        assert.equal(draft.status, 'draft')
        assert.equal(draft.id, 'new-learning-recipe')
        assert.deepEqual(await compileRecipes(join(root, 'recipe-drafts', product), { allowEmpty: true }), [])
      } else {
        assert.equal(result.cases, null)
        assert.match(result.coverage, /no runtime behavior evaluation/)
      }
      await assert.rejects(() => scaffoldRecipe(root, product, 'new-learning-recipe', template), /exist/i)
    }
    assert.deepEqual(await authoringCatalog(root), before)
  })
})

test('Studio draft check executes expectations including a source-independent skill outcome', async () => {
  await fixture(async root => {
    const destination = await scaffoldRecipe(root, 'studio', 'notice-exercise', 'civil-protection-guide')
    const directory = join(root, 'recipe-drafts', 'studio')
    assert.ok((await checkDrafts('studio', directory)).cases! > 0)
    const file = join(destination, 'recipe.yaml')
    const draft = parse(await readFile(file, 'utf8'))
    draft.lab.cases[0].expected.contains = ['Impossible expected result for a negative authoring check']
    await writeFile(file, stringify(draft))
    await assert.rejects(() => checkDrafts('studio', directory), /behaviour does not match/)
  })
})

test('scaffold rejects traversal, reserved filenames, existing source IDs and unknown templates', async () => {
  await fixture(async root => {
    for (const id of ['../escape', '..\\escape', 'NUL', 'con', 'has space', 'a'.repeat(65)]) {
      await assert.rejects(() => scaffoldRecipe(root, 'studio', id, 'citizen-qa'), /identifier|ID|filename/)
    }
    await assert.rejects(() => scaffoldRecipe(root, 'studio', 'citizen-qa', 'citizen-qa'), /already exists/)
    await assert.rejects(() => scaffoldRecipe(root, 'foundry', 'new-recipe', 'absent-template'), /Unknown Foundry template/)
    await assert.rejects(() => authorMain(['scaffold', 'wrong-product', 'new-recipe', 'template'], root), /Usage/)
  })
})

test('portable pack includes instructions, all schemas and examples without claiming native compatibility', async () => {
  await fixture(async root => {
    const output = await packAuthoring(root)
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.formatVersion, 1)
    assert.match(manifest.compatibility.cowork, /not a native plugin/)
    assert.match(manifest.schemaWarning, /structural only/)
    assert.match(manifest.rights, /prior written permission/)
    assert.match(await readFile(join(output, 'LICENSE.txt'), 'utf8'), /not offered under an open-source/)
    const source = await authoringCatalog(root)
    assert.equal(manifest.templates.length, Object.values(source).reduce((sum, recipes) => sum + recipes.length, 0))
    for (const [path, expected] of Object.entries(manifest.fingerprints)) {
      const bytes = await readFile(join(output, ...path.split('/')))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), expected)
    }
    for (const product of ['studio', 'copilot', 'foundry'] as const) {
      assert.ok((await checkDrafts(product, join(output, 'examples', product))).recipes > 0)
    }
    assert.equal(await readFile(join(output, 'instructions.txt'), 'utf8'), await readFile(join(root, 'authoring', 'recipe-author.txt'), 'utf8'))
  })
})
