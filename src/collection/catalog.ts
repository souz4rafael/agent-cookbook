export const cookbookIds = ['studio', 'copilot', 'foundry'] as const
export type CookbookId = typeof cookbookIds[number]

export const cookbooks = [
  {
    id: 'studio',
    product: 'Copilot Studio',
    audience: 'Business processes and service teams',
    description: 'Explore grounded answers, document routing, learning recommendations and human-reviewed decisions.',
    experience: 'Configure knowledge and tools, change fictional inputs, and prove the behaviour with guided exercises.',
  },
  {
    id: 'copilot',
    product: 'Copilot',
    audience: 'Everyday work and personal productivity',
    description: 'Explore a product-like chat and a guided agent builder, starting with the RLE Starter recipe.',
    experience: 'Shape instructions, select knowledge and try a deterministic agent preview.',
  },
  {
    id: 'foundry',
    product: 'Microsoft Foundry',
    audience: 'Developers and technical teams',
    description: 'Explore an agent catalog and compose a news and trend scanner from a declarative recipe.',
    experience: 'Inspect the model and instructions, select declared tools and save a local agent draft. Runtime evaluation is not available yet.',
  },
] as const satisfies readonly {
  id: CookbookId
  product: string
  audience: string
  description: string
  experience: string
}[]

export function cookbookHref(id: CookbookId, theme: 'light' | 'dark'): string {
  return `./${id}/index.html?scoutTheme=${theme}`
}

export function collectionHomeHref(theme: 'light' | 'dark'): string {
  return `../index.html?scoutTheme=${theme}`
}
