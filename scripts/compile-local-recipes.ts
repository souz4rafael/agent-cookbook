import { mkdir, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileRecipes } from './compile-recipes.ts'

export async function compileLocalRecipes(projectRoot: string) {
  const publicRecipes = await compileRecipes(join(projectRoot, 'recipes'))
  const localRoot = join(projectRoot, 'local-recipes')
  const localRecipes = statSync(localRoot, { throwIfNoEntry: false })
    ? await compileRecipes(localRoot, { allowEmpty: true }) : []
  const ids = new Set(publicRecipes.map(recipe => recipe.id))
  for (const recipe of localRecipes) {
    if (ids.has(recipe.id)) throw new Error(`Local recipe "${recipe.id}" conflicts with a public recipe.`)
    ids.add(recipe.id)
  }
  return [...publicRecipes, ...localRecipes]
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const recipes = await compileLocalRecipes(root)
  const directory = join(root, 'src', 'generated')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'local-recipes.json'), `${JSON.stringify(recipes, null, 2)}\n`, 'utf8')
  console.log(`${recipes.length} recipes available in the local-only preview. Public manifest unchanged.`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
