import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { compileLocalRecipes } from '../scripts/compile-local-recipes.ts'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { resolveConfig } from 'vite'

const project = fileURLToPath(new URL('../', import.meta.url))

test('only opt-in development resolves the local manifest and deployment mode is refused', async () => {
  const options = { root: project, configFile: join(project, 'vite.config.ts'), logLevel: 'silent' as const }
  const local = await resolveConfig({ ...options, mode: 'local-recipes' }, 'serve')
  assert.ok(local.resolve.alias.some(alias => alias.find === './generated/recipes.json' && alias.replacement.endsWith('local-recipes.json')))
  const normal = await resolveConfig(options, 'build')
  assert.ok(!normal.resolve.alias.some(alias => alias.find === './generated/recipes.json'))
  await assert.rejects(resolveConfig({ ...options, mode: 'local-recipes' }, 'build'), /preview-only/)
})

test('local catalogue combines explicit roots without changing the public catalogue', async () => {
  const root = await mkdtemp(join(project, 'tests', '.local-recipes-'))
  try {
    for (const folder of ['recipes', 'local-recipes']) {
      await mkdir(join(root, folder))
      await cp(join(project, 'recipes', 'citizen-qa'), join(root, folder, 'citizen-qa'), { recursive: true })
    }
    await assert.rejects(compileLocalRecipes(root), /conflicts with a public recipe/)
    const localPath = join(root, 'local-recipes', 'citizen-qa')
    const recipe = parse(await readFile(join(localPath, 'recipe.yaml'), 'utf8'))
    recipe.id = 'local-fixture'
    await mkdir(join(root, 'local-recipes', 'local-fixture'))
    await cp(localPath, join(root, 'local-recipes', 'local-fixture'), { recursive: true })
    await rm(localPath, { recursive: true })
    await writeFile(join(root, 'local-recipes', 'local-fixture', 'recipe.yaml'), stringify(recipe))
    assert.deepEqual((await compileLocalRecipes(root)).map(item => item.id), ['citizen-qa', 'local-fixture'])
    assert.deepEqual((await compileRecipes(join(root, 'recipes'))).map(item => item.id), ['citizen-qa'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('local preview still works after the final local recipe is promoted', async () => {
  const root = await mkdtemp(join(project, 'tests', '.local-recipes-'))
  try {
    await mkdir(join(root, 'recipes'))
    await cp(join(project, 'recipes', 'citizen-qa'), join(root, 'recipes', 'citizen-qa'), { recursive: true })
    assert.deepEqual((await compileLocalRecipes(root)).map(item => item.id), ['citizen-qa'])
    await mkdir(join(root, 'local-recipes'))
    assert.deepEqual((await compileLocalRecipes(root)).map(item => item.id), ['citizen-qa'])
    await assert.rejects(compileRecipes(join(root, 'local-recipes')), /no published recipes/)
    await mkdir(join(root, 'local-recipes', 'broken-recipe'))
    await assert.rejects(compileLocalRecipes(root), /recipe.yaml/, 'Invalid local recipes must not be silently skipped')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
