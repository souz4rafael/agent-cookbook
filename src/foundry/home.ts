export const navigationSections = [
  { title: '', items: ['Home', 'Catalog'] },
  { title: 'Create', items: ['Agents', 'Models', 'Services', 'Tools', 'Knowledge', 'Memory', 'Guardrails'] },
  { title: 'Observe', items: ['Monitor', 'Traces'] },
  { title: 'Improve', items: ['Data', 'Evaluations', 'Training'] },
] as const

export type NavigationItem = typeof navigationSections[number]['items'][number]
export type RecentFilter = 'All' | 'Agents' | 'Models'

export const demoProject = {
  name: 'agents-cookbook',
  description: 'Local learning project',
  endpoint: 'https://cookbook.example.invalid/api/projects/agents-cookbook',
  openAIEndpoint: 'https://cookbook.example.invalid/openai/v1',
} as const

// A presentation snapshot, not a live catalog or a promise of model availability.
export const featuredModels = [
  { name: 'claude-fable-5-2', publisher: 'Anthropic', icon: 'anthropic' },
  { name: 'Kimi-K3.1-Pro', publisher: 'Moonshot AI', icon: 'moonshot' },
  { name: 'gpt-6.2-sol', publisher: 'OpenAI', icon: 'openai' },
  { name: 'Microsoft-Decision-1.1', publisher: 'Microsoft', icon: 'microsoft' },
  { name: 'Fal-Kling-V3-Pro', publisher: 'fal', icon: 'fal' },
  { name: 'DeepSeek-V4.1-Flash-1017', publisher: 'DeepSeek', icon: 'deepseek' },
  { name: 'grok-4.7', publisher: 'xAI', icon: 'xai' },
  { name: 'gpt-6-luna', publisher: 'OpenAI', icon: 'openai' },
  { name: 'claude-opus-5-5', publisher: 'Anthropic', icon: 'anthropic' },
  { name: 'model-router', publisher: 'Microsoft', icon: 'foundry' },
] as const

export function searchHome(query: string) {
  const term = query.trim().toLowerCase()
  const pages = navigationSections.flatMap(section => section.items.map(name => ({
    name, category: 'Page', description: section.title || 'Discover',
  })))
  const models = featuredModels.map(model => ({
    name: model.name, category: 'Model', description: model.publisher,
  }))
  return [...pages, ...models].filter(item => (
    `${item.name} ${item.description}`.toLowerCase().includes(term)
  ))
}
