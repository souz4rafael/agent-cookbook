import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const privateFilename = /(?:^|[\\/])(?:maintainer|admin|authoring|contact-store)(?:[\\/.-]|$)|(?:^|[\\/])(?:\.agent-cookbook|contact-requests)(?:[\\/]|$)|recipe\.schema\.json$|(?:^|[\\/])(?:\.pending-)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\.json)?$/i
const privateContent = [
  /authoring\.html/i,
  /recipe\.schema\.json/i,
  /\/maintainer(?:[/"?#]|$)/i,
  /maintainer guide/i,
  /how to add recipes/i,
  /como adicionar receitas/i,
  /AZURE_STATIC_WEB_APPS_API_TOKEN/,
  /AGENT_COOKBOOK_CONTACT_STORE/,
  /COOKBOOK_FEEDBACK_[A-Z_]+/,
  /\.agent-cookbook[\\/]/,
  /\bconsentVersion["']?\s*:/,
]

export async function inspectPublicBuild(root: string, options: { noContactCollection?: boolean } = {}): Promise<string[]> {
  const issues: string[] = []
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const name = relative(root, path)
      if (privateFilename.test(name)) issues.push(`Management file in public output: ${name}`)
      if (entry.isSymbolicLink()) {
        issues.push(`Unexpected symbolic link in public output: ${name}`)
        continue
      }
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      // Hosting configuration intentionally contains denied management routes, not management content.
      if (name === 'staticwebapp.config.json') continue
      if (/\.(?:html|js|css|json|map|txt)$/i.test(name)) {
        const content = await readFile(path, 'utf8')
        if (options.noContactCollection && /\/api\/contact-requests|contact-name|contact-email|Contact us/.test(content)) {
          issues.push(`Contact collection in educational public output: ${name}`)
        }
        for (const pattern of privateContent) {
          if (pattern.test(content)) issues.push(`Management content or link in public output: ${name} (${pattern.source})`)
        }
      }
    }
  }
  await visit(root)
  await readFile(join(root, 'index.html'), 'utf8')
  return issues
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Usage: node scripts/check-public-build.ts')
  const root = fileURLToPath(new URL('../dist', import.meta.url))
  const issues = await inspectPublicBuild(root)
  if (issues.length) throw new Error(`Public/maintainer build boundary failed:\n${issues.join('\n')}`)
  console.log('Public artifact contains no maintainer pages, schema or management links.')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
