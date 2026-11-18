import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyRecipe as recipe } from './legacy-fixture.ts'
import { createSession, respond, selectTool, setConnection } from '../src/domain/engine.ts'
import { confirmOfferedHandoff } from '../src/domain/actions.ts'
import type { Session } from '../src/domain/types.ts'

const tool = recipe.tools[0]

function offered(): Session {
  let session = createSession(recipe)
  session = setConnection(recipe, session, tool.connectionId, tool.resourceId)
  session = selectTool(recipe, session, tool.id, true)
  const response = respond(recipe, session, recipe.test.handoffKeywords[0])
  session.messages.push({ id: 'offer-1', role: 'assistant', text: response.text, response })
  return session
}

test('only an active latest offer permits explicit confirmation', () => {
  assert.throws(() => confirmOfferedHandoff(recipe, createSession(recipe), tool.id, 'Fictional request'), /no longer active/)
  const result = confirmOfferedHandoff(recipe, offered(), tool.id, 'Fictional request')
  assert.equal(result.cases.length, 1)
  assert.throws(() => confirmOfferedHandoff(recipe, result, tool.id, 'Fictional request'), /no longer active/)
  assert.equal(result.cases.length, 1)
})

test('a later message, cleared conversation or disconnected tool invalidates an old offer', () => {
  const later = offered()
  later.messages.push({ id: 'later', role: 'user', text: 'Different question' })
  assert.throws(() => confirmOfferedHandoff(recipe, later, tool.id, 'Fictional request'), /no longer active/)
  const cleared = { ...offered(), messages: [] }
  assert.throws(() => confirmOfferedHandoff(recipe, cleared, tool.id, 'Fictional request'), /no longer active/)
  const disconnected = setConnection(recipe, offered(), tool.connectionId, null)
  assert.throws(() => confirmOfferedHandoff(recipe, disconnected, tool.id, 'Fictional request'), /blocked/)
})
