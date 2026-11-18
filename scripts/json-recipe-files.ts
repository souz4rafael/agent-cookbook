import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseDocument } from 'yaml'

const maxRecipeBytes = 262_144

export async function loadJsonRecipeFiles<T extends { id: string }>(
  directory: string,
  validate: (values: unknown[]) => T[],
  limit: number,
): Promise<T[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.name.endsWith('.json'))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  if (!entries.length) throw new Error(`${directory}: catalog must contain at least one recipe (no JSON recipes found).`)
  if (entries.length > limit) throw new Error(`${directory}: at most ${limit} JSON recipes are supported.`)
  const values: unknown[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`${path}: recipes must be regular files, not links or directories.`)
    if ((await stat(path)).size > maxRecipeBytes) throw new Error(`${path}: recipe exceeds ${maxRecipeBytes} bytes.`)
    const bytes = await readFile(path)
    if (bytes.length > maxRecipeBytes) throw new Error(`${path}: recipe exceeds ${maxRecipeBytes} bytes.`)
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const value: unknown = JSON.parse(text)
      // JSON.parse accepts duplicate keys; the existing YAML parser detects them.
      const document = parseDocument(text, { uniqueKeys: true, strict: true })
      if (document.errors.length) throw document.errors[0]
      values.push(value)
    } catch (error) {
      throw new Error(`${directory}: Invalid JSON in ${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const recipes = validate(values)
  recipes.forEach((recipe, index) => {
    if (recipe.id !== basename(entries[index].name, '.json')) {
      throw new Error(`${join(directory, entries[index].name)}: filename must match recipe id "${recipe.id}"; must be in ${recipe.id}.json.`)
    }
  })
  return recipes
}
