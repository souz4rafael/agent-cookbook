import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { cookbookIds } from '../src/collection/catalog.ts'
import { inspectPublicBuild } from './check-public-build.ts'
import { finalizeDirectory } from './finalize-directory.ts'

const project = fileURLToPath(new URL('../', import.meta.url))

export async function buildCollection() {
  const stage = await mkdtemp(join(project, '.collection-build-'))
  const output = join(project, 'dist-collection')
  try {
    await build({
      configFile: false,
      root: join(project, 'hub'),
      publicDir: false,
      base: './',
      appType: 'mpa',
      plugins: [react()],
      build: { outDir: stage, emptyOutDir: false },
    })
    for (const id of cookbookIds) {
      const directory = join(stage, id)
      await build({
        configFile: join(project, id === 'studio' ? 'vite.config.ts' : `vite.${id}.config.ts`),
        base: './',
        define: { 'import.meta.env.VITE_COOKBOOK_COLLECTION': JSON.stringify('true') },
        build: { outDir: directory, emptyOutDir: false },
      })
      const issues = await inspectPublicBuild(directory, { noContactCollection: true })
      if (issues.length) throw new Error(`${id} learner boundary failed:\n${issues.join('\n')}`)
    }
    await writeFile(join(stage, '.nojekyll'), '')
    for (const file of ['LICENSE.txt', 'THIRD-PARTY-NOTICES.txt']) {
      await copyFile(join(project, file), join(stage, file))
    }
    const issues = await inspectPublicBuild(stage, { noContactCollection: true })
    if (issues.length) throw new Error(`Collection learner boundary failed:\n${issues.join('\n')}`)
    await rm(output, { recursive: true, force: true })
    await finalizeDirectory(stage, output)
    console.log(`Collection built at ${output}. No deployment performed.`)
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  buildCollection().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
