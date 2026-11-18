import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyRecipe as recipe } from './legacy-fixture.ts'
import { createSession, getConfigurationFingerprint, toggleMessageReaction } from '../src/domain/engine.ts'
import { decodeSession } from '../src/domain/storage.ts'

function conversation() {
  const session = createSession(recipe)
  session.messages = [
    { id: 'user-1', role: 'user', text: 'A fictional question' },
    { id: 'agent-1', role: 'assistant', text: 'A fictional response' },
    { id: 'user-2', role: 'user', text: 'Another fictional question' },
    { id: 'agent-2', role: 'assistant', text: 'Another response' },
  ]
  return session
}

test('feedback is independent per agent message, exclusive and toggles off on a repeated choice', () => {
  const before = conversation()
  const liked = toggleMessageReaction(recipe, before, 'agent-1', 'like')
  assert.equal(before.messages[1].reaction, undefined)
  assert.equal(liked.messages[1].reaction, 'like')
  const switched = toggleMessageReaction(recipe, liked, 'agent-1', 'dislike')
  assert.equal(switched.messages[1].reaction, 'dislike')
  const independent = toggleMessageReaction(recipe, switched, 'agent-2', 'like')
  assert.equal(independent.messages[1].reaction, 'dislike')
  assert.equal(independent.messages[3].reaction, 'like')
  const cleared = toggleMessageReaction(recipe, independent, 'agent-1', 'dislike')
  assert.equal(Object.hasOwn(cleared.messages[1], 'reaction'), false)
  assert.equal(cleared.messages[3].reaction, 'like')
  assert.equal(cleared.profile, before.profile)
  assert.equal(cleared.activity, before.activity)
  assert.equal(cleared.cases, before.cases)
  assert.equal(getConfigurationFingerprint(cleared), getConfigurationFingerprint(before))
})

test('only existing assistant messages in the current recipe can receive supported reactions', () => {
  const session = conversation()
  for (const id of ['user-1', 'missing']) assert.throws(() => toggleMessageReaction(recipe, session, id, 'like'), /agent message/)
  assert.throws(() => toggleMessageReaction(recipe, { ...session, messages: [] }, 'agent-1', 'like'), /agent message/)
  assert.throws(() => toggleMessageReaction({ ...recipe, revision: recipe.revision + 1 }, session, 'agent-1', 'like'), /does not match/)
  // @ts-expect-error Runtime callers must not be able to store unsupported reactions.
  assert.throws(() => toggleMessageReaction(recipe, session, 'agent-1', 'unknown'), /Like or Dislike/)
  assert.ok(session.messages.every(message => message.reaction === undefined))
})

test('reactions survive reload, legacy messages work, and user-message feedback is rejected', () => {
  const legacy = conversation()
  assert.deepEqual(decodeSession(recipe, JSON.stringify(legacy)), { session: legacy, warning: null })
  const session = toggleMessageReaction(recipe, legacy, 'agent-1', 'like')
  assert.deepEqual(decodeSession(recipe, JSON.stringify(session)), { session, warning: null })
  const invalid = structuredClone(session)
  invalid.messages[0].reaction = 'dislike'
  assert.ok(decodeSession(recipe, JSON.stringify(invalid)).warning)
  const unsupported = { ...session, messages: session.messages.map(message => ({ ...message, reaction: 'unknown' })) }
  assert.ok(decodeSession(recipe, JSON.stringify(unsupported)).warning)
})
