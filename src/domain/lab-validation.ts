import { z } from 'zod'
import type { LabDefinition, LabDraft, LabField, LabInputs, LabResponse, LabValue, LearningEvidence, EvaluationAssertion } from './lab-types.ts'
import type { Recipe } from './types.ts'

const id = z.string().min(1).max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
const text = (max: number) => z.string().min(1).max(max).refine(value => value.trim().length > 0, 'Text cannot be blank.')
const title = text(140)
const template = text(3000)
const valueSchema = z.union([z.string().max(800), z.number().finite(), z.boolean(), z.null()])
const inputsSchema = z.record(id, valueSchema).refine(inputs => Object.keys(inputs).length <= 20, 'At most 20 inputs are allowed.')
const fingerprint = z.string().min(1).max(50_000)
const requirementSchema = z.strictObject({ checkId: id, equals: z.boolean() })
const draftTemplateSchema = z.strictObject({ title: template, body: template })
const labFields = {
  title,
  description: text(3000),
  fields: z.array(z.strictObject({
    id, label: title, type: z.enum(['text', 'number', 'boolean', 'select']),
    defaultValue: valueSchema, hint: z.string().max(800),
    options: z.array(z.strictObject({ value: text(800), label: title })).min(1).max(40).optional(),
    min: z.number().finite().optional(), max: z.number().finite().optional(),
  })).max(20),
  checks: z.array(z.strictObject({
    id, label: title, field: id, operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'present']),
    value: valueSchema.optional(), otherField: id.optional(),
  })).max(40),
  rules: z.array(z.strictObject({
    id, label: title, all: z.array(requirementSchema).max(40),
    any: z.array(requirementSchema).min(1).max(40).optional(),
    requiresKnowledge: z.array(id).min(1).max(40).optional(), outcomeId: id,
  })).min(1).max(30),
  outcomes: z.array(z.strictObject({
    id, title, summary: template, documentIds: z.array(id).max(40), skillId: id.optional(), toolId: id.optional(),
    draft: draftTemplateSchema.optional(),
    recommendations: z.array(z.strictObject({
      when: requirementSchema.optional(), title: template, description: template,
    })).max(30).optional(),
  })).min(1).max(20),
  cases: z.array(z.strictObject({
    id, title, inputs: inputsSchema,
    expected: z.strictObject({
      outcomeId: id, kind: z.enum(['answer', 'missing-knowledge', 'handoff-ready', 'handoff-blocked']),
      toolId: id.optional(), documentIds: z.array(id).max(40),
      contains: z.array(text(6000)).min(1).max(30).optional(),
    }),
    disabledKnowledge: z.array(id).max(40).optional(), disabledTools: z.array(id).max(12).optional(),
  })).min(1).max(30),
}

export const labDraftSchema: z.ZodType<LabDraft> = z.strictObject({ title: z.string().max(6000), body: z.string().max(6000) })
export const labResponseSchema: z.ZodType<LabResponse> = z.strictObject({
  outcomeId: id, ruleId: id, inputs: inputsSchema,
  checks: z.array(z.strictObject({
    id, label: title, passed: z.boolean(), actual: valueSchema, expected: valueSchema,
  })).max(40),
  recommendations: z.array(text(6000)).max(30),
  fingerprint,
})
export const learningEvidenceSchema: z.ZodType<LearningEvidence> = z.strictObject({
  testedCases: z.array(z.strictObject({ id, fingerprint })).max(200),
  citations: z.array(z.strictObject({ documentId: id, fingerprint })).max(200),
  actions: z.array(z.strictObject({ toolId: id, outcomeId: id, fingerprint })).max(200),
})
export const evaluationAssertionSchema: z.ZodType<EvaluationAssertion> = z.strictObject({
  label: text(200), passed: z.boolean(), expected: z.string().max(15_000), actual: z.string().max(15_000),
})
export const labInputsSchema: z.ZodType<LabInputs> = inputsSchema

function fieldValueValid(field: LabField, value: LabValue): boolean {
  switch (field.type) {
    case 'text': return typeof value === 'string' && value.length <= 800
    case 'number': return value === null || (typeof value === 'number' && Number.isFinite(value)
      && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max))
    case 'boolean': return typeof value === 'boolean'
    case 'select': return typeof value === 'string' && value.length <= 800 && !!field.options?.some(option => option.value === value)
  }
}

export function labInputsValid(lab: LabDefinition, inputs: LabInputs): boolean {
  return inputs !== null && typeof inputs === 'object' && !Array.isArray(inputs)
    && Object.keys(inputs).length === lab.fields.length
    && lab.fields.every(field => Object.hasOwn(inputs, field.id) && fieldValueValid(field, inputs[field.id]))
}

type ReferenceIssue = { path: (string | number)[]; message: string }

function definitionIssues(lab: LabDefinition): ReferenceIssue[] {
  const issues: ReferenceIssue[] = []
  const add = (path: ReferenceIssue['path'], message: string) => issues.push({ path, message })
  const unique = (values: string[], path: ReferenceIssue['path'], property?: string) => {
    values.forEach((value, index) => {
      if (values.indexOf(value) !== index) add([...path, index, ...(property ? [property] : [])], `Duplicate identifier "${value}".`)
    })
  }
  for (const namespace of ['fields', 'checks', 'rules', 'outcomes', 'cases'] as const) {
    unique(lab[namespace].map(item => item.id), [namespace], 'id')
  }
  const fields = new Map(lab.fields.map(field => [field.id, field]))
  const checks = new Set(lab.checks.map(check => check.id))
  const outcomes = new Map(lab.outcomes.map(outcome => [outcome.id, outcome]))
  const requirements = (items: { checkId: string }[], path: ReferenceIssue['path']) => {
    unique(items.map(item => item.checkId), path, 'checkId')
    items.forEach((item, index) => {
      if (!checks.has(item.checkId)) add([...path, index, 'checkId'], `Unknown check "${item.checkId}".`)
    })
  }
  const checkTemplate = (value: string, path: ReferenceIssue['path']) => {
    const remaining = value.replace(/\{\{([^{}]*)\}\}/g, (_match, reference: string) => {
      if (!fields.has(reference) && reference !== 'checks' && reference !== 'conversation') {
        add(path, `Unknown template reference "{{${reference}}}".`)
      }
      return ''
    })
    if (remaining.includes('{{') || remaining.includes('}}')) add(path, 'Malformed template placeholder; use {{field-id}}, {{checks}}, or {{conversation}}.')
  }
  lab.fields.forEach((field, index) => {
    const path = ['fields', index]
    if (field.id === 'checks' || field.id === 'conversation') add([...path, 'id'], `Field identifier "${field.id}" is reserved for templates.`)
    if (field.type === 'select' && !field.options?.length) add([...path, 'options'], 'A select field requires options.')
    if (field.type !== 'select' && field.options !== undefined) add([...path, 'options'], 'Only select fields may define options.')
    if (field.type !== 'number' && (field.min !== undefined || field.max !== undefined)) add(path, 'Only number fields may define numeric bounds.')
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) add(path, 'The minimum cannot exceed the maximum.')
    if (field.options) unique(field.options.map(option => option.value), [...path, 'options'], 'value')
    if (!fieldValueValid(field, field.defaultValue)) add([...path, 'defaultValue'], `Invalid default value for ${field.type} field "${field.id}".`)
  })
  lab.checks.forEach((check, index) => {
    const path = ['checks', index]
    const field = fields.get(check.field)
    if (!field) add([...path, 'field'], `Unknown field "${check.field}".`)
    const hasValue = check.value !== undefined
    const hasOther = check.otherField !== undefined
    if (check.operator === 'present') {
      if (hasValue || hasOther) add(path, 'A present check accepts neither value nor otherField.')
    } else if (hasValue === hasOther) add(path, 'A comparison requires exactly one of value or otherField.')
    const other = check.otherField === undefined ? undefined : fields.get(check.otherField)
    if (hasOther && !other) add([...path, 'otherField'], `Unknown comparison field "${check.otherField}".`)
    if (field && other && field.type !== other.type) add([...path, 'otherField'], 'Comparison fields must have the same type.')
    const ordered = ['gt', 'gte', 'lt', 'lte'].includes(check.operator)
    if (field && ordered && field.type !== 'number') add([...path, 'operator'], 'Ordered comparisons require number fields.')
    if (field && hasValue && (!fieldValueValid(field, check.value!) || (ordered && check.value === null))) {
      add([...path, 'value'], `Invalid comparison value for ${field.type} field "${field.id}".`)
    }
  })
  lab.rules.forEach((rule, index) => {
    const path = ['rules', index]
    requirements(rule.all, [...path, 'all'])
    if (rule.any) requirements(rule.any, [...path, 'any'])
    if (!outcomes.has(rule.outcomeId)) add([...path, 'outcomeId'], `Unknown outcome "${rule.outcomeId}".`)
    if (rule.requiresKnowledge) unique(rule.requiresKnowledge, [...path, 'requiresKnowledge'])
    if (index === lab.rules.length - 1) {
      if (rule.all.length || rule.any !== undefined || rule.requiresKnowledge) add(path, 'The final fallback rule must have all: [] and no other requirements.')
    } else if (!rule.all.length && !rule.any?.length && !rule.requiresKnowledge?.length) add(path, 'An unconditional rule is only allowed as the final fallback.')
  })
  lab.outcomes.forEach((outcome, index) => {
    const path = ['outcomes', index]
    if (!outcome.documentIds.length && !outcome.skillId) add(path, 'An outcome requires policy sources or a simulated skill.')
    unique(outcome.documentIds, [...path, 'documentIds'])
    checkTemplate(outcome.title, [...path, 'title'])
    checkTemplate(outcome.summary, [...path, 'summary'])
    if (outcome.draft) {
      checkTemplate(outcome.draft.title, [...path, 'draft', 'title'])
      checkTemplate(outcome.draft.body, [...path, 'draft', 'body'])
    }
    outcome.recommendations?.forEach((recommendation, recommendationIndex) => {
      const recPath = [...path, 'recommendations', recommendationIndex]
      if (recommendation.when && !checks.has(recommendation.when.checkId)) add([...recPath, 'when', 'checkId'], `Unknown check "${recommendation.when.checkId}".`)
      checkTemplate(recommendation.title, [...recPath, 'title'])
      checkTemplate(recommendation.description, [...recPath, 'description'])
    })
  })
  lab.cases.forEach((item, index) => {
    const path = ['cases', index]
    if (!labInputsValid(lab, item.inputs)) add([...path, 'inputs'], 'Case inputs must contain exactly every field, with valid values and no unknown fields.')
    const outcome = outcomes.get(item.expected.outcomeId)
    if (!outcome) add([...path, 'expected', 'outcomeId'], `Unknown outcome "${item.expected.outcomeId}".`)
    const action = item.expected.kind === 'handoff-ready' || item.expected.kind === 'handoff-blocked'
    if (action && !outcome?.toolId) add([...path, 'expected', 'kind'], 'An action expectation requires an outcome with a tool.')
    if (item.expected.kind === 'handoff-ready' && item.expected.toolId !== outcome?.toolId) {
      add([...path, 'expected', 'toolId'], 'A ready action expectation must name the tool belonging to its outcome.')
    }
    if (item.expected.kind !== 'handoff-ready' && item.expected.toolId !== undefined) add([...path, 'expected', 'toolId'], 'Only ready action expectations can include a tool.')
    if (item.expected.kind === 'answer' && outcome?.toolId) add([...path, 'expected', 'kind'], 'An action outcome cannot expect an answer kind.')
    unique(item.expected.documentIds, [...path, 'expected', 'documentIds'])
    if (item.disabledKnowledge) unique(item.disabledKnowledge, [...path, 'disabledKnowledge'])
    if (item.disabledTools) unique(item.disabledTools, [...path, 'disabledTools'])
  })
  return issues
}

export const labDefinitionSchema: z.ZodType<LabDefinition> = z.strictObject(labFields).superRefine((lab, context) => {
  for (const issue of definitionIssues(lab)) context.addIssue({ code: 'custom', ...issue })
})

export function labReferenceIssues(recipe: Recipe): ReferenceIssue[] {
  const lab = recipe.lab
  if (!lab) return []
  const issues = definitionIssues(lab).map(issue => ({ ...issue, path: ['lab', ...issue.path] }))
  const add = (path: ReferenceIssue['path'], message: string) => issues.push({ path, message })
  const documents = new Set(recipe.knowledge.map(document => document.id))
  const tools = new Map(recipe.tools.map(tool => [tool.id, tool]))
  const documentRefs = (ids: string[], path: ReferenceIssue['path']) => ids.forEach((id, index) => {
    if (!documents.has(id)) add([...path, index], `Unknown document "${id}".`)
  })
  const toolRefs = (ids: string[], path: ReferenceIssue['path']) => ids.forEach((id, index) => {
    if (!tools.has(id)) add([...path, index], `Unknown tool "${id}".`)
  })
  lab.rules.forEach((rule, index) => {
    if (!rule.requiresKnowledge) return
    documentRefs(rule.requiresKnowledge, ['lab', 'rules', index, 'requiresKnowledge'])
    const outcome = lab.outcomes.find(item => item.id === rule.outcomeId)
    if (outcome && rule.requiresKnowledge.some(id => !outcome.documentIds.includes(id))) {
      add(['lab', 'rules', index, 'requiresKnowledge'], 'The selected outcome must cite every source used to match this rule.')
    }
  })
  lab.outcomes.forEach((outcome, index) => {
    const path = ['lab', 'outcomes', index]
    documentRefs(outcome.documentIds, [...path, 'documentIds'])
    if (outcome.skillId && !recipe.skills?.some(skill => skill.id === outcome.skillId && skill.coverage === 'simulated')) {
      add([...path, 'skillId'], 'An outcome must reference a simulated skill, not a reference-only skill.')
    }
    if (outcome.toolId) {
      const tool = tools.get(outcome.toolId)
      if (!tool) add([...path, 'toolId'], `Unknown tool "${outcome.toolId}".`)
      else if (!outcome.documentIds.every(id => tool.requiredKnowledge?.includes(id))) {
        add([...path, 'toolId'], 'An outcome tool must include every outcome document in requiredKnowledge.')
      }
    }
  })
  lab.cases.forEach((item, index) => {
    const path = ['lab', 'cases', index]
    documentRefs(item.expected.documentIds, [...path, 'expected', 'documentIds'])
    if (item.expected.toolId && !tools.has(item.expected.toolId)) add([...path, 'expected', 'toolId'], `Unknown tool "${item.expected.toolId}".`)
    documentRefs(item.disabledKnowledge ?? [], [...path, 'disabledKnowledge'])
    toolRefs(item.disabledTools ?? [], [...path, 'disabledTools'])
  })
  recipe.journey.forEach((step, index) => {
    const condition = step.completeWhen
    const path = ['journey', index, 'completeWhen']
    if (condition.type === 'case-tested' && !lab.cases.some(item => item.id === condition.caseId)) add([...path, 'caseId'], `Unknown lab case "${condition.caseId}".`)
    if (condition.type === 'citation-opened' && !documents.has(condition.documentId)) add([...path, 'documentId'], `Unknown document "${condition.documentId}".`)
    if (condition.type === 'action-confirmed') {
      if (!tools.has(condition.toolId)) add([...path, 'toolId'], `Unknown tool "${condition.toolId}".`)
      const outcome = lab.outcomes.find(item => item.id === condition.outcomeId)
      if (!outcome) add([...path, 'outcomeId'], `Unknown outcome "${condition.outcomeId}".`)
      else if (outcome.toolId !== condition.toolId) add(path, 'The action tool must belong to the referenced outcome.')
    }
  })
  return issues
}
