import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCopilotRecipes } from '../scripts/validate-copilot-recipes.ts'

const project = fileURLToPath(new URL('../', import.meta.url))
const template = await readFile(join(project, 'copilot', 'recipes', 'rle-starter.json'), 'utf8')

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(project, 'tests', '.authoring-'))
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('Copilot build-time validation uses the same schema and preserves the complete recipe', async () => {
  const recipes = await validateCopilotRecipes()
  assert.ok(recipes.length > 0)
  assert.deepEqual(recipes.find(recipe => recipe.id === 'rle-starter'), JSON.parse(template))
})

test('JSON recipe loading rejects duplicate keys instead of silently replacing content', async () => {
  await fixture(async root => {
    await writeFile(join(root, 'rle-starter.json'), template.replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,'))
    await assert.rejects(() => validateCopilotRecipes(root), /unique|duplicate/i)
  })
})

test('JSON recipe validation rejects broken references, wrong filenames and invalid UTF-8', async () => {
  await fixture(async root => {
    await writeFile(join(root, 'rle-starter.json'), template.replace('"requiredSources": ["northstar-task"]', '"requiredSources": ["missing"]'))
    await assert.rejects(() => validateCopilotRecipes(root), /Unknown source reference/)
    await writeFile(join(root, 'rle-starter.json'), template.replace('"id": "rle-starter"', '"id": "another-recipe"'))
    await assert.rejects(() => validateCopilotRecipes(root), /filename must match/)
    await writeFile(join(root, 'rle-starter.json'), Buffer.from([0xc3, 0x28]))
    await assert.rejects(() => validateCopilotRecipes(root), /Invalid JSON/)
  })
})

test('JSON recipe validation rejects empty catalogs, oversized files and non-file entries', async () => {
  await fixture(async root => {
    await assert.rejects(() => validateCopilotRecipes(root), /no JSON recipes/)
    await writeFile(join(root, 'rle-starter.json'), ' '.repeat(262_145))
    await assert.rejects(() => validateCopilotRecipes(root), /exceeds/)
    await rm(join(root, 'rle-starter.json'))
    await mkdir(join(root, 'rle-starter.json'))
    await assert.rejects(() => validateCopilotRecipes(root), /regular files/)
  })
})
