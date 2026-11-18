import { z } from 'zod'
import { createSession } from './engine.ts'
import { agentProfileSchema } from './validation.ts'
import { evaluationAssertionSchema, labDraftSchema, labInputsSchema, labInputsValid, labResponseSchema, learningEvidenceSchema } from './lab-validation.ts'
import { agentIcons, messageReactions } from './types.ts'
import type { CompiledRecipe, Session } from './types.ts'

const MAX_SAVED_CHARACTERS = 5_000_000
// Lab answers include rendered drafts; an excerpt may span a full 64 KB document.
const shortText = z.string().max(15_000)
const responseSchema = z.strictObject({
  kind: z.enum(['answer', 'missing-knowledge', 'out-of-scope', 'handoff-ready', 'handoff-blocked']),
  text: shortText,
  citations: z.array(z.strictObject({
    documentId: z.string(),
    title: z.string().max(200),
    excerpt: z.string().max(65_536),
  })).max(40),
  trace: z.array(z.string().max(2000)).max(80),
  toolId: z.string().optional(),
  lab: labResponseSchema.optional(),
  draft: labDraftSchema.optional(),
})

const sessionSchema = z.strictObject({
  version: z.literal(1),
  recipeId: z.string(),
  recipeRevision: z.number().int().positive(),
  profile: agentProfileSchema,
  agentIcon: z.enum(agentIcons).optional(),
  connections: z.record(z.string(), z.string()),
  enabledKnowledge: z.array(z.string()).max(50),
  enabledTools: z.array(z.string()).max(20),
  messages: z.array(z.strictObject({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    text: shortText,
    response: responseSchema.optional(),
    reaction: z.enum(messageReactions).optional(),
  }).refine(message => message.role !== 'user' || message.text.length <= 2000, 'User input cannot exceed 2000 characters.')).max(100),
  activity: z.array(z.strictObject({
    id: z.string(),
    at: z.iso.datetime(),
    type: z.enum(['answered', 'escalated', 'connection', 'configuration']),
    text: shortText,
  })).max(100),
  cases: z.array(z.strictObject({
    id: z.string(),
    toolId: z.string(),
    resourceId: z.string(),
    summary: z.string().max(6000),
    at: z.iso.datetime(),
    outcomeId: z.string().optional(),
  })).max(50),
  evaluation: z.strictObject({
    name: z.string().trim().min(1).max(100),
    createdAt: z.iso.datetime(),
    lastRun: z.strictObject({
      ranAt: z.iso.datetime(),
      fingerprint: z.string().min(1).max(50_000),
      rows: z.array(z.strictObject({
        question: z.string().min(1).max(500),
        response: responseSchema,
        caseId: z.string().optional(),
        assertions: z.array(evaluationAssertionSchema).min(1).max(100).optional(),
      })).min(1).max(30),
    }).optional(),
  }).optional(),
  labInputs: labInputsSchema.optional(),
  learningEvidence: learningEvidenceSchema.optional(),
})

export interface SessionLoad {
  session: Session
  warning: string | null
}

export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function storageKey(recipe: CompiledRecipe): string {
  return `agent-cookbook:session:v1:${recipe.id}`
}

export function decodeSession(recipe: CompiledRecipe, raw: string | null): SessionLoad {
  const fresh = createSession(recipe)
  if (raw === null) return { session: fresh, warning: null }
  if (raw.length > MAX_SAVED_CHARACTERS) {
    return { session: fresh, warning: 'Your saved progress exceeded the limit for this beta and has been reset.' }
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return { session: fresh, warning: 'Your saved progress could not be read and has been reset.' }
  }
  const parsed = sessionSchema.safeParse(value)
  if (!parsed.success) {
    return { session: fresh, warning: 'Your saved progress was incompatible or invalid and has been reset.' }
  }
  const session: Session = { ...parsed.data, agentIcon: parsed.data.agentIcon ?? recipe.accentIcon }
  if (session.recipeId !== recipe.id || session.recipeRevision !== recipe.revision) {
    return { session: fresh, warning: 'This recipe has a new version. Your exercise has been reset to keep its configuration consistent.' }
  }
  const validConnections = Object.entries(session.connections).every(([id, resource]) =>
    recipe.connections.some(connection =>
      connection.id === id && connection.resources.some(item => item.id === resource)))
  const validKnowledge = session.enabledKnowledge.every(id =>
    recipe.knowledge.some(document => document.id === id &&
      session.connections[document.connectionId] === document.resourceId))
  const validTools = session.enabledTools.every(id =>
    recipe.tools.some(tool => tool.id === id &&
      session.connections[tool.connectionId] === tool.resourceId))
  const profileKeys = ['name', 'description', 'instructions', 'tone', 'detail'] as const
  const validProfile = profileKeys.every(key =>
    recipe.editable.includes(key) || session.profile[key] === recipe.agent[key])
  const lab = recipe.lab
  const validAction = (toolId: string, outcomeId: string) =>
    !!lab?.outcomes.some(outcome => outcome.id === outcomeId && outcome.toolId === toolId)
      && recipe.tools.some(tool => tool.id === toolId)
  const validResponse = (response: Session['messages'][number]['response']) => {
    if (!response) return true
    if (!response.citations.every(citation => recipe.knowledge.some(doc => doc.id === citation.documentId)) ||
      (response.toolId !== undefined && !recipe.tools.some(tool => tool.id === response.toolId))) return false
    if (!response.lab) return response.draft === undefined || (response.kind === 'handoff-ready' && response.toolId !== undefined)
    if (!lab || !labInputsValid(lab, response.lab.inputs)) return false
    const snapshot = response.lab
    const outcome = lab.outcomes.find(item => item.id === snapshot.outcomeId)
    if (!outcome || !lab.rules.some(rule => rule.id === snapshot.ruleId && rule.outcomeId === outcome.id)) return false
    if (snapshot.checks.length !== lab.checks.length ||
      new Set(snapshot.checks.map(check => check.id)).size !== snapshot.checks.length ||
      !snapshot.checks.every(check => lab.checks.some(item => item.id === check.id))) return false
    if (response.kind === 'handoff-ready'
      ? response.toolId !== outcome.toolId || !outcome.toolId
      : response.toolId !== undefined) return false
    if (response.kind === 'handoff-blocked' && !outcome.toolId) return false
    if (response.kind === 'out-of-scope' || (response.kind === 'answer' && outcome.toolId)) return false
    return response.draft === undefined || (!!outcome.draft && response.kind !== 'missing-knowledge')
  }
  const validHistory = session.messages.every(message =>
    (!message.reaction || message.role === 'assistant') && validResponse(message.response)
  ) && session.cases.every(item =>
    recipe.tools.some(tool => tool.id === item.toolId && tool.resourceId === item.resourceId) &&
    (item.outcomeId === undefined || validAction(item.toolId, item.outcomeId)))
  const evaluationRows = session.evaluation?.lastRun?.rows
  const validEvaluation = !evaluationRows || (
    evaluationRows.length === (lab ? lab.cases.length : recipe.test.suggestedQuestions.length) &&
    evaluationRows.every((row, index) => validResponse(row.response) && (lab
      ? row.question === lab.cases[index].title && row.caseId === lab.cases[index].id
      : row.question === recipe.test.suggestedQuestions[index] && row.caseId === undefined && row.assertions === undefined))
  )
  const evidence = session.learningEvidence
  const validLabInputs = session.labInputs === undefined || (!!lab && labInputsValid(lab, session.labInputs))
  const validEvidence = evidence === undefined || (!!lab &&
    evidence.testedCases.every(item => lab.cases.some(testCase => testCase.id === item.id)) &&
    evidence.citations.every(item => recipe.knowledge.some(document => document.id === item.documentId)) &&
    evidence.actions.every(item => validAction(item.toolId, item.outcomeId)))
  const uniqueSelections =
    new Set(session.enabledKnowledge).size === session.enabledKnowledge.length &&
    new Set(session.enabledTools).size === session.enabledTools.length
  if (!validConnections || !validKnowledge || !validTools || !validProfile || !validHistory || !validEvaluation || !uniqueSelections || !validLabInputs || !validEvidence) {
    return { session: fresh, warning: 'Your saved progress contained invalid references and has been reset.' }
  }
  return { session, warning: null }
}

export function loadSession(recipe: CompiledRecipe, storage: Pick<SessionStorage, 'getItem'>): SessionLoad {
  let raw: string | null
  try {
    raw = storage.getItem(storageKey(recipe))
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    return {
      session: createSession(recipe),
      warning: 'Your browser blocked local storage. The exercise works, but progress may not be retained after you close the page.',
    }
  }
  return decodeSession(recipe, raw)
}

export function saveSession(recipe: CompiledRecipe, session: Session, storage: Pick<SessionStorage, 'setItem'>): string | null {
  const raw = JSON.stringify(session)
  if (raw.length > MAX_SAVED_CHARACTERS || decodeSession(recipe, raw).warning) {
    return 'Your current progress could not be saved because it exceeds the limits or contains incompatible data. The last valid save was preserved; clear the conversation to reduce its history.'
  }
  try {
    storage.setItem(storageKey(recipe), raw)
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
    return 'Could not save in this browser. Your progress remains in this tab, but may be lost when you reload.'
  }
  return null
}
