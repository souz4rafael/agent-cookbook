import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compileRecipes } from '../scripts/compile-recipes.ts'
import { composeInstructions, identifyInstructionStyle, instructionStyleOptions, instructionLimit, parseInstructionBlocks } from '../src/domain/instructions.ts'
import { recipeSchema } from '../src/domain/validation.ts'
import { createSession, respondLab, updateProfile, selectKnowledge, selectTool, setConnection } from '../src/domain/engine.ts'
import { decodeSession } from '../src/domain/storage.ts'
import { createImplementationBrief } from '../src/domain/export.ts'
import { legacyRecipe } from './legacy-fixture.ts'

const recipes = await compileRecipes(fileURLToPath(new URL('../recipes', import.meta.url)))

test('all recipes provide three distinct complete instruction styles with optional bounded examples', () => {
  for (const recipe of recipes) {
    const styles = recipe.instructionStyles
    assert.ok(styles, recipe.id)
    assert.equal(recipe.agent.instructions, styles.structured)
    assert.equal(new Set(instructionStyleOptions.map(option => styles[option.id])).size, 3)
    for (const option of instructionStyleOptions) {
      for (const includeExamples of [false, true]) {
        const text = composeInstructions(styles, option.id, includeExamples)
        assert.ok(text.length <= instructionLimit)
        assert.ok(styles[option.id].length > 700, 'Templates must explain more than a short purpose statement')
        assert.deepEqual(identifyInstructionStyle(styles, text), { style: option.id, includeExamples })
        assert.ok(!/simulator|stored for export|free.text instructions/i.test(text), 'Simulator notes belong outside reusable instructions')
        assert.ok(!/citations?|\/\s*["']?\w+/i.test(text), 'Do not prescribe system citation display or fake resource bindings')
        assert.ok(parseInstructionBlocks(text).some(block => block.kind === 'heading'))
      }
    }
    assert.equal(identifyInstructionStyle(styles, 'My own edited instructions'), null)
  }
})

test('schema rejects incomplete, unknown, oversized and inconsistent instruction bundles', () => {
  const recipe = recipes[0]
  const source = { ...recipe, knowledge: recipe.knowledge.map(({ content: _content, ...document }) => document) }
  assert.ok(recipeSchema.safeParse(source).success)
  assert.equal(recipeSchema.safeParse({ ...source, instructionStyles: { structured: 'Only one' } }).success, false)
  assert.equal(recipeSchema.safeParse({ ...source, instructionStyles: { ...source.instructionStyles, unsupported: 'extra' } }).success, false)
  assert.equal(recipeSchema.safeParse({ ...source, instructionStyles: { ...source.instructionStyles, examples: ' '.repeat(30) } }).success, false)
  assert.equal(recipeSchema.safeParse({ ...source, instructionStyles: { ...source.instructionStyles, examples: 'x'.repeat(3000) } }).success, false)
  assert.equal(recipeSchema.safeParse({ ...source, agent: { ...source.agent, instructions: 'Does not match Structured' } }).success, false)
  const { estimatedMinutes: _minutes, ...legacy } = legacyRecipe
  assert.ok(recipeSchema.safeParse({ ...legacy, knowledge: legacy.knowledge.map(({ content: _content, ...document }) => document) }).success)
  assert.throws(() => composeInstructions({ structured: 'x'.repeat(2999), stepByStep: 'x', decisionRules: 'y', examples: 'abc' }, 'structured', true), /3000/)
})

test('formatting supports readable headings and flat lists without interpreting executable markup', () => {
  assert.deepEqual(parseInstructionBlocks('# Purpose\n\nHelp residents\nunderstand the process.\n\n- One\n- Two\n\n3. Review\n4. Confirm'), [
    { kind: 'heading', level: 1, text: 'Purpose' },
    { kind: 'paragraph', text: 'Help residents understand the process.' },
    { kind: 'list', ordered: false, start: 1, items: ['One', 'Two'] },
    { kind: 'list', ordered: true, start: 3, items: ['Review', 'Confirm'] },
  ])
  assert.deepEqual(parseInstructionBlocks(''), [])
  const text = '<script>alert(1)</script>\n[click](javascript:alert(1))\n<img src=x onerror=alert(1)>'
  assert.equal(parseInstructionBlocks(text)[0].kind, 'paragraph')
  assert.ok(JSON.stringify(parseInstructionBlocks(text)).includes('<script>'))
})

test('applying any writing style persists and exports exactly that text without changing lab calculations', () => {
  for (const recipe of recipes) {
    let session = createSession(recipe)
    for (const connection of recipe.connections) session = setConnection(recipe, session, connection.id, connection.resources[0].id)
    for (const document of recipe.knowledge) session = selectKnowledge(recipe, session, document.id, true)
    for (const tool of recipe.tools) session = selectTool(recipe, session, tool.id, true)
    const input = recipe.lab!.cases[0].inputs
    const before = respondLab(recipe, session, input)
    for (const option of instructionStyleOptions) {
      const text = composeInstructions(recipe.instructionStyles!, option.id, true)
      const changed = updateProfile(recipe, session, { instructions: text })
      assert.equal(decodeSession(recipe, JSON.stringify(changed)).session.profile.instructions, text)
      const after = respondLab(recipe, changed, input)
      assert.equal(after.text, before.text)
      assert.equal(after.lab?.outcomeId, before.lab?.outcomeId)
      assert.deepEqual(after.lab?.checks, before.lab?.checks)
      const brief = createImplementationBrief(recipe, changed)
      assert.ok(brief.includes(`Proposed instructions: ${text}`))
      assert.ok(brief.includes(`Instruction writing style: ${option.label} with behaviour examples`))
      assert.ok(brief.includes('INSTRUCTION AUTHORING NOTES (NOT PART OF THE INSTRUCTIONS)'))
    }
  }
})

test('same-revision saved custom instructions are preserved rather than replaced by the new default', () => {
  for (const recipe of recipes) {
    const saved = updateProfile(recipe, createSession(recipe), { instructions: 'My previously saved custom draft.' })
    const loaded = decodeSession(recipe, JSON.stringify(saved))
    assert.equal(loaded.warning, null)
    assert.equal(loaded.session.profile.instructions, 'My previously saved custom draft.')
  }
})
