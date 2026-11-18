import assert from 'node:assert/strict'
import test from 'node:test'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectPublicBuild } from '../scripts/check-public-build.ts'
import { parse } from 'yaml'

const project = fileURLToPath(new URL('../', import.meta.url))

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(project, 'tests', '.distribution-'))
  try {
    await writeFile(join(root, 'index.html'), '<html lang="en"><body>Independent educational simulation</body></html>')
    await run(root)
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('public artifact accepts learner assets but rejects private records, schemas and admin resources', async () => {
  await fixture(async root => {
    await writeFile(join(root, '.nojekyll'), '')
    assert.deepEqual(await inspectPublicBuild(root, { noContactCollection: true }), [])
    await mkdir(join(root, 'maintainer'))
    await writeFile(join(root, 'recipe.schema.json'), '{}')
    await writeFile(join(root, '5b6b28a1-c90c-4c18-a835-7097407c3daa.json'), '{}')
    const issues = await inspectPublicBuild(root, { noContactCollection: true })
    assert.ok(issues.some(issue => issue.includes('maintainer')))
    assert.ok(issues.some(issue => issue.includes('recipe.schema.json')))
    assert.ok(issues.some(issue => issue.includes('5b6b28a1')))
  })
})

test('educational artifact rejects contact endpoints and form controls', async () => {
  await fixture(async root => {
    for (const content of ['fetch("/api/contact-requests/status")', '<input id="contact-email">', '<button>Contact us</button>']) {
      await writeFile(join(root, 'main.js'), content)
      assert.ok((await inspectPublicBuild(root, { noContactCollection: true }))
        .some(issue => issue.includes('Contact collection')))
    }
  })
})

test('Pages deploys only the combined learner output from main and never pull requests', async () => {
  const workflow = parse(await readFile(join(project, '.github', 'workflows', 'pages.yml'), 'utf8'))
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.match(workflow.jobs.deploy.if, /github\.event_name != 'pull_request'/)
  assert.match(workflow.jobs.deploy.if, /github\.ref == 'refs\/heads\/main'/)
  const upload = workflow.jobs.build.steps.find((step: { uses?: string }) => step.uses === 'actions/upload-pages-artifact@v3')
  assert.equal(upload.with.path, 'dist-collection')
  assert.match(upload.if, /github\.event_name != 'pull_request'/)
  assert.deepEqual(workflow.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' })
})

test('public source excludes private services, administration and personal reference screenshots', async () => {
  for (const path of [
    'server', 'maintainer', 'copilot-reference.png', 'vite.maintainer.config.ts',
    'scripts/build-restricted-preview.ts', 'scripts/preview-feedback-email.ts',
    'src/components/ContactForm.tsx', 'src/domain/feedback-email.ts',
  ]) {
    await assert.rejects(access(join(project, ...path.split('/'))), { code: 'ENOENT' })
  }
  for (const name of ['Catalog.tsx', 'Studio.tsx']) {
    const source = await readFile(join(project, 'src', 'components', name), 'utf8')
    assert.doesNotMatch(source, /ContactForm|setShowContacts|PersonFeedback20Regular/)
  }
})
