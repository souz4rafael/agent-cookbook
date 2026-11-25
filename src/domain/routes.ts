export type RecipeEntryMode = 'build' | 'preview'

export function recipeHref(id: string, mode: RecipeEntryMode = 'build') {
  return `#/recipes/${encodeURIComponent(id)}${mode === 'preview' ? '/preview' : ''}`
}

export function readRoute(hash: string) {
  const [path, query = ''] = hash.split('?')
  if (!path || path === '#' || path === '#/') return { kind: 'home' as const }
  if (/^#\/scenarios\/?$/.test(path)) return { kind: 'scenarios' as const }
  if (/^#\/(agents|recipes)\/?$/.test(path)) {
    return { kind: 'agents' as const, search: new URLSearchParams(query).get('search') ?? '' }
  }
  const match = /^#\/recipes\/([^/]+)(\/preview)?\/?$/.exec(path)
  if (match) {
    try {
      const id = decodeURIComponent(match[1])
      return match[2] ? { kind: 'recipe' as const, id, entryMode: 'preview' as const } : { kind: 'recipe' as const, id }
    }
    catch { /* Invalid encoded identifiers use the not-found page. */ }
  }
  return { kind: 'not-found' as const }
}
