import { assertSession, getConfigurationFingerprint, respond, respondLab } from './engine.ts'
import { compareLabExpectation } from './lab.ts'
import type { CompiledRecipe, EvaluationRow, Session } from './types.ts'

export function saveEvaluation(recipe: CompiledRecipe, session: Session, name: string): Session {
  assertSession(recipe, session)
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw new Error('Enter an evaluation name of 1 to 100 characters.')
  }
  if ((recipe.lab?.cases.length ?? recipe.test.suggestedQuestions.length) === 0) throw new Error('This recipe has no evaluation questions.')
  const previous = session.evaluation
  if (previous?.name === name.trim()) return session
  return {
    ...session,
    evaluation: {
      ...previous,
      name: name.trim(),
      createdAt: previous?.createdAt ?? new Date().toISOString(),
    },
  }
}

export function getEvaluationRows(recipe: CompiledRecipe, session: Session): EvaluationRow[] {
  assertSession(recipe, session)
  return recipe.lab ? recipe.lab.cases.map(testCase => {
    const isolated = { ...session, messages: [],
      enabledKnowledge: session.enabledKnowledge.filter(id => !testCase.disabledKnowledge?.includes(id)),
      enabledTools: session.enabledTools.filter(id => !testCase.disabledTools?.includes(id)),
    }
    const response = respondLab(recipe, isolated, testCase.inputs)
    return { question: testCase.title, caseId: testCase.id, response, assertions: compareLabExpectation(testCase, response) }
  }) : recipe.test.suggestedQuestions.map(question => ({ question, response: respond(recipe, session, question) }))
}

export function runEvaluation(recipe: CompiledRecipe, session: Session): Session {
  assertSession(recipe, session)
  if (!session.evaluation) throw new Error('Create an evaluation before running it.')
  if ((recipe.lab?.cases.length ?? recipe.test.suggestedQuestions.length) === 0) throw new Error('This recipe has no evaluation questions.')
  const rows = getEvaluationRows(recipe, session)
  return {
    ...session,
    evaluation: {
      ...session.evaluation,
      lastRun: {
        ranAt: new Date().toISOString(),
        fingerprint: getConfigurationFingerprint(session),
        rows,
      },
    },
  }
}
