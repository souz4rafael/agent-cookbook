import { createSession, selectKnowledge, selectTool, setConnection } from '../src/domain/engine.ts'
import { getEvaluationRows } from '../src/domain/evaluation.ts'
import type { CompiledRecipe } from '../src/domain/types.ts'
import { compileRecipes } from './compile-recipes.ts'

export function verifyStudioCases(recipe: CompiledRecipe): number {
  if (!recipe.lab) throw new Error(`${recipe.id}: new recipes require an interactive lab with explicit expected cases.`)
  let session = createSession(recipe)
  for (const connection of recipe.connections) {
    session = setConnection(recipe, session, connection.id, connection.resources[0].id)
  }
  for (const document of recipe.knowledge) session = selectKnowledge(recipe, session, document.id, true)
  for (const tool of recipe.tools) session = selectTool(recipe, session, tool.id, true)
  const rows = getEvaluationRows(recipe, session)
  const failures = rows.flatMap(row => (row.assertions ?? []).filter(assertion => !assertion.passed)
    .map(assertion => `${recipe.id}/${row.caseId}: ${assertion.label}: expected ${assertion.expected}; received ${assertion.actual}`))
  if (failures.length) throw new Error(`Recipe behaviour does not match its cases:\n${failures.join('\n')}`)
  return rows.length
}

export async function validateStudioDrafts(directory: string) {
  const recipes = await compileRecipes(directory, { includeDrafts: true })
  for (const recipe of recipes) verifyStudioCases(recipe)
  return recipes
}
