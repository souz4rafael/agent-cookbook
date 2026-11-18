export function readRoute(hash: string) {
  const [path, query = ''] = hash.split('?')
  if (!path || path === '#' || path === '#/') return { kind: 'home' as const }
  if (/^#\/scenarios\/?$/.test(path)) return { kind: 'scenarios' as const }
  if (/^#\/(agents|recipes)\/?$/.test(path)) {
    return { kind: 'agents' as const, search: new URLSearchParams(query).get('search') ?? '' }
  }
  const match = /^#\/recipes\/([^/]+)\/?$/.exec(path)
  if (match) {
    try { return { kind: 'recipe' as const, id: decodeURIComponent(match[1]) } }
    catch { /* Invalid encoded identifiers use the not-found page. */ }
  }
  return { kind: 'not-found' as const }
}
