import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { foundryRecipeLimits, loadFoundryRecipes } from '../src/foundry/recipes/schema.ts'
import { loadJsonRecipeFiles } from './json-recipe-files.ts'

export async function validateFoundryRecipeFiles(directory: URL) {
  return loadJsonRecipeFiles(fileURLToPath(directory), loadFoundryRecipes, foundryRecipeLimits.recipes)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = new URL('../foundry/recipes/', import.meta.url)
  validateFoundryRecipeFiles(directory).then(recipes => {
    console.log(`Validated ${recipes.length} Foundry recipe(s) in ${fileURLToPath(directory)}.`)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
