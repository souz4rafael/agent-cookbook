import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stringify } from 'yaml'
import { z } from 'zod'
import { cookbookIds } from '../src/collection/catalog.ts'
import type { CookbookId } from '../src/collection/catalog.ts'
import { recipeSchema } from '../src/domain/validation.ts'
import type { CompiledRecipe } from '../src/domain/types.ts'
import { builderRecipeSchema } from '../src/copilot/builder/schema.ts'
import { foundryRecipeSchema } from '../src/foundry/recipes/schema.ts'
import { compileRecipes } from './compile-recipes.ts'
import { validateCopilotRecipes } from './validate-copilot-recipes.ts'
import { validateFoundryRecipeFiles } from './validate-foundry-recipes.ts'
import { validateStudioDrafts, verifyStudioCases } from './studio-authoring.ts'
import { finalizeDirectory } from './finalize-directory.ts'

const project = fileURLToPath(new URL('../', import.meta.url))
const usage = 'Usage: npm run recipes:author -- list | scaffold <studio|copilot|foundry> <new-id> <template-id> | check <product> <directory> | pack'

function product(value: string): CookbookId {
  const parsed = z.enum(cookbookIds).safeParse(value)
  if (!parsed.success) throw new Error(usage)
  return parsed.data
}

function requireAuthorId(value: string): string {
  if (value.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) {
    throw new Error('Use a lowercase hyphen-separated ID starting with a letter, at most 64 characters, not a reserved filename.')
  }
  return value
}

export async function authoringCatalog(root: string) {
  const studio = await compileRecipes(join(root, 'recipes'))
  const copilot = await validateCopilotRecipes(join(root, 'copilot', 'recipes'))
  const foundry = await validateFoundryRecipeFiles(pathToFileURL(join(root, 'foundry', 'recipes')))
  return { studio, copilot, foundry }
}

export async function checkDrafts(target: CookbookId, directory: string) {
  if (target === 'studio') {
    const recipes = await validateStudioDrafts(directory)
    return { product: target, recipes: recipes.length, cases: recipes.reduce((sum, recipe) => sum + (recipe.lab?.cases.length ?? 0), 0), coverage: 'schema, references and declared lab expectations' }
  }
  const recipes = target === 'copilot' ? await validateCopilotRecipes(directory)
    : await validateFoundryRecipeFiles(pathToFileURL(resolve(directory)))
  return { product: target, recipes: recipes.length, cases: null, coverage: 'schema and references only; no runtime behavior evaluation' }
}

async function writeStudioPackage(sourceRoot: string, directory: string, source: CompiledRecipe, id: string, draft: boolean) {
  const { estimatedMinutes: _estimate, knowledge, ...definition } = source
  const recipe = recipeSchema.parse({
    ...definition, id, revision: draft ? 1 : source.revision, status: draft ? 'draft' : source.status,
    knowledge: knowledge.map(({ content: _content, ...document }) => document),
  })
  await writeFile(join(directory, 'recipe.yaml'), stringify(recipe), { flag: 'wx' })
  for (const document of knowledge) {
    const segments = document.file.split(/[\\/]/)
    const destination = join(directory, ...segments)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(join(sourceRoot, 'recipes', source.id, ...segments), destination)
  }
}

export async function scaffoldRecipe(root: string, target: CookbookId, newId: string, templateId: string) {
  const id = requireAuthorId(newId)
  requireAuthorId(templateId)
  const catalog = await authoringCatalog(root)
  if (catalog[target].some(recipe => recipe.id === id)) throw new Error(`${target}/${id} already exists in the source catalog.`)
  const parent = join(root, 'recipe-drafts', target)
  await mkdir(parent, { recursive: true })
  if (target === 'studio') {
    const template = catalog.studio.find(recipe => recipe.id === templateId)
    if (!template) throw new Error(`Unknown Studio template "${templateId}".`)
    const destination = join(parent, id)
    await mkdir(destination)
    try {
      await writeStudioPackage(root, destination, template, id, true)
    } catch (error) {
      await rm(destination, { recursive: true, force: true })
      throw error
    }
    return destination
  }
  const destination = join(parent, `${id}.json`)
  if (target === 'copilot') {
    const template = catalog.copilot.find(recipe => recipe.id === templateId)
    if (!template) throw new Error(`Unknown Copilot template "${templateId}".`)
    const clone = builderRecipeSchema.parse({ ...template, id, revision: 1 })
    await writeFile(destination, `${JSON.stringify(clone, null, 2)}\n`, { flag: 'wx' })
  } else {
    const template = catalog.foundry.find(recipe => recipe.id === templateId)
    if (!template) throw new Error(`Unknown Foundry template "${templateId}".`)
    const clone = foundryRecipeSchema.parse({
      ...template, id, revision: 1, manifest: { ...template.manifest, defaultName: id },
    })
    await writeFile(destination, `${JSON.stringify(clone, null, 2)}\n`, { flag: 'wx' })
  }
  return destination
}

export async function packAuthoring(root: string) {
  const catalog = await authoringCatalog(root)
  for (const recipe of catalog.studio) verifyStudioCases(recipe)
  const stage = await mkdtemp(join(root, '.authoring-build-'))
  const output = join(root, 'dist-authoring')
  try {
    await mkdir(join(stage, 'schemas'))
    const schemas = {
      studio: z.toJSONSchema(recipeSchema),
      copilot: z.toJSONSchema(builderRecipeSchema),
      foundry: z.toJSONSchema(foundryRecipeSchema),
    }
    const fingerprints: Record<string, string> = {}
    for (const id of cookbookIds) {
      const schema = `${JSON.stringify(schemas[id], null, 2)}\n`
      await writeFile(join(stage, 'schemas', `${id}.schema.json`), schema)
      await mkdir(join(stage, 'examples', id), { recursive: true })
    }
    for (const recipe of catalog.studio) {
      const directory = join(stage, 'examples', 'studio', recipe.id)
      await mkdir(directory)
      await writeStudioPackage(root, directory, recipe, recipe.id, false)
    }
    for (const id of ['copilot', 'foundry'] as const) {
      for (const recipe of catalog[id]) {
        await writeFile(join(stage, 'examples', id, `${recipe.id}.json`), `${JSON.stringify(recipe, null, 2)}\n`)
      }
    }
    const instructions = await readFile(join(root, 'authoring', 'recipe-author.txt'), 'utf8')
    await writeFile(join(stage, 'instructions.txt'), instructions)
    await copyFile(join(root, 'LICENSE.txt'), join(stage, 'LICENSE.txt'))
    await copyFile(join(root, 'THIRD-PARTY-NOTICES.txt'), join(stage, 'THIRD-PARTY-NOTICES.txt'))
    async function fingerprintFiles(directory: string, prefix = ''): Promise<void> {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(directory, entry.name)
        const name = `${prefix}${entry.name}`
        if (entry.isDirectory()) await fingerprintFiles(path, `${name}/`)
        else fingerprints[name] = createHash('sha256').update(await readFile(path)).digest('hex')
      }
    }
    await fingerprintFiles(stage)
    await writeFile(join(stage, 'manifest.json'), `${JSON.stringify({
      formatVersion: 1,
      name: 'cookbook-recipe-author',
      description: 'Author reviewed, fictional recipes for the three Agents Cookbooks using existing product-specific frameworks.',
      instructions: 'instructions.txt',
      rights: 'LICENSE.txt; original material requires prior written permission for reuse, subject to applicable law and GitHub terms. Third-party terms are separate.',
      requires: 'Matching agent-cookbook checkout, Node.js >=22.18, installed npm dependencies, approved file/shell access',
      compatibility: { scout: 'portable instructions or custom skill instructions', cowork: 'project/task instructions with attached resources; not a native plugin' },
      schemaWarning: 'JSON Schema is structural only. Cross-reference checks, fixture text refinements and runtime expectations require the repository validators.',
      templates: cookbookIds.flatMap(id => catalog[id].map(recipe => ({ product: id, id: recipe.id, revision: recipe.revision }))),
      fingerprints,
    }, null, 2)}\n`)
    await rm(output, { recursive: true, force: true })
    await finalizeDirectory(stage, output)
    return output
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

export async function authorMain(args: string[], root = project) {
  if (args.length === 1 && args[0] === 'list') {
    const catalog = await authoringCatalog(root)
    console.log(JSON.stringify(cookbookIds.flatMap(id => catalog[id].map(recipe => ({
      product: id, id: recipe.id, title: recipe.title, revision: recipe.revision,
    }))), null, 2))
  } else if (args.length === 4 && args[0] === 'scaffold') {
    const destination = await scaffoldRecipe(root, product(args[1]), args[2], args[3])
    console.log(`Template cloned to ${destination}. Rewrite the scenario and validate it. Not published or deployed.`)
  } else if (args.length === 3 && args[0] === 'check') {
    console.log(JSON.stringify(await checkDrafts(product(args[1]), resolve(root, args[2])), null, 2))
  } else if (args.length === 1 && args[0] === 'pack') {
    console.log(`Portable prompt/resource pack: ${await packAuthoring(root)}. Requires the matching checkout; no upload or installation performed.`)
  } else {
    throw new Error(usage)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  authorMain(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
