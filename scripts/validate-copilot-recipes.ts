import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { builderLimits, loadRecipeCatalog } from '../src/copilot/builder/schema.ts'
import { loadJsonRecipeFiles } from './json-recipe-files.ts'

export function validateCopilotRecipes(directory = fileURLToPath(new URL('../copilot/recipes', import.meta.url))) {
  return loadJsonRecipeFiles(directory, loadRecipeCatalog, builderLimits.recipes)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  validateCopilotRecipes().then(recipes => {
    console.log(`Validated ${recipes.length} Copilot builder recipe(s).`)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
