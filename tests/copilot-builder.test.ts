import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import { simulateReply, simulatedProvider } from '../src/copilot/framework.ts'
import type { ChatRequest } from '../src/copilot/framework.ts'
import {
  builderLimits, builderRecipeSchema, knowledgeKinds, loadRecipeCatalog,
} from '../src/copilot/builder/schema.ts'
import type { BuilderRecipe, KnowledgeKind } from '../src/copilot/builder/schema.ts'
import {
  builderDraftSchema, builderStorageKey, createBuilderDraft, decodeBuilderDrafts,
  encodeBuilderDrafts, maxBuilderStorageLength, readBuilderRoute, toPreviewAgent,
  validateBuilderDraft, validateForCreate,
} from '../src/copilot/builder/state.ts'
import type { BuilderDraft } from '../src/copilot/builder/state.ts'

const rle = builderRecipeSchema.parse(JSON.parse(readFileSync(
  new URL('../copilot/recipes/rle-starter.json', import.meta.url), 'utf8',
)))

test('every automatically discovered recipe is valid and has a stable matching filename', () => {
  const directory = new URL('../copilot/recipes/', import.meta.url)
  const names = readdirSync(directory).filter(name => name.endsWith('.json')).sort()
  assert.ok(names.length > 0)
  const catalog = loadRecipeCatalog(names.map(name => JSON.parse(readFileSync(new URL(name, directory), 'utf8'))))
  assert.deepEqual(catalog.map(recipe => `${recipe.id}.json`), names)
})

const museum = builderRecipeSchema.parse({
  schemaVersion: 1,
  revision: 3,
  id: 'museum-labels',
  title: 'Museum labels',
  summary: 'Practice writing fictional exhibit labels.',
  icon: 'document',
  profile: {
    name: 'Museum labels',
    description: 'Practice writing fictional exhibit labels.',
    instructions: 'Draft short fictional exhibit labels from sample notes. Never invent provenance or publish anything.',
  },
  sections: ['instructions', 'skills', 'knowledge', 'prompts'],
  knowledge: [
    { id: 'attachments', label: 'Sample exhibits', enabled: false, scope: 'attachments' },
    { id: 'web', label: 'Offline reference guide', enabled: true, scope: 'web' },
  ],
  sources: [
    { id: 'exhibit-notes', title: 'Fictional exhibit notes', kind: 'attachments', content: 'A modern replica of a clay bowl, made for a classroom display.' },
    { id: 'label-guide', title: 'Sample label guide', kind: 'web', content: 'Name the object and distinguish replicas from original artifacts.' },
  ],
  skills: [{ id: 'format-cards', title: 'Format cards', description: 'Enable a scripted label example.' }],
  starterPrompts: [{ id: 'label-example', title: 'Example label', message: 'Compose a label' }],
  simulation: {
    fallback: 'Try the fictional label example. No model or publishing service is connected.',
    rules: [{
      id: 'compose-label',
      keywords: ['Label', 'exhibit'],
      requiredSources: ['exhibit-notes'],
      requiredSkills: ['format-cards'],
      text: 'Example only: modern replica clay bowl, made for classroom learning.',
      sections: [{ title: 'Check the label', items: ['Keep the replica designation.', 'Ask a person to review before display.'] }],
    }],
  },
})

const row = (draft: BuilderDraft, kind: KnowledgeKind) => draft.knowledge.find(item => item.id === kind)!
const request = (recipe: BuilderRecipe, draft: BuilderDraft, text: string): ChatRequest => ({
  agent: toPreviewAgent(recipe, draft),
  messages: [{ id: 'question-1', role: 'user', text }],
  useSources: true,
  style: draft.mode,
})
const reply = (recipe: BuilderRecipe, draft: BuilderDraft, text: string) => simulateReply(request(recipe, draft, text))
const saved = (draft: BuilderDraft) => JSON.stringify({ version: 1, drafts: { [draft.recipeId]: draft } })

test('RLE data preserves source labels, defaults, original learning guardrails, and empty prompt rows', () => {
  assert.equal(rle.title, 'RLE Starter')
  assert.equal(rle.profile.name, rle.title)
  assert.equal(rle.summary, 'Enables defining tasks and rubrics for improved performance and agent tuning.')
  assert.equal(rle.profile.description, rle.summary)
  assert.deepEqual(rle.sections, ['instructions', 'skills', 'knowledge', 'prompts'])
  assert.deepEqual(rle.knowledge.map(item => item.id), [...knowledgeKinds])
  assert.deepEqual(rle.knowledge.map(item => item.label), [
    'Cloud files', 'Outlook', 'Teams', 'Fabric', 'Copilot connectors',
    'Dynamics 365 and Power Apps', 'Web search', 'Attachments',
  ])
  assert.deepEqual(rle.knowledge.filter(item => item.enabled).map(item => item.id), ['cloud-files', 'outlook', 'teams', 'web'])
  assert.match(rle.profile.instructions, /fictional/)
  assert.match(rle.profile.instructions, /Do not call tools, send messages/)
  const draft = createBuilderDraft(rle)
  assert.deepEqual(draft.skillIds, [])
  assert.equal(draft.prompts.length, 3)
  assert.ok(draft.prompts.every(prompt => prompt.title === '' && prompt.message === ''))
  assert.ok(draft.knowledge.every(item => item.sourceIds.length === 0))
  assert.equal(draft.status, 'draft')
  assert.equal(draft.mode, 'Auto')
  assert.ok(Number.isFinite(Date.parse(draft.updatedAt)))
})

test('catalog accepts independent recipes and rejects duplicate IDs and invalid schema versions', () => {
  assert.deepEqual(loadRecipeCatalog([rle, museum]).map(item => item.id), ['rle-starter', 'museum-labels'])
  assert.throws(() => loadRecipeCatalog([rle, rle]), /Duplicate builder recipe IDs/)
  assert.throws(() => loadRecipeCatalog([{ ...rle, schemaVersion: 2 }]), /Invalid builder recipe/)
  assert.throws(() => loadRecipeCatalog(Array.from({ length: builderLimits.recipes + 1 }, () => rle)), /Too many/)
})

test('recipe schema validates all identifiers, references, scopes, lengths, and strict objects', () => {
  const invalidCases: [string, (value: BuilderRecipe) => void][] = [
    ['duplicate sections', value => { value.sections.push('instructions') }],
    ['duplicate knowledge', value => { value.knowledge[1] = { ...value.knowledge[0] } }],
    ['duplicate sources', value => { value.sources.push({ ...value.sources[0] }) }],
    ['duplicate skills', value => { value.skills.push({ ...value.skills[0] }) }],
    ['duplicate prompts', value => { value.starterPrompts.push({ ...value.starterPrompts[0] }) }],
    ['duplicate rules', value => { value.simulation.rules.push(structuredClone(value.simulation.rules[0])) }],
    ['duplicate required sources', value => { value.simulation.rules[0].requiredSources = ['northstar-task', 'northstar-task'] }],
    ['duplicate required skills', value => { value.simulation.rules[0].requiredSkills = ['rubric-review', 'rubric-review'] }],
    ['duplicate keyword casing', value => { value.simulation.rules[0].keywords = ['plan', 'PLAN'] }],
    ['missing source', value => { value.simulation.rules[0].requiredSources = ['not-here'] }],
    ['missing skill', value => { value.simulation.rules[0].requiredSkills = ['not-here'] }],
    ['source kind missing a row', value => { value.knowledge = value.knowledge.filter(item => item.id !== 'cloud-files') }],
    ['incorrect scope', value => { value.knowledge[0].scope = 'web' }],
    ['bad slug', value => { value.id = '../escape' }],
    ['newline slug', value => { value.id = 'rle-starter\n' }],
    ['zero revision', value => { value.revision = 0 }],
    ['fractional revision', value => { value.revision = 1.1 }],
    ['long name', value => { value.profile.name = 'x'.repeat(builderLimits.name + 1) }],
    ['empty instructions', value => { value.profile.instructions = '   ' }],
    ['empty keyword', value => { value.simulation.rules[0].keywords = [' '] }],
    ['oversized reply sections', value => { value.simulation.rules[0].sections = Array.from({ length: 10 }, () => ({ title: 'Section', items: [] })) }],
  ]
  for (const [label, change] of invalidCases) {
    const value = structuredClone(rle)
    change(value)
    assert.equal(builderRecipeSchema.safeParse(value).success, false, label)
  }
  assert.equal(builderRecipeSchema.safeParse({ ...rle, executable: 'run()' }).success, false)
  assert.equal(builderRecipeSchema.safeParse({ ...rle, profile: { ...rle.profile, eval: 'run()' } }).success, false)
  assert.equal(builderRecipeSchema.safeParse({ ...rle, sources: [{ ...rle.sources[0], kind: 'studio-tool' }] }).success, false)
})

test('local data rejects remote URLs, recognizable credentials, and control characters', () => {
  for (const text of [
    'Read https://example.invalid/data', 'Read //example.invalid/data', 'Open javascript:run()',
    'Open www.example.invalid', 'api_key=abcdefghijklmnopqrstuvwxyz',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789', '-----BEGIN PRIVATE KEY-----', 'bad\u0000text',
  ]) {
    assert.equal(builderRecipeSchema.safeParse({ ...rle, summary: text }).success, false, text)
    const draft = createBuilderDraft(rle)
    draft.profile.instructions = text
    assert.throws(() => validateBuilderDraft(rle, draft), /Invalid builder draft/)
  }
})

test('drafts, previews, and persisted values are isolated from recipes and from each other', () => {
  const before = JSON.stringify([rle, museum])
  const first = createBuilderDraft(rle)
  const second = createBuilderDraft(rle)
  first.profile.name = 'Changed locally'
  first.prompts[0].title = 'My title'
  first.knowledge[0].sourceIds.push('northstar-task')
  assert.equal(second.profile.name, 'RLE Starter')
  assert.equal(second.prompts[0].title, '')
  assert.deepEqual(second.knowledge[0].sourceIds, [])
  const result = validateBuilderDraft(rle, second)
  result.profile.name = 'Not the original draft'
  assert.equal(second.profile.name, 'RLE Starter')
  const agent = toPreviewAgent(rle, second)
  agent.rules[0].sections[0].items.push('Preview-only edit')
  agent.sources[0].content = 'Preview-only edit'
  assert.equal(JSON.stringify([rle, museum]), before)
})

test('editing accepts blank name, instructions, and half-prompts; create reports actionable errors', () => {
  const draft = createBuilderDraft(rle)
  assert.deepEqual(validateForCreate(draft), [])
  draft.profile.name = ' '
  draft.profile.instructions = ''
  draft.prompts[0].title = 'Only a title'
  draft.prompts[1].message = 'Only a message'
  assert.doesNotThrow(() => validateBuilderDraft(rle, draft))
  assert.equal(toPreviewAgent(rle, draft).name, 'Untitled agent')
  assert.deepEqual(toPreviewAgent(rle, draft).starters, [])
  const errors = validateForCreate(draft)
  assert.equal(errors.length, 4)
  assert.ok(errors.some(error => /agent name/.test(error)))
  assert.ok(errors.some(error => /instructions/.test(error)))
  assert.ok(errors.some(error => /prompt 1/.test(error)))
  assert.ok(errors.some(error => /prompt 2/.test(error)))
  draft.status = 'created'
  assert.throws(() => validateBuilderDraft(rle, draft), /Created builder draft is incomplete/)
  assert.throws(() => decodeBuilderDrafts(saved(draft), [rle]), /incomplete/)
})

test('prompts support at most twelve editable rows and only complete prompts reach preview starters', () => {
  const draft = createBuilderDraft(rle)
  draft.prompts = Array.from({ length: 12 }, (_, index) => ({ id: `row-${index}`, title: '', message: '' }))
  draft.prompts[1] = { id: 'example', title: 'Plan', message: 'Plan the sample task' }
  assert.doesNotThrow(() => validateBuilderDraft(rle, draft))
  assert.deepEqual(toPreviewAgent(rle, draft).starters, [{ label: 'Plan', prompt: 'Plan the sample task' }])
  draft.prompts.push({ id: 'overflow', title: '', message: '' })
  assert.throws(() => validateBuilderDraft(rle, draft), /Invalid builder draft/)
  assert.ok(validateForCreate(draft).some(error => /prompts/.test(error)))
  assert.equal(builderRecipeSchema.safeParse({ ...rle, starterPrompts: draft.prompts }).success, false)
})

test('empty source selection searches all enabled local fixtures; explicit selections narrow by kind', () => {
  const draft = createBuilderDraft(rle)
  const initial = toPreviewAgent(rle, draft)
  assert.ok(initial.sources.some(source => source.title === 'Northstar task brief'))
  assert.ok(initial.sources.some(source => source.title === 'Northstar writing notes'))
  assert.ok(!initial.sources.some(source => source.title === 'Northstar rubric worksheet'))
  assert.match(reply(rle, draft, 'Plan the sample task').text, /illustrative task plan/)
  row(draft, 'cloud-files').sourceIds = ['northstar-writing']
  const missing = reply(rle, draft, 'Plan the sample task')
  assert.match(missing.text, /configuration gap/)
  assert.match(missing.sections[0].items[0], /Northstar task brief/)
  assert.doesNotMatch(missing.text, /illustrative task plan/)
  row(draft, 'cloud-files').sourceIds = []
  assert.match(reply(rle, draft, 'Plan the sample task').text, /illustrative task plan/)
  row(draft, 'cloud-files').sourceIds = ['northstar-task']
  assert.match(reply(rle, draft, 'Plan the sample task').text, /illustrative task plan/)
  row(draft, 'cloud-files').enabled = false
  assert.match(reply(rle, draft, 'Plan the sample task').text, /configuration gap/)
  assert.ok(!toPreviewAgent(rle, draft).sources.some(source => source.title === 'Northstar task brief'))
  row(draft, 'cloud-files').enabled = true
  assert.deepEqual(row(draft, 'cloud-files').sourceIds, ['northstar-task'])
})

test('knowledge and skill prerequisites block canned success until the corresponding configuration is enabled', () => {
  const draft = createBuilderDraft(rle)
  const rubric = reply(rle, draft, 'Create a rubric')
  assert.match(rubric.text, /configuration gap/)
  assert.match(rubric.sections[0].items.join(' '), /Enable Fabric/)
  row(draft, 'fabric').enabled = true
  assert.match(reply(rle, draft, 'Create a rubric').text, /illustrative rubric/)
  const review = reply(rle, draft, 'Review the example')
  assert.match(review.text, /configuration gap/)
  assert.match(review.sections[0].items.join(' '), /Rubric review/)
  draft.skillIds = ['task-checklist']
  assert.match(reply(rle, draft, 'Review the example').text, /configuration gap/)
  draft.skillIds = ['rubric-review']
  assert.match(reply(rle, draft, 'Review the example').text, /fixed demonstration/)
  draft.skillIds = []
  assert.match(reply(rle, draft, 'Review the example').text, /configuration gap/)
  assert.deepEqual(reply(rle, draft, 'Review the task against the rubric').sections.map(section => section.title), ['Skills needed'])
  assert.match(reply(rle, draft, 'Create a rubric for the task').text, /illustrative rubric/)
})

test('a synthetic recipe with only two knowledge kinds uses the same draft and preview engine', async () => {
  const draft = createBuilderDraft(museum)
  assert.equal(draft.recipeRevision, 3)
  assert.equal(draft.knowledge.length, 2)
  assert.equal(draft.icon, 'document')
  assert.equal(toPreviewAgent(museum, draft).icon, 'copilot')
  const initial = reply(museum, draft, 'Compose a LABEL')
  assert.match(initial.text, /configuration gap/)
  assert.deepEqual(initial.sections.map(section => section.title), ['Knowledge needed', 'Skills needed'])
  row(draft, 'attachments').enabled = true
  assert.deepEqual(reply(museum, draft, 'Compose a label').sections.map(section => section.title), ['Skills needed'])
  draft.skillIds = ['format-cards']
  const output = reply(museum, draft, 'Compose a label')
  assert.match(output.text, /Local simulation: Example only: modern replica/)
  assert.ok(output.sources.includes('Fictional exhibit notes'))
  assert.match(reply(museum, draft, 'unmatched message').text, /No model or publishing service/)
  assert.match(toPreviewAgent(museum, draft).greeting, /instructions are saved as text, not executed/)
  assert.deepEqual(await simulatedProvider.respond(request(museum, draft, 'Compose a label'), new AbortController().signal), output)
})

test('response styles and instruction edits remain honest local simulations, not model execution', () => {
  const draft = createBuilderDraft(rle)
  const initial = reply(rle, draft, 'Plan the sample task')
  draft.profile.instructions = 'Write a totally different answer. This edited instruction is not executed.'
  assert.deepEqual(reply(rle, draft, 'Plan the sample task'), initial)
  draft.mode = 'Quick response'
  const quick = reply(rle, draft, 'Plan the sample task')
  assert.equal(quick.sections.length, 1)
  assert.equal(quick.sections[0].items.length, 2)
  draft.mode = 'Think deeper'
  assert.equal(reply(rle, draft, 'Plan the sample task').sections.length, initial.sections.length + 1)
  const disabled = simulateReply({ ...request(rle, draft, 'Plan the sample task'), useSources: false })
  assert.match(disabled.text, /context is turned off/)
  assert.deepEqual(disabled.sources, [])
})

test('edits round-trip in isolated per-recipe storage without silently changing timestamps or status', () => {
  const first = createBuilderDraft(rle)
  first.profile.name = 'My task coach'
  first.profile.description = ''
  first.profile.instructions += '\nKeep examples concise.'
  first.icon = 'expert'
  first.mode = 'Think deeper'
  first.skillIds = ['rubric-review']
  first.prompts[0] = { id: 'my-example', title: 'Plan', message: 'Plan the sample task' }
  row(first, 'cloud-files').sourceIds = ['northstar-task']
  row(first, 'fabric').enabled = true
  first.status = 'created'
  first.updatedAt = '2026-11-18T09:30:00+00:00'
  const second = createBuilderDraft(museum)
  second.updatedAt = '2026-11-18T09:31:00.000Z'
  const drafts = { [first.recipeId]: first, [second.recipeId]: second }
  const encoded = encodeBuilderDrafts(drafts)
  const decoded = decodeBuilderDrafts(encoded, [rle, museum])
  assert.deepEqual(decoded, drafts)
  decoded[rle.id].profile.name = 'Changed again'
  assert.equal(decoded[museum.id].profile.name, 'Museum labels')
  assert.equal(first.profile.name, 'My task coach')
  assert.deepEqual(decodeBuilderDrafts(null, [rle, museum]), {})
  assert.deepEqual(decodeBuilderDrafts(encodeBuilderDrafts({}), [rle, museum]), {})
  assert.notEqual(builderStorageKey, 'copilot-agents-cookbook:chats:v1')
  assert.match(builderStorageKey, /builder-drafts:v1$/)
})

test('storage explicitly rejects malformed, oversized, unsupported, or unknown data', () => {
  assert.throws(() => decodeBuilderDrafts('{broken', [rle]), /not valid JSON/)
  assert.throws(() => decodeBuilderDrafts('', [rle]), SyntaxError)
  assert.throws(() => decodeBuilderDrafts('null', [rle]), /invalid format/)
  assert.throws(() => decodeBuilderDrafts('x'.repeat(maxBuilderStorageLength + 1), [rle]), RangeError)
  assert.throws(() => decodeBuilderDrafts('{"version":2,"drafts":{}}', [rle]), /invalid format/)
  assert.throws(() => decodeBuilderDrafts('{"version":1,"drafts":{},"extra":true}', [rle]), /invalid format/)
  assert.throws(() => decodeBuilderDrafts('{"version":1,"drafts":[]}', [rle]), /invalid format/)
  assert.throws(() => decodeBuilderDrafts('{"version":1,"version":1,"drafts":{}}', [rle]), /duplicate JSON key/)
  assert.throws(() => decodeBuilderDrafts('{"version":1,"\\u0076ersion":1,"drafts":{}}', [rle]), /duplicate JSON key/)
  assert.throws(() => decodeBuilderDrafts('['.repeat(33) + '0' + ']'.repeat(33), [rle]), /nested too deeply/)
  const draft = createBuilderDraft(rle)
  assert.throws(() => decodeBuilderDrafts(
    `{"version":1,"drafts":{"rle-starter":${JSON.stringify(draft)},"rle-starter":${JSON.stringify(draft)}}}`, [rle],
  ), /duplicate JSON key/)
  assert.throws(() => decodeBuilderDrafts(saved({ ...draft, recipeId: 'missing-recipe' }), [rle]), /unknown recipe/)
  assert.throws(() => decodeBuilderDrafts(saved(draft), [rle, rle]), /Duplicate builder recipe IDs/)
  assert.throws(() => encodeBuilderDrafts({ unrelated: draft }), /key .* does not match/)
  assert.throws(() => decodeBuilderDrafts(JSON.stringify({ version: 1, drafts: { unrelated: draft } }), [rle]), /key .* does not match/)
  assert.throws(() => decodeBuilderDrafts(saved({ ...draft, recipeRevision: 2 }), [rle]), /revision .* does not match/)
  assert.throws(() => validateBuilderDraft(museum, draft), /different recipe/)
  const hugeDrafts = Object.fromEntries(Array.from({ length: 50 }, (_, index) => {
    const value = createBuilderDraft(rle)
    value.recipeId = `large-${index}`
    value.profile.instructions = 'x'.repeat(builderLimits.instructions)
    value.prompts = [{ id: 'large-prompt', title: 'Example', message: 'x'.repeat(4000) }]
    return [value.recipeId, value]
  }))
  assert.throws(() => encodeBuilderDrafts(hugeDrafts), /storage limit/)
  hugeDrafts.extra = { ...draft, recipeId: 'extra' }
  assert.throws(() => encodeBuilderDrafts(hugeDrafts), /Too many/)
})

test('draft and storage validation reject duplicate IDs, foreign and cross-kind references, and invalid fields', () => {
  const invalidCases: [string, (draft: BuilderDraft) => void][] = [
    ['duplicate knowledge IDs', draft => { draft.knowledge[1] = { ...draft.knowledge[0] } }],
    ['duplicate prompt IDs', draft => { draft.prompts[1] = { ...draft.prompts[0] } }],
    ['duplicate skill IDs', draft => { draft.skillIds = ['rubric-review', 'rubric-review'] }],
    ['duplicate source IDs', draft => { row(draft, 'cloud-files').sourceIds = ['northstar-task', 'northstar-task'] }],
    ['foreign source ID', draft => { row(draft, 'cloud-files').sourceIds = ['exhibit-notes'] }],
    ['cross-kind source ID', draft => { row(draft, 'fabric').sourceIds = ['northstar-task'] }],
    ['foreign skill ID', draft => { draft.skillIds = ['format-cards'] }],
    ['missing knowledge row', draft => { draft.knowledge.pop() }],
    ['invalid datetime', draft => { draft.updatedAt = 'yesterday' }],
    ['impossible datetime', draft => { draft.updatedAt = '2026-02-30T12:00:00Z' }],
    ['long instructions', draft => { draft.profile.instructions = 'x'.repeat(builderLimits.instructions + 1) }],
  ]
  for (const [label, change] of invalidCases) {
    const draft = createBuilderDraft(rle)
    change(draft)
    assert.throws(() => validateBuilderDraft(rle, draft), TypeError, label)
    assert.throws(() => decodeBuilderDrafts(saved(draft), [rle, museum]), TypeError, label)
  }
  const draft = createBuilderDraft(museum)
  draft.knowledge.push({ id: 'cloud-files', enabled: true, sourceIds: [] })
  assert.throws(() => validateBuilderDraft(museum, draft), /knowledge rows/)
  const base = createBuilderDraft(rle)
  assert.equal(builderDraftSchema.safeParse({ ...base, mode: 'Super smart' }).success, false)
  assert.equal(builderDraftSchema.safeParse({ ...base, status: 'published' }).success, false)
  assert.equal(builderDraftSchema.safeParse({ ...base, profile: { ...base.profile, systemPrompt: 'execute()' } }).success, false)
  assert.equal(builderDraftSchema.safeParse({ ...base, unknown: true }).success, false)
})

test('routes parse only the local chat, gallery, or a single safely encoded recipe slug', () => {
  for (const hash of ['', '#', '#/', '#/chat']) assert.deepEqual(readBuilderRoute(hash), { kind: 'chat' }, hash)
  assert.deepEqual(readBuilderRoute('#/agents/new'), { kind: 'new-agent' })
  assert.deepEqual(readBuilderRoute('#/agents/new/rle-starter'), { kind: 'builder', recipeId: 'rle-starter' })
  assert.deepEqual(readBuilderRoute('#/agents/new/%72le%2Dstarter'), { kind: 'builder', recipeId: 'rle-starter' })
  assert.deepEqual(readBuilderRoute('#/agents/new/unknown-recipe'), { kind: 'builder', recipeId: 'unknown-recipe' })
  for (const hash of [
    'chat', '/chat', '#/chat/', '#/chat?x=1', '#/agents', '#/agents/new/', '#/agents/new//',
    '#/agents/new/rle-starter/extra', '#/agents/new/rle-starter/', '#/agents/new/%',
    '#/agents/new/%E0%A4%A', '#/agents/new/%2F', '#/agents/new/%5C', '#/agents/new/%2E%2E',
    '#/agents/new/%20', '#/agents/new/RLE', '#/agents/new/rle-starter?x=1', '#/agents/new/rle-starter%0A',
    '#/agents/new/rle-starter#other', '#/agents/new/%252F', '#/agents/new/__proto__',
    `#/agents/new/${'x'.repeat(65)}`,
  ]) assert.deepEqual(readBuilderRoute(hash), { kind: 'not-found' }, hash)
})
