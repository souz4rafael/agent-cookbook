import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyRecipe as recipe } from './legacy-fixture.ts'
import { createSession, respond, selectKnowledge, setAgentIcon, setConnection, updateProfile } from '../src/domain/engine.ts'
import { compiledRecipeSchema } from '../src/domain/validation.ts'
import { decodeSession, loadSession, saveSession, storageKey } from '../src/domain/storage.ts'
import { createImplementationBrief } from '../src/domain/export.ts'
import type { Session } from '../src/domain/types.ts'

assert.ok(compiledRecipeSchema.safeParse(recipe).success, 'The independent legacy fixture must remain valid')

test('session has a namespaced key and roundtrips without modifying the recipe', () => {
  const session = createSession(recipe)
  const loaded = decodeSession(recipe, JSON.stringify(session))
  assert.deepEqual(loaded, { session, warning: null })
  assert.match(storageKey(recipe), /^agent-cookbook:session:v1:/)
  session.profile.name = 'My private exercise'
  assert.notEqual(recipe.agent.name, session.profile.name)
})

test('bad JSON and schema state produce explicit recovery warnings', () => {
  for (const raw of ['{broken', '{}', 'null', '[]', '"not an object"']) {
    const result = decodeSession(recipe, raw)
    assert.ok(result.warning)
    assert.deepEqual(result.session, createSession(recipe))
  }
})

test('recipe revision changes explicitly reset the old session', () => {
  const session = createSession(recipe)
  session.recipeRevision += 1
  const result = decodeSession(recipe, JSON.stringify(session))
  assert.ok(result.warning)
  assert.equal(result.session.recipeRevision, recipe.revision)
})

test('legacy pre-lab revision one sessions reset completely with an English warning', () => {
  assert.equal(recipe.revision, 2)
  const legacy = createSession(recipe)
  legacy.recipeRevision = 1
  legacy.profile.name = 'Cidadão em Dia'
  legacy.messages.push({ id: 'legacy-message', role: 'assistant', text: 'Olá! Vamos lá:' })
  legacy.activity.push({ id: 'legacy-event', at: '2026-11-16T10:00:00.000Z', type: 'answered', text: 'Resposta registrada.' })
  const restored = decodeSession(recipe, JSON.stringify(legacy))
  assert.match(restored.warning!, /new version.*has been reset/)
  assert.deepEqual(restored.session, createSession(recipe))
  assert.equal(restored.session.profile.name, 'Citizen Services Assistant')
  assert.deepEqual(restored.session.messages, [])
  assert.deepEqual(restored.session.activity, [])
})

test('saved state cannot enable unknown resources or unavailable documents', () => {
  const session = createSession(recipe)
  session.connections['nonexistent'] = 'fake-resource'
  assert.ok(decodeSession(recipe, JSON.stringify(session)).warning)
  session.connections = {}
  session.enabledKnowledge = [recipe.knowledge[0].id]
  assert.ok(decodeSession(recipe, JSON.stringify(session)).warning)
})

test('connected and selected sources survive session restore', () => {
  const doc = recipe.knowledge[0]
  const connected = setConnection(recipe, createSession(recipe), doc.connectionId, doc.resourceId)
  const selected = selectKnowledge(recipe, connected, doc.id, true)
  const restored = decodeSession(recipe, JSON.stringify(selected))
  assert.equal(restored.warning, null)
  assert.deepEqual(restored.session, selected)
})

test('agent icon changes survive saving without changing profile or connections', () => {
  const doc = recipe.knowledge[0]
  const previous = selectKnowledge(recipe, setConnection(recipe, createSession(recipe), doc.connectionId, doc.resourceId), doc.id, true)
  const session = setAgentIcon(recipe, previous, 'bot')
  assert.equal(session.agentIcon, 'bot')
  assert.equal(previous.agentIcon, recipe.accentIcon)
  assert.equal(session.profile, previous.profile)
  assert.equal(session.connections, previous.connections)
  assert.deepEqual(decodeSession(recipe, JSON.stringify(session)), { session, warning: null })
  assert.match(createImplementationBrief(recipe, session), /Icon: bot/)
  assert.equal(createSession(recipe).agentIcon, recipe.accentIcon)
})

test('sessions saved before the icon picker retain progress and gain the recipe icon', () => {
  const doc = recipe.knowledge[0]
  let session = selectKnowledge(recipe, setConnection(recipe, createSession(recipe), doc.connectionId, doc.resourceId), doc.id, true)
  session = updateProfile(recipe, session, { name: 'My saved agent', tone: 'formal' })
  const legacy: Partial<Session> = { ...session }
  delete legacy.agentIcon
  assert.deepEqual(decodeSession(recipe, JSON.stringify(legacy)), { session, warning: null })
})

test('invalid saved agent icons are rejected with an explicit recovery warning', () => {
  for (const agentIcon of ['unknown', 'https://example.invalid/icon.svg', '', null, 123]) {
    assert.ok(decodeSession(recipe, JSON.stringify({ ...createSession(recipe), agentIcon })).warning)
  }
})

test('duplicate selections, wrong recipe and dangling historical citations are rejected', () => {
  const doc = recipe.knowledge[0]
  let session = setConnection(recipe, createSession(recipe), doc.connectionId, doc.resourceId)
  session = selectKnowledge(recipe, session, doc.id, true)
  session.enabledKnowledge.push(doc.id)
  assert.ok(decodeSession(recipe, JSON.stringify(session)).warning)
  session = createSession(recipe)
  session.recipeId = 'another-recipe'
  assert.ok(decodeSession(recipe, JSON.stringify(session)).warning)
  session = createSession(recipe)
  session.messages.push({
    id: 'm1',
    role: 'assistant',
    text: 'Old reply',
    response: {
      kind: 'answer',
      text: 'Old reply',
      citations: [{ documentId: 'missing-document', title: 'Unknown', excerpt: 'Unknown' }],
      trace: [],
    },
  })
  assert.ok(decodeSession(recipe, JSON.stringify(session)).warning)
})

test('successful persistence uses the recipe key and null storage starts a fresh exercise', () => {
  const memory = new Map<string, string>()
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
  }
  assert.equal(loadSession(recipe, storage).warning, null)
  const session = createSession(recipe)
  assert.equal(saveSession(recipe, session, storage), null)
  assert.equal(memory.size, 1)
  assert.ok(memory.has(storageKey(recipe)))
  assert.deepEqual(loadSession(recipe, storage).session, session)
})

test('storage unavailable and quota errors are explained; programming errors propagate', () => {
  const unavailable = { getItem: () => { throw new DOMException('Denied', 'SecurityError') } }
  assert.ok(loadSession(recipe, unavailable).warning)
  const full = { setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  assert.ok(saveSession(recipe, createSession(recipe), full))
  assert.throws(() => loadSession(recipe, { getItem: () => { throw new Error('Unexpected') } }), /Unexpected/)
})

test('maximum-length facts and long literal excerpts survive a full saved conversation', () => {
  const large = structuredClone(recipe)
  const fact = large.facts[0]
  fact.answer = 'A'.repeat(4000)
  fact.detail = 'B'.repeat(4000)
  const source = large.knowledge.find(doc => doc.id === fact.documentId)!
  source.content = `${fact.answer}\n${'Fictional context. '.repeat(1000)}\n${fact.detail}`
  assert.ok(compiledRecipeSchema.safeParse(large).success)
  let session = createSession(large)
  session.profile.detail = 'detailed'
  session = setConnection(large, session, source.connectionId, source.resourceId)
  session = selectKnowledge(large, session, source.id, true)
  const response = respond(large, session, fact.keywords[0])
  assert.ok(response.text.length > 8000)
  assert.ok(response.citations[0].excerpt.length > 8000)
  for (let index = 0; index < 50; index++) {
    session.messages.push(
      { id: `u${index}`, role: 'user', text: fact.keywords[0] },
      { id: `a${index}`, role: 'assistant', text: response.text, response },
    )
  }
  const memory = new Map<string, string>()
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value) },
  }
  assert.ok(JSON.stringify(session).length > 1_000_000)
  assert.equal(saveSession(large, session, storage), null)
  assert.equal(loadSession(large, storage).warning, null)
  assert.equal(loadSession(large, storage).session.messages.length, 100)
})

test('an oversized save never replaces a previously readable session', () => {
  const session = createSession(recipe)
  const previous = JSON.stringify(session)
  let stored = previous
  for (let index = 0; index < 100; index++) {
    session.messages.push({
      id: `a${index}`, role: 'assistant', text: 'a'.repeat(10_000),
      response: {
        kind: 'answer', text: 'a'.repeat(10_000), trace: [],
        citations: [{ documentId: recipe.knowledge[0].id, title: 'Source', excerpt: 'b'.repeat(60_000) }],
      },
    })
  }
  const warning = saveSession(recipe, session, { setItem: (_key, value) => { stored = value } })
  assert.match(warning!, /last valid save was preserved/)
  assert.equal(stored, previous)
  assert.equal(decodeSession(recipe, stored).warning, null)
})

test('export describes limitations and configuration but excludes chat and case contents', () => {
  const session = createSession(recipe)
  session.profile.description = 'LEGACY-DESCRIPTION-NOT-EXPORTED'
  session.profile.name = 'Configured name'
  session.messages.push({ id: 'm1', role: 'user', text: 'DO-NOT-EXPORT-CHAT' })
  session.cases.push({ id: 'c1', toolId: recipe.tools[0].id, resourceId: recipe.tools[0].resourceId, summary: 'DO-NOT-EXPORT-CASE', at: new Date().toISOString() })
  const text = createImplementationBrief(recipe, session)
  assert.ok(!text.includes('LEGACY-DESCRIPTION-NOT-EXPORTED'))
  assert.doesNotMatch(text, /^Description:/m)
  assert.match(text, /Configured name/)
  assert.match(text, /not an importable/)
  assert.ok(!text.includes('DO-NOT-EXPORT'))
  assert.ok(text.includes(recipe.sourceUrl))
})
