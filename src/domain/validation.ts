import { z } from 'zod'
import { labDefinitionSchema, labReferenceIssues } from './lab-validation.ts'
import type { CompiledRecipe, Recipe } from './types.ts'
import { conversationsSchema } from '../conversations/schema.ts'

const id = z.string().min(1).max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'Use a lower-case identifier with words separated by hyphens.')
const shortText = z.string().min(1).max(600).refine((value) => value.trim().length > 0, 'Text cannot contain only whitespace.')
const title = z.string().min(1).max(140).refine((value) => value.trim().length > 0, 'The title cannot contain only whitespace.')
const homeText = z.string().trim().min(21).max(200)
const scenarioSchema = z.strictObject({
  group: z.strictObject({ journey: title, perspective: z.enum(['guidance', 'operations']) }).optional(),
  headline: title, problem: shortText, impact: shortText, approach: shortText, startSmall: shortText,
  potentialValue: shortText, measure: shortText, boundary: shortText, sourceLabel: title.optional(),
  home: z.strictObject({ challenge: homeText, experiment: homeText, takeaway: homeText, scope: homeText }),
})
const answer = z.string().min(1).max(4_000).refine((value) => value.trim().length > 0, 'The answer cannot contain only whitespace.')
const keyword = z.string().min(1).max(100).refine((value) => /[\p{L}\p{N}]/u.test(value), 'A keyword must contain letters or numbers.')
const editableKey = z.enum(['name', 'description', 'instructions', 'tone', 'detail'])
const resourceSchema = z.strictObject({ id, label: title, description: shortText })
const connectionFields = {
  id,
  title,
  description: shortText,
  accountLabel: z.string().min(1).max(200),
  resources: z.array(resourceSchema).min(1).max(20),
  realWorldNote: shortText,
}
const connectionSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...connectionFields, type: z.literal('sharepoint') }),
  z.strictObject({ ...connectionFields, type: z.literal('service-desk') }),
])

function hasDisallowedControls(value: string, allowWhitespace = false): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if ((code < 32 || code === 127) && !(allowWhitespace && (code === 9 || code === 10 || code === 13))) return true
  }
  return false
}

function isSafeDocumentPath(value: string): boolean {
  if (/^[\\/]/u.test(value) || /[<>:"|?*]/u.test(value) || hasDisallowedControls(value)) return false
  const segments = value.split(/[\\/]/u)
  return segments.every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[. ]$/u.test(part))
    && /\.txt$/iu.test(value)
}

const knowledgeFields = {
  id,
  title,
  summary: shortText,
  connectionId: id,
  resourceId: id,
  file: z.string().min(1).max(240).refine(isSafeDocumentPath, 'Use a relative .txt path without an absolute prefix, "."/".." segments or reserved characters.'),
}
const knowledgeSchema = z.strictObject(knowledgeFields)
const compiledKnowledgeSchema = z.strictObject({
  ...knowledgeFields,
  content: z.string().min(1).max(65_536)
    .refine((value) => new TextEncoder().encode(value).length <= 65_536, 'The document must be no larger than 64 KB in UTF-8.')
    .refine((value) => value.trim().length > 0 && !hasDisallowedControls(value, true), 'The document must contain non-empty UTF-8 text without binary characters.'),
})
const conditionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('profile-edited') }),
  z.strictObject({ type: z.literal('behavior-edited') }),
  z.strictObject({ type: z.literal('connection'), connectionId: id }),
  z.strictObject({ type: z.literal('knowledge'), documentId: id }),
  z.strictObject({ type: z.literal('tool'), toolId: id }),
  z.strictObject({ type: z.literal('event'), event: z.enum(['answered', 'escalated']) }),
  z.strictObject({ type: z.literal('case-tested'), caseId: id }),
  z.strictObject({ type: z.literal('citation-opened'), documentId: id }),
  z.strictObject({ type: z.literal('action-confirmed'), toolId: id, outcomeId: id }),
  z.strictObject({ type: z.literal('evaluation-passed') }),
])
export const agentProfileSchema = z.strictObject({
  name: z.string().min(1).max(100).refine((value) => value.trim().length > 0, 'The name cannot be blank.'),
  description: z.string().max(600),
  instructions: z.string().max(3_000),
  tone: z.enum(['friendly', 'formal']),
  detail: z.enum(['concise', 'detailed']),
})

const sourceUrl = z.url().max(2_000).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}, 'The source must use HTTPS without credentials in the URL.')

const recipeFields = {
  schemaVersion: z.literal(1),
  revision: z.number().int().min(1).max(1_000_000),
  id,
  status: z.enum(['draft', 'published']),
  title,
  summary: shortText,
  industry: z.string().min(1).max(100),
  harnessFeatures: z.strictObject({ topics: z.boolean(), additionalSettingsWebBrowsing: z.boolean(), sourceUrl: sourceUrl.optional() }).optional(),
  difficulty: z.enum(['beginner', 'intermediate']),
  estimatedMinutes: z.number().int().min(1).max(180).optional(),
  accentIcon: z.enum(['citizen', 'document', 'learning', 'benefit']),
  learningGoals: z.array(shortText).min(1).max(12),
  scenario: scenarioSchema.optional(),
  sourceUrl,
  agent: agentProfileSchema,
  instructionStyles: z.strictObject({
    structured: answer.max(3000),
    stepByStep: answer.max(3000),
    decisionRules: answer.max(3000),
    examples: answer.max(3000),
  }).optional(),
  editable: z.array(editableKey).max(5),
  connections: z.array(connectionSchema).max(12),
  knowledge: z.array(knowledgeSchema).max(40),
  facts: z.array(z.strictObject({
    id,
    documentId: id,
    keywords: z.array(keyword).min(1).max(20),
    answer,
    detail: answer,
    toolId: id.optional(),
  })).max(80),
  tools: z.array(z.strictObject({
    id,
    type: z.literal('create-case'),
    title,
    description: shortText,
    connectionId: id,
    resourceId: id,
    realWorldNote: shortText,
    requiredKnowledge: z.array(id).min(1).max(40).optional(),
  })).max(12),
  skills: z.array(z.strictObject({
    id, title, description: shortText, instructions: answer,
    coverage: z.enum(['simulated', 'reference']),
  })).min(1).max(20).optional(),
  journey: z.array(z.strictObject({
    id,
    title,
    description: shortText,
    tab: z.enum(['overview', 'knowledge', 'tools', 'activity', 'handoff']),
    completeWhen: conditionSchema,
  })).min(1).max(24),
  test: z.strictObject({
    suggestedQuestions: z.array(z.string().min(1).max(500)).min(1).max(12),
    handoffKeywords: z.array(keyword).max(20),
    unknownAnswer: answer,
    missingKnowledgeAnswer: answer,
    handoffBlockedAnswer: answer,
    handoffReadyAnswer: answer,
  }),
  implementation: z.array(z.strictObject({ title, description: shortText })).min(1).max(12),
  lab: labDefinitionSchema.optional(),
  conversations: conversationsSchema.optional(),
}

type ReferenceIssue = { path: (string | number)[]; message: string }

function referenceIssues(recipe: Recipe): ReferenceIssue[] {
  const issues: ReferenceIssue[] = []
  const add = (path: ReferenceIssue['path'], message: string) => issues.push({ path, message })
  if (recipe.instructionStyles) {
    if (recipe.agent.instructions !== recipe.instructionStyles.structured) add(['agent', 'instructions'], 'Default instructions must match the Structured variant.')
    for (const style of ['structured', 'stepByStep', 'decisionRules'] as const) {
      if (`${recipe.instructionStyles[style]}\n\n${recipe.instructionStyles.examples}`.length > 3000) add(['instructionStyles', style], 'This style plus behaviour examples exceeds the 3000-character instruction limit.')
    }
  }
  const unique = (items: { id: string }[], path: ReferenceIssue['path']) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      if (seen.has(item.id)) add([...path, index, 'id'], `Duplicate identifier "${item.id}".`)
      seen.add(item.id)
    })
  }
  unique(recipe.connections, ['connections'])
  unique(recipe.knowledge, ['knowledge'])
  unique(recipe.facts, ['facts'])
  unique(recipe.tools, ['tools'])
  unique(recipe.skills ?? [], ['skills'])
  recipe.skills?.forEach((skill, index) => {
    if (skill.coverage === 'simulated' && !recipe.lab?.outcomes.some(outcome => outcome.skillId === skill.id)) {
      add(['skills', index, 'coverage'], 'A simulated skill requires a linked lab outcome; otherwise mark it reference-only.')
    }
  })
  unique(recipe.journey, ['journey'])
  recipe.connections.forEach((connection, index) => unique(connection.resources, ['connections', index, 'resources']))
  recipe.editable.forEach((key, index) => {
    if (recipe.editable.indexOf(key) !== index) add(['editable', index], `Duplicate editable field "${key}".`)
  })

  const connections = new Map(recipe.connections.map((connection) => [connection.id, connection]))
  const documents = new Set(recipe.knowledge.map((document) => document.id))
  const tools = new Set(recipe.tools.map((tool) => tool.id))
  const checkResource = (item: { connectionId: string; resourceId: string }, path: ReferenceIssue['path'], expectedType: 'sharepoint' | 'service-desk') => {
    const connection = connections.get(item.connectionId)
    if (!connection) {
      add([...path, 'connectionId'], `Unknown connection "${item.connectionId}".`)
      return
    }
    if (connection.type !== expectedType) add([...path, 'connectionId'], `This component requires a connection of type "${expectedType}".`)
    if (!connection.resources.some((resource) => resource.id === item.resourceId)) {
      add([...path, 'resourceId'], `Resource "${item.resourceId}" does not exist in connection "${item.connectionId}".`)
    }
  }
  recipe.knowledge.forEach((document, index) => checkResource(document, ['knowledge', index], 'sharepoint'))
  recipe.tools.forEach((tool, index) => checkResource(tool, ['tools', index], 'service-desk'))
  recipe.facts.forEach((fact, index) => {
    if (!documents.has(fact.documentId)) add(['facts', index, 'documentId'], `Unknown document "${fact.documentId}".`)
    if (fact.toolId) {
      const tool = recipe.tools.find(item => item.id === fact.toolId)
      if (!tool) add(['facts', index, 'toolId'], `Unknown tool "${fact.toolId}".`)
      else if (!tool.requiredKnowledge?.includes(fact.documentId)) add(['facts', index, 'toolId'], 'A fact-linked tool must require the fact source in requiredKnowledge.')
    }
  })
  recipe.tools.forEach((tool, index) => {
    tool.requiredKnowledge?.forEach((documentId, documentIndex) => {
      if (!documents.has(documentId)) add(['tools', index, 'requiredKnowledge', documentIndex], `Unknown document "${documentId}".`)
      if (tool.requiredKnowledge?.indexOf(documentId) !== documentIndex) add(['tools', index, 'requiredKnowledge', documentIndex], 'Duplicate knowledge prerequisite.')
    })
  })
  recipe.journey.forEach((step, index) => {
    const condition = step.completeWhen
    const path = ['journey', index, 'completeWhen']
    if (condition.type === 'profile-edited' && !recipe.editable.some((key) => key === 'name' || key === 'instructions')) {
      add(path, 'The "profile-edited" condition requires an editable name or instructions field.')
    }
    if (condition.type === 'behavior-edited' && !recipe.editable.some((key) => key === 'tone' || key === 'detail')) {
      add(path, 'The "behavior-edited" condition requires at least one editable field among tone and detail.')
    }
    if (condition.type === 'connection' && !connections.has(condition.connectionId)) {
      add([...path, 'connectionId'], `Unknown connection "${condition.connectionId}".`)
    }
    if (condition.type === 'knowledge' && !documents.has(condition.documentId)) {
      add([...path, 'documentId'], `Unknown document "${condition.documentId}".`)
    }
    if (condition.type === 'tool' && !tools.has(condition.toolId)) {
      add([...path, 'toolId'], `Unknown tool "${condition.toolId}".`)
    }
    if (condition.type === 'event' && condition.event === 'answered' && recipe.facts.length === 0) {
      add(path, 'The "answered" event requires at least one entry in facts to produce a grounded answer.')
    }
    if (condition.type === 'event' && condition.event === 'escalated' && recipe.tools.length === 0) {
      add(path, 'The "escalated" event requires at least one entry in tools to execute a simulated handoff.')
    }
  })
  return [...issues, ...labReferenceIssues(recipe)]
}

export function validateRecipeReferences(recipe: Recipe): void {
  const issues = referenceIssues(recipe)
  if (issues.length > 0) throw new Error(issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'))
}

export const recipeSchema: z.ZodType<Recipe> = z.strictObject(recipeFields).superRefine((recipe, context) => {
  for (const issue of referenceIssues(recipe)) context.addIssue({ code: 'custom', ...issue })
})

export const compiledRecipeSchema: z.ZodType<CompiledRecipe> = z.strictObject({
  ...recipeFields,
  estimatedMinutes: z.number().int().min(1).max(24),
  knowledge: z.array(compiledKnowledgeSchema).max(40),
}).superRefine((recipe, context) => {
  if (recipe.estimatedMinutes !== recipe.journey.length) {
    context.addIssue({ code: 'custom', path: ['estimatedMinutes'], message: 'Estimate must equal the number of journey steps (one minute per step).' })
  }
  for (const issue of referenceIssues(recipe)) context.addIssue({ code: 'custom', ...issue })
  recipe.facts.forEach((fact, index) => {
    const document = recipe.knowledge.find((item) => item.id === fact.documentId)
    if (!document) return
    for (const field of ['answer', 'detail'] as const) {
      if (!document.content.includes(fact[field])) {
        context.addIssue({ code: 'custom', path: ['facts', index, field], message: `The text must appear verbatim in document "${fact.documentId}" (${document.file}).` })
      }
    }
  })
})
