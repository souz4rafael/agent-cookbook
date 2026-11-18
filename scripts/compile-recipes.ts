import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'
import { z } from 'zod'
import { compiledRecipeSchema, recipeSchema } from '../src/domain/validation.ts'
import type { CompiledRecipe, Recipe } from '../src/domain/types.ts'

const DOCUMENT_LIMIT = 65_536
const RECIPE_LIMIT = 262_144

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function containedPath(root: string, path: string): Promise<string> {
  const actual = await realpath(path)
  const relation = relative(root, actual)
  if (isAbsolute(relation) || relation === '..' || relation.startsWith(`..${sep}`)) {
    throw new Error(`${path}: path or symbolic link escapes the permitted folder "${root}".`)
  }
  return actual
}

async function readText(path: string, root: string, limit: number): Promise<string> {
  try {
    const actual = await containedPath(root, path)
    const metadata = await stat(actual)
    if (!metadata.isFile()) throw new Error('The path must point to a regular file.')
    if (metadata.size > limit) throw new Error(`The file exceeds the limit of ${limit} bytes.`)
    const bytes = await readFile(actual)
    if (bytes.length > limit) throw new Error(`The file exceeds the limit of ${limit} bytes.`)
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch (error) {
    throw new Error(`${path}: ${message(error)}`)
  }
}

async function loadRecipe(folder: string, name: string): Promise<{ recipe: Recipe; folder: string; name: string; file: string }> {
  const file = join(folder, 'recipe.yaml')
  const text = await readText(file, folder, RECIPE_LIMIT)
  let value: unknown
  try {
    const document = parseDocument(text, { strict: true, uniqueKeys: true, prettyErrors: true })
    if (document.errors.length > 0) throw document.errors[0]
    if (document.warnings.length > 0) throw document.warnings[0]
    value = document.toJS({ maxAliasCount: 0 })
  } catch (error) {
    throw new Error(`${file}: Invalid YAML: ${message(error)}`)
  }
  const parsed = recipeSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`${file}:\n${parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`)
  }
  return { recipe: parsed.data, folder, name, file }
}

export async function compileRecipes(root: string, options: { allowEmpty?: boolean; includeDrafts?: boolean } = {}): Promise<CompiledRecipe[]> {
  const recipeRoot = await realpath(resolve(root))
  const entries = (await readdir(recipeRoot, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  const loaded: Awaited<ReturnType<typeof loadRecipe>>[] = []
  for (const entry of entries) {
    const path = join(recipeRoot, entry.name)
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const folder = await containedPath(recipeRoot, path)
    if (!(await stat(folder)).isDirectory()) continue
    if (loaded.length >= 100) throw new Error(`${recipeRoot}: the limit of 100 recipe folders has been exceeded.`)
    loaded.push(await loadRecipe(folder, entry.name))
  }

  const ids = new Map<string, string>()
  for (const { recipe, file } of loaded) {
    const prior = ids.get(recipe.id)
    if (prior) throw new Error(`${file}: duplicate recipe id "${recipe.id}", also declared in ${prior}.`)
    ids.set(recipe.id, file)
  }
  const published: CompiledRecipe[] = []
  for (const { recipe, folder, name, file } of loaded) {
    if (recipe.id !== name) throw new Error(`${file}: id "${recipe.id}" must match folder name "${name}".`)
    const knowledge: CompiledRecipe['knowledge'] = []
    for (const document of recipe.knowledge) {
      const path = resolve(folder, ...document.file.split(/[\\/]/u))
      const content = await readText(path, folder, DOCUMENT_LIMIT)
      knowledge.push({ ...document, content })
    }
    const compiled = compiledRecipeSchema.safeParse({ ...recipe, estimatedMinutes: recipe.journey.length, knowledge })
    if (!compiled.success) {
      throw new Error(`${file}:\n${compiled.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`)
    }
    if (compiled.data.status === 'published' || options.includeDrafts) published.push(compiled.data)
  }
  if (published.length === 0 && !options.allowEmpty) throw new Error(`${recipeRoot}: ${options.includeDrafts ? 'no recipes found' : 'no published recipes; publish at least one valid recipe'}.`)
  return published
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check') || args.length > 1) throw new Error('Usage: node scripts/compile-recipes.ts [--check]')
  const projectRoot = fileURLToPath(new URL('../', import.meta.url))
  const recipes = await compileRecipes(join(projectRoot, 'recipes'))
  if (args.includes('--check')) {
    console.log(`${recipes.length} valid published recipe(s); no files were changed.`)
    return
  }
  const output = join(projectRoot, 'src', 'generated', 'recipes.json')
  const schemaOutput = join(projectRoot, 'authoring', 'generated', 'recipe.schema.json')
  const authoringSchema = z.toJSONSchema(recipeSchema)
  await Promise.all([
    mkdir(join(projectRoot, 'src', 'generated'), { recursive: true }),
    mkdir(join(projectRoot, 'authoring', 'generated'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(output, `${JSON.stringify(recipes, null, 2)}\n`, 'utf8'),
    writeFile(schemaOutput, `${JSON.stringify(authoringSchema, null, 2)}\n`, 'utf8'),
  ])
  console.log(`${recipes.length} recipe(s) compiled to ${output}.`)
  console.log(`Authoring schema generated at ${schemaOutput}.`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(message(error))
    process.exitCode = 1
  })
}
