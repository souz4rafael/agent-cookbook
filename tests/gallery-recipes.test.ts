import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { recipeHarness } from '../src/domain/catalog.ts'
import { getBusinessScenarios, getScenarioRecipe } from '../src/content/scenarios.ts'
import { advanceConversation, startConversation } from '../src/conversations/runtime.ts'
import type { ConversationRun } from '../src/conversations/runtime.ts'
import { simulateStudioConversation } from '../src/domain/conversations.ts'
import { createSession, getConfigurationFingerprint, respondLab, selectKnowledge, setConnection } from '../src/domain/engine.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes/', import.meta.url)))
const gallery = recipes.filter(r => r.id.startsWith('gallery-'))

test('the four reviewed Gallery packages have neither Topics nor Additional settings Web browsing', () => {
  for (const r of gallery) {
    assert.equal(r.harnessFeatures?.topics, false)
    assert.equal(r.harnessFeatures.additionalSettingsWebBrowsing, false)
    assert.ok(r.harnessFeatures.sourceUrl)
    assert.equal(recipeHarness(r), 'Copilot Harness')
  }
})

test('each Gallery recipe is attributed and reachable from the public scenario catalogue', () => {
  assert.equal(gallery.length, 4)
  const stories = getBusinessScenarios(recipes)
  for (const r of gallery) {
    const story = stories.find(s => s.recipeId === r.id)
    assert.ok(story)
    assert.equal(getScenarioRecipe(story, recipes), r)
    assert.equal(new URL(story.sourceUrl).origin, 'https://microsoft.github.io')
    assert.ok(story.sourceLabel)
  }
})

for (const recipe of gallery) {
  test(`${recipe.id}: a guided reply uses the selected evidence and does not create records`, () => {
    for (const enabled of [false, true]) {
      let session = createSession(recipe)
      if (enabled) {
        for (const c of recipe.connections) session = setConnection(recipe, session, c.id, c.resources[0].id)
        for (const d of recipe.knowledge) session = selectKnowledge(recipe, session, d.id, true)
      }
      const before = structuredClone(session)
      const cfg = getConfigurationFingerprint(session)
      const simulate = (prompt: string) => simulateStudioConversation(recipe, session, prompt)
      for (const script of recipe.conversations!) {
        const visit = (run: ConversationRun) => {
          if (run.currentStepId === null) {
            const result = run.messages.at(-1)?.simulation
            assert.ok(result)
            assert.equal(result.sources.length > 0, enabled)
            if (!enabled) assert.ok(result.text.includes(recipe.test.missingKnowledgeAnswer))
            return
          }
          const step = script.steps.find(s => s.id === run.currentStepId)
          assert.ok(step?.role === 'user' && step.choices?.length)
          for (const choice of step.choices) {
            const next = advanceConversation(script, run, choice.label, cfg, simulate)
            assert.equal(next.accepted, true)
            visit(next.run)
          }
        }
        visit(startConversation(script, cfg, 'gallery-example', simulate))
      }
      assert.deepEqual(session, before)
    }
  })
}

test('an unavailable external source does not erase an independent internal finding', () => {
  const r = gallery.find(item => item.id === 'gallery-contract-compliance-reviewer')!
  const c = r.connections[0]
  let session = setConnection(r, createSession(r), c.id, c.resources[0].id)
  session = selectKnowledge(r, session, 'draft-extract', true)
  for (const policy of [false,true]) for (const authority of [false,true]) {
    session = selectKnowledge(r, selectKnowledge(r, session, 'desk-playbook', policy), 'authority-card', authority)
    const res = respondLab(r, session, {pass:'both',body:30,annex:75,area:'grey-quay',date:'within'})
    assert.ok(res.text.includes('CONSISTENCY ISSUE'))
    assert.equal(res.text.includes('ORG POLICY CONFLICT'), policy)
    assert.equal(res.text.includes('LEGAL CONFLICT'), authority)
    assert.equal(res.text.includes('Legal review not assessed'), !authority)
  }
})
