import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { agentProfileSchema, compiledRecipeSchema, recipeSchema, validateRecipeReferences } from '../src/domain/validation.ts'
import type { GuideCondition, Recipe } from '../src/domain/types.ts'

const project = fileURLToPath(new URL('../', import.meta.url))
const source = join(project, 'recipes', 'citizen-qa')
const original = parse(await readFile(join(source, 'recipe.yaml'), 'utf8')) as Recipe

async function fixture(run: (root: string, workspace: string) => Promise<void>): Promise<void> {
  const workspace = await mkdtemp(join(project, 'tests', '.compiler-'))
  try {
    const root = join(workspace, 'recipes')
    await mkdir(root)
    await cp(source, join(root, original.id), { recursive: true })
    await run(root, workspace)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

async function writeRecipe(root: string, recipe: Recipe, folder = recipe.id): Promise<void> {
  await writeFile(join(root, folder, 'recipe.yaml'), stringify(recipe), 'utf8')
}

test('the published recipe compiles deterministically and preserves literal UTF-8 documents', async () => {
  const root = join(project, 'recipes')
  const first = await compileRecipes(root)
  assert.deepEqual(await compileRecipes(root), first)
  assert.equal(first.length, 5)
  const citizen = first.find(recipe => recipe.id === 'citizen-qa')!
  assert.ok(citizen)
  assert.equal(citizen.schemaVersion, 1)
  assert.equal(citizen.revision, 3)
  assert.equal(citizen.title, 'Citizen Q&A agent')
  assert.equal(citizen.agent.name, 'Citizen Services Assistant')
  assert.equal(citizen.facts.length, 3)
  assert.equal(citizen.knowledge.length, 3)
  assert.equal(citizen.connections.length, 2)
  assert.equal(citizen.tools.length, 1)
  assert.ok(citizen.lab)
  assert.equal(citizen.estimatedMinutes, citizen.journey.length)
  assert.ok(citizen.journey.length <= 24)
  assert.ok(compiledRecipeSchema.safeParse(citizen).success)
  for (const document of citizen.knowledge) {
    assert.equal(document.content, await readFile(join(source, ...document.file.split('/')), 'utf8'))
  }
  for (const fact of citizen.facts) {
    const document = citizen.knowledge.find((item) => item.id === fact.documentId)!
    assert.ok(document.content.includes(fact.answer))
    assert.ok(document.content.includes(fact.detail))
  }
})

test('duration is derived from guided steps, replaces legacy estimates and updates with the journey', async () => {
  await fixture(async root => {
    await writeRecipe(root, { ...original, estimatedMinutes: 99 })
    let result = (await compileRecipes(root))[0]
    assert.equal(result.estimatedMinutes, original.journey.length)
    await writeRecipe(root, { ...original, journey: original.journey.slice(0, 3) })
    result = (await compileRecipes(root))[0]
    assert.equal(result.estimatedMinutes, 3)
    assert.equal(compiledRecipeSchema.safeParse({ ...result, estimatedMinutes: 99 }).success, false)
  })
})

test('a new immediate recipe folder is auto-discovered without application changes and sorted', async () => {
  await fixture(async (root) => {
    for (const id of ['zebra-demo', 'alpha-demo']) {
      await cp(source, join(root, id), { recursive: true })
      await writeRecipe(root, { ...original, id, title: `Recipe ${id}` })
    }
    const result = await compileRecipes(root)
    assert.deepEqual(result.map((recipe) => recipe.id), ['alpha-demo', 'citizen-qa', 'zebra-demo'])
    assert.equal(result[2]!.title, 'Recipe zebra-demo')
  })
})

test('valid drafts are validated but excluded from the generated collection', async () => {
  await fixture(async (root) => {
    await cp(source, join(root, 'draft-demo'), { recursive: true })
    await writeRecipe(root, { ...original, id: 'draft-demo', status: 'draft' })
    assert.deepEqual((await compileRecipes(root)).map((recipe) => recipe.id), ['citizen-qa'])
    await rm(join(root, 'draft-demo', 'documents', 'processing-deadlines.txt'))
    await assert.rejects(compileRecipes(root), /draft-demo.*processing-deadlines\.txt/s)
  })
})

test('a build with no published recipes fails, including an empty recipe root', async () => {
  await fixture(async (root) => {
    await writeRecipe(root, { ...original, status: 'draft' })
    await assert.rejects(compileRecipes(root), /no published recipes/)
    await rm(join(root, original.id), { recursive: true })
    await assert.rejects(compileRecipes(root), /no published recipes/)
  })
})

test('malformed YAML and duplicate YAML keys report the exact source file', async () => {
  await fixture(async (root) => {
    const file = join(root, original.id, 'recipe.yaml')
    await writeFile(file, 'id: [broken\nstatus: published\n')
    await assert.rejects(compileRecipes(root), /citizen-qa.*recipe\.yaml.*Invalid YAML/s)
    await writeFile(file, 'id: citizen-qa\nid: duplicate\n')
    await assert.rejects(compileRecipes(root), /recipe\.yaml.*Invalid YAML.*unique/s)
  })
})

test('missing YAML and missing text documents fail with actionable paths', async () => {
  await fixture(async (root) => {
    const folder = join(root, original.id)
    await rm(join(folder, 'documents', 'required-documents.txt'))
    await assert.rejects(compileRecipes(root), /citizen-qa.*documents.*required-documents\.txt/s)
    await rm(join(folder, 'recipe.yaml'))
    await assert.rejects(compileRecipes(root), /citizen-qa.*recipe\.yaml/s)
  })
})

test('all recipe IDs must be unique and match their immediate folder names', async () => {
  await fixture(async (root) => {
    await cp(source, join(root, 'duplicate-demo'), { recursive: true })
    await assert.rejects(compileRecipes(root), /duplicate recipe id.*citizen-qa/)
    await writeRecipe(root, { ...original, id: 'wrong-name' }, 'duplicate-demo')
    await assert.rejects(compileRecipes(root), /id "wrong-name".*folder name "duplicate-demo"/)
  })
})

test('dangling connections, resources, documents, tools and guide references fail at their fields', () => {
  const mutations: [string, (recipe: Recipe) => void][] = [
    ['knowledge.0.connectionId', (recipe) => { recipe.knowledge[0]!.connectionId = 'unknown' }],
    ['knowledge.0.resourceId', (recipe) => { recipe.knowledge[0]!.resourceId = 'citizen-support' }],
    ['tools.0.connectionId', (recipe) => { recipe.tools[0]!.connectionId = 'unknown' }],
    ['tools.0.resourceId', (recipe) => { recipe.tools[0]!.resourceId = 'empty-library' }],
    ['facts.0.documentId', (recipe) => { recipe.facts[0]!.documentId = 'unknown' }],
    ['journey.1.completeWhen.connectionId', (recipe) => { recipe.journey[1]!.completeWhen = { type: 'connection', connectionId: 'unknown' } }],
    ['journey.2.completeWhen.documentId', (recipe) => { recipe.journey[2]!.completeWhen = { type: 'knowledge', documentId: 'unknown' } }],
    ['journey.4.completeWhen.toolId', (recipe) => { recipe.journey[4]!.completeWhen = { type: 'tool', toolId: 'unknown' } }],
  ]
  for (const [path, mutate] of mutations) {
    const recipe = structuredClone(original)
    mutate(recipe)
    const result = recipeSchema.safeParse(recipe)
    assert.equal(result.success, false, path)
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.path.join('.') === path), path)
    assert.throws(() => validateRecipeReferences(recipe), { message: new RegExp(path.replaceAll('.', '\\.')) })
  }
})

test('duplicate IDs in every component namespace and duplicate editable keys are rejected', () => {
  const mutations: [string, (recipe: Recipe) => void][] = [
    ['connections', (recipe) => recipe.connections.push(structuredClone(recipe.connections[0]!))],
    ['knowledge', (recipe) => recipe.knowledge.push(structuredClone(recipe.knowledge[0]!))],
    ['facts', (recipe) => recipe.facts.push(structuredClone(recipe.facts[0]!))],
    ['tools', (recipe) => recipe.tools.push(structuredClone(recipe.tools[0]!))],
    ['journey', (recipe) => recipe.journey.push(structuredClone(recipe.journey[0]!))],
    ['resources', (recipe) => recipe.connections[0]!.resources.push(structuredClone(recipe.connections[0]!.resources[0]!))],
    ['editable', (recipe) => { recipe.editable = ['name', 'name'] }],
  ]
  for (const [label, mutate] of mutations) {
    const recipe = structuredClone(original)
    mutate(recipe)
    const result = recipeSchema.safeParse(recipe)
    assert.equal(result.success, false, label)
    if (!result.success) assert.ok(result.error.issues.some((issue) => issue.message.includes('Duplicate')), label)
  }
})

test('impossible journey conditions fail precisely at completeWhen with actionable requirements', () => {
  const cases: { condition: GuideCondition; patch: Partial<Recipe>; expected: RegExp }[] = [
    { condition: { type: 'profile-edited' }, patch: { editable: [] }, expected: /profile-edited.*name or instructions/ },
    { condition: { type: 'profile-edited' }, patch: { editable: ['tone', 'detail'] }, expected: /profile-edited.*name or instructions/ },
    { condition: { type: 'profile-edited' }, patch: { editable: ['description'] }, expected: /profile-edited.*name or instructions/ },
    { condition: { type: 'behavior-edited' }, patch: { editable: [] }, expected: /behavior-edited.*tone and detail/ },
    { condition: { type: 'behavior-edited' }, patch: { editable: ['name', 'description', 'instructions'] }, expected: /behavior-edited.*tone and detail/ },
    { condition: { type: 'event', event: 'answered' }, patch: { facts: [] }, expected: /answered.*facts/ },
    { condition: { type: 'event', event: 'escalated' }, patch: { tools: [] }, expected: /escalated.*tools/ },
  ]
  for (const { condition, patch, expected } of cases) {
    const recipe: Recipe = {
      ...structuredClone(original),
      ...patch,
      journey: [{ ...original.journey[0]!, completeWhen: condition }],
    }
    delete recipe.lab
    const result = recipeSchema.safeParse(recipe)
    assert.equal(result.success, false, JSON.stringify(condition))
    if (!result.success) {
      assert.equal(result.error.issues.length, 1)
      assert.deepEqual(result.error.issues[0]!.path, ['journey', 0, 'completeWhen'])
      assert.match(result.error.issues[0]!.message, expected)
    }
    assert.throws(() => validateRecipeReferences(recipe), /journey\.0\.completeWhen:/)
  }
})

test('journey conditions remain valid when their required edit or action is available', () => {
  const cases: { condition: GuideCondition; patch: Partial<Recipe> }[] = [
    ...(['name', 'instructions'] as const).map((key) => ({
      condition: { type: 'profile-edited' as const }, patch: { editable: [key] },
    })),
    ...(['tone', 'detail'] as const).map((key) => ({
      condition: { type: 'behavior-edited' as const }, patch: { editable: [key] },
    })),
    { condition: { type: 'event', event: 'answered' }, patch: {} },
    { condition: { type: 'event', event: 'escalated' }, patch: {} },
  ]
  for (const { condition, patch } of cases) {
    const recipe: Recipe = {
      ...structuredClone(original),
      ...patch,
      journey: [{ ...original.journey[0]!, completeWhen: condition }],
    }
    delete recipe.lab
    assert.ok(recipeSchema.safeParse(recipe).success, JSON.stringify({ condition, patch }))
    assert.doesNotThrow(() => validateRecipeReferences(recipe))
  }
})

test('schemas are strict, support only version one and reject unknown discriminator/condition values', () => {
  for (const patch of [
    { schemaVersion: 2 }, { revision: 0 }, { unexpected: true },
    { editable: ['not-a-profile-key'] }, { difficulty: 'advanced' },
    { connections: [{ ...original.connections[0], type: 'database' }] },
    { tools: [{ ...original.tools[0], type: 'send-email' }] },
    { journey: [{ ...original.journey[0], completeWhen: { type: 'clicked-next' } }] },
    { journey: [{ ...original.journey[0], completeWhen: { type: 'event', event: 'connected' } }] },
    { journey: [{ ...original.journey[0], completeWhen: { type: 'profile-edited', unknown: true } }] },
    { agent: { ...original.agent, unexpected: true } },
    { facts: [{ ...original.facts[0], unexpected: true }] },
  ]) assert.equal(recipeSchema.safeParse({ ...original, ...patch }).success, false, JSON.stringify(patch))
})

test('source URLs require credential-free HTTPS and recipe sizes have bounded limits', () => {
  for (const sourceUrl of ['http://example.invalid', 'javascript:alert(1)', 'not a URL', 'https://name:password@example.invalid']) {
    assert.equal(recipeSchema.safeParse({ ...original, sourceUrl }).success, false)
  }
  for (const patch of [
    { agent: { ...original.agent, name: 'a'.repeat(101) } },
    { agent: { ...original.agent, description: 'a'.repeat(601) } },
    { agent: { ...original.agent, instructions: 'a'.repeat(3_001) } },
    { learningGoals: Array.from({ length: 13 }, () => 'Goal') },
    { facts: [{ ...original.facts[0], keywords: ['???'] }] },
  ]) assert.equal(recipeSchema.safeParse({ ...original, ...patch }).success, false)
})

test('the exported agent profile schema validates saved profiles with the same limits', () => {
  assert.deepEqual(agentProfileSchema.parse(original.agent), original.agent)
  assert.ok(agentProfileSchema.safeParse({ ...original.agent, description: '', instructions: '' }).success)
  for (const patch of [
    { name: ' ' }, { name: 'a'.repeat(101) }, { description: 'a'.repeat(601) }, { instructions: 'a'.repeat(3_001) },
    { tone: 'invalid' }, { detail: 'invalid' }, { unexpected: 'field' },
  ]) assert.equal(agentProfileSchema.safeParse({ ...original.agent, ...patch }).success, false)
})

test('connection kinds must match the component they provide', () => {
  const recipe = structuredClone(original)
  recipe.knowledge[0]!.connectionId = 'service-desk-demo'
  recipe.knowledge[0]!.resourceId = 'citizen-support'
  recipe.tools[0]!.connectionId = 'sharepoint-demo'
  recipe.tools[0]!.resourceId = 'citizen-service'
  const result = recipeSchema.safeParse(recipe)
  assert.equal(result.success, false)
  if (!result.success) assert.equal(result.error.issues.filter((issue) => issue.message.includes('type')).length, 2)
})

test('text that does not literally ground answer/detail cannot be compiled', async () => {
  await fixture(async (root) => {
    const recipe = structuredClone(original)
    recipe.facts[0]!.answer = 'An invented policy that is not in the document.'
    recipe.facts[0]!.detail = 'Another passage that does not appear in the source.'
    await writeRecipe(root, recipe)
    await assert.rejects(compileRecipes(root), /facts\.0\.answer.*verbatim.*facts\.0\.detail/s)
  })
})

test('absolute paths, traversal, reserved characters and non-txt extensions are rejected', async () => {
  await fixture(async (root) => {
    for (const path of ['../outside.txt', 'documents/../../outside.txt', '..\\outside.txt', '/outside.txt', 'C:\\outside.txt', '\\\\server\\share\\outside.txt', 'documents/script.js', 'documents/a.txt:stream', 'documents//a.txt']) {
      const recipe = structuredClone(original)
      recipe.knowledge[0]!.file = path
      await writeRecipe(root, recipe)
      await assert.rejects(compileRecipes(root), /knowledge\.0\.file/, path)
    }
  })
})

test('document and recipe-directory symlink escapes are rejected', async () => {
  await fixture(async (root, workspace) => {
    const outside = join(workspace, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'required-documents.txt'), 'Text outside the recipe.')
    await symlink(outside, join(root, original.id, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const recipe = structuredClone(original)
    recipe.knowledge[0]!.file = 'linked/required-documents.txt'
    await writeRecipe(root, recipe)
    await assert.rejects(compileRecipes(root), /symbolic link escapes/)
    await writeRecipe(root, original)
    await symlink(outside, join(root, 'outside-recipe'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(compileRecipes(root), /symbolic link escapes/)
  })
})

test('documents must be nonempty UTF-8 text no larger than 64 KB', async () => {
  await fixture(async (root) => {
    const path = join(root, original.id, 'documents', 'required-documents.txt')
    await writeFile(path, 'é'.repeat(32_769))
    await assert.rejects(compileRecipes(root), /65536 bytes/)
    await writeFile(path, Buffer.from([0xc3, 0x28]))
    await assert.rejects(compileRecipes(root), /required-documents\.txt/)
    await writeFile(path, '\0binary')
    await assert.rejects(compileRecipes(root), /binary characters/)
    await writeFile(path, '')
    await assert.rejects(compileRecipes(root), /knowledge\.0\.content/)
  })
})

test('CLI resolves its project, writes schema outside learner assets, and --check never writes', async () => {
  await fixture(async (root, workspace) => {
    const scripts = join(workspace, 'scripts')
    const domain = join(workspace, 'src', 'domain')
    const generated = join(workspace, 'src', 'generated')
    const schemaDirectory = join(workspace, 'authoring', 'generated')
    const unrelated = join(workspace, 'elsewhere')
    await Promise.all([mkdir(scripts), mkdir(domain, { recursive: true }), mkdir(generated, { recursive: true }), mkdir(schemaDirectory, { recursive: true }), mkdir(unrelated)])
    await Promise.all([
      cp(join(project, 'scripts', 'compile-recipes.ts'), join(scripts, 'compile-recipes.ts')),
      cp(join(project, 'src', 'domain', 'validation.ts'), join(domain, 'validation.ts')),
      cp(join(project, 'src', 'domain', 'lab-validation.ts'), join(domain, 'lab-validation.ts')),
      cp(join(project, 'src', 'domain', 'lab-types.ts'), join(domain, 'lab-types.ts')),
      cp(join(project, 'src', 'domain', 'types.ts'), join(domain, 'types.ts')),
      writeFile(join(workspace, 'package.json'), '{"type":"module"}'),
    ])
    const output = join(generated, 'recipes.json')
    const schemaOutput = join(schemaDirectory, 'recipe.schema.json')
    await writeFile(output, 'sentinel')
    await writeFile(schemaOutput, 'schema sentinel')
    const before = await stat(output)
    const schemaBefore = await stat(schemaOutput)
    const cli = join(scripts, 'compile-recipes.ts')
    const check = spawnSync(process.execPath, [cli, '--check'], { cwd: unrelated, encoding: 'utf8' })
    assert.equal(check.status, 0, check.stderr)
    assert.equal(await readFile(output, 'utf8'), 'sentinel')
    assert.equal((await stat(output)).mtimeMs, before.mtimeMs)
    assert.equal(await readFile(schemaOutput, 'utf8'), 'schema sentinel')
    assert.equal((await stat(schemaOutput)).mtimeMs, schemaBefore.mtimeMs)
    await rm(join(workspace, 'authoring'), { recursive: true })
    const checkWithoutOutput = spawnSync(process.execPath, [cli, '--check'], { cwd: unrelated, encoding: 'utf8' })
    assert.equal(checkWithoutOutput.status, 0, checkWithoutOutput.stderr)
    await assert.rejects(stat(join(workspace, 'authoring')), { code: 'ENOENT' })
    const compile = spawnSync(process.execPath, [cli], { cwd: unrelated, encoding: 'utf8' })
    assert.equal(compile.status, 0, compile.stderr)
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), await compileRecipes(root))
    assert.equal(await readFile(output, 'utf8'), `${JSON.stringify(await compileRecipes(root), null, 2)}\n`)
    const schemaText = await readFile(schemaOutput, 'utf8')
    assert.equal(schemaText, `${JSON.stringify(z.toJSONSchema(recipeSchema), null, 2)}\n`)
    const schema = JSON.parse(schemaText)
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.properties.schemaVersion.const, 1)
    assert.equal(schema.additionalProperties, false)
    await assert.rejects(stat(join(workspace, 'public', 'recipe.schema.json')), { code: 'ENOENT' })
    await writeFile(join(root, original.id, 'recipe.yaml'), 'broken: [yaml')
    const invalid = spawnSync(process.execPath, [cli, '--check'], { cwd: unrelated, encoding: 'utf8' })
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /recipe\.yaml.*Invalid YAML/s)
  })
})
