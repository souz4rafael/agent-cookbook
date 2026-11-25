import { agentIcons, messageReactions } from './types.ts'
import type { AgentIcon, AgentProfile, CompiledRecipe, GuideStep, MessageReaction, Session, TestResponse } from './types.ts'
import type { LabInputs, LearningEvidence } from './lab-types.ts'
import { calculateLab, checkedLabInputs, compareLabExpectation, defaultLabInputs, inputsEqual } from './lab.ts'

const MAX_INPUT = 2_000
const PROFILE_LIMITS = { name: 100, description: 600, instructions: 3_000 } as const
const PROFILE_KEYS = ['name', 'description', 'instructions', 'tone', 'detail'] as const

export function assertSession(recipe: CompiledRecipe, session: Session): void {
  if (session.recipeId !== recipe.id || session.recipeRevision !== recipe.revision || session.version !== 1) {
    throw new Error('The session does not match this recipe version. Restart the exercise.')
  }
}

export function getConfigurationFingerprint(session: Session): string {
  return JSON.stringify([
    session.profile,
    Object.entries(session.connections).sort(([left], [right]) => left.localeCompare(right)),
    [...session.enabledKnowledge].sort(),
    [...session.enabledTools].sort(),
  ])
}

export function toggleMessageReaction(recipe: CompiledRecipe, session: Session, messageId: string, value: MessageReaction): Session {
  assertSession(recipe, session)
  if (!messageReactions.includes(value)) throw new Error('Choose Like or Dislike.')
  const index = session.messages.findIndex(message => message.id === messageId)
  if (index < 0 || session.messages[index].role !== 'assistant') throw new Error('Only an existing agent message can receive feedback.')
  const messages = session.messages.map((message, itemIndex) => {
    if (itemIndex !== index) return message
    const { reaction, ...content } = message
    return reaction === value ? content : { ...content, reaction: value }
  })
  return { ...session, messages }
}

function connected(recipe: CompiledRecipe, session: Session, connectionId: string, resourceId: string): boolean {
  return session.connections[connectionId] === resourceId
    && recipe.connections.some((connection) => connection.id === connectionId && connection.resources.some((resource) => resource.id === resourceId))
}

// Retained sequence IDs stay unique even when older history entries are pruned.
function nextEvent(session: Session): { sequence: number; at: string } {
  const ids = [...session.activity, ...session.messages, ...session.cases].map((item) => item.id)
  const sequence = ids.reduce((max, value) => {
    const match = /^(?:event|receipt|SIM)-(\d+)$/u.exec(value)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return { sequence, at: new Date().toISOString() }
}

function log(session: Session, type: 'connection' | 'configuration', text: string): Session {
  const { sequence, at } = nextEvent(session)
  return {
    ...session,
    activity: [...session.activity, { id: `event-${sequence}`, at, type, text }].slice(-100),
  }
}

function checkedInput(value: string, label: string, limit = MAX_INPUT): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} cannot be blank.`)
  if (value.length > limit) throw new Error(`${label} must contain no more than ${limit} characters.`)
  return value.trim()
}

function normalizedWords(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? ''
}

function matches(input: string, keyword: string): boolean {
  const words = normalizedWords(keyword)
  return words.length > 0 && ` ${input} `.includes(` ${words} `)
}

function styled(session: Session, answer: string, detail?: string): string {
  const greeting = session.profile.tone === 'formal' ? 'Dear resident,' : 'Hello! Here is what you need to know:'
  const extra = session.profile.detail === 'detailed' && detail ? `\n\n${detail}` : ''
  return `${greeting}\n\n${answer}${extra}\n\nFictional demonstration: this is not official guidance or a real public service.`
}

export function createSession(recipe: CompiledRecipe): Session {
  return {
    version: 1,
    recipeId: recipe.id,
    recipeRevision: recipe.revision,
    profile: { ...recipe.agent },
    agentIcon: recipe.accentIcon,
    connections: {},
    enabledKnowledge: [],
    enabledTools: [],
    messages: [],
    activity: [],
    cases: [],
    ...(recipe.lab ? { labInputs: defaultLabInputs(recipe.lab), learningEvidence: emptyLearningEvidence() } : {}),
  }
}

export function getAvailableKnowledge(recipe: CompiledRecipe, session: Session): CompiledRecipe['knowledge'] {
  assertSession(recipe, session)
  return recipe.knowledge.filter((document) => session.enabledKnowledge.includes(document.id)
    && connected(recipe, session, document.connectionId, document.resourceId))
}

export function isToolAvailable(recipe: CompiledRecipe, session: Session, toolId: string): boolean {
  assertSession(recipe, session)
  const tool = recipe.tools.find((item) => item.id === toolId)
  return !!tool && session.enabledTools.includes(toolId) && connected(recipe, session, tool.connectionId, tool.resourceId)
    && (tool.requiredKnowledge ?? []).every(id => getAvailableKnowledge(recipe, session).some(document => document.id === id))
}

export function respond(recipe: CompiledRecipe, session: Session, input: string): TestResponse {
  assertSession(recipe, session)
  const question = normalizedWords(checkedInput(input, 'The question'))
  const trace = [
    'Deterministic simulation: matches complete words and phrases, with no generative AI or network access.',
    `Style applied: ${session.profile.tone === 'friendly' ? 'friendly' : 'formal'}, ${session.profile.detail === 'concise' ? 'concise' : 'detailed'}.`,
    'Free-text instructions are stored but are not interpreted by the simulator.',
  ]
  const fallbackDetail = 'This test recognises only the words and phrases defined in the recipe. Try a suggested question; no data is sent to an external service.'
  if (recipe.lab && !recipe.facts.some(fact => fact.keywords.some(keyword => matches(question, keyword))) && !recipe.test.handoffKeywords.some(keyword => matches(question, keyword))) {
    return { kind: 'out-of-scope', text: `${recipe.test.unknownAnswer}\n\nTo change example data, open Review > Try this example, edit the fictional inputs and select Run example. Free-text changes are not silently applied.`, citations: [], trace: [...trace, 'No guidance rule matched; use the structured exercise for causal inputs.'] }
  }
  if (recipe.test.handoffKeywords.some((keyword) => matches(question, keyword))) {
    const tool = recipe.tools.find((item) => isToolAvailable(recipe, session, item.id))
    return {
      kind: tool ? 'handoff-ready' : 'handoff-blocked',
      text: styled(session, tool ? recipe.test.handoffReadyAnswer : recipe.test.handoffBlockedAnswer, tool
        ? 'Your question did not create a case. Review the summary and confirm separately to record a local simulation only.'
        : 'Connect the exact queue specified by the recipe and enable the tool. Asking for support in chat does not create a request.'),
      citations: [],
      trace: [...trace, tool ? `Tool "${tool.id}" is available; awaiting explicit confirmation, nothing executed.` : 'Handoff blocked: the tool or resource is unavailable.'],
      ...(tool ? { toolId: tool.id } : {}),
      ...(tool ? { draft: {
        title: 'Human support context for review',
        body: `Fictional support request\n\nCurrent request: ${input}\n\nRecent conversation (review and correct before confirming):\n${session.messages.slice(-6).map(message => `${message.role}: ${message.text.slice(0, 400)}${message.text.length > 400 ? ' [abbreviated]' : ''}`).join('\n')}\n\nRequested next step: a person reviews the issue. No message is sent by this simulation.`,
      } } : {}),
    }
  }
  const matchedFacts = recipe.facts.filter(item => item.keywords.some(keyword => matches(question, keyword)))
  if (matchedFacts.filter(item => item.toolId).length > 1) {
    return { kind: 'out-of-scope', text: styled(session, 'Choose one example at a time so its findings and proposed action can be reviewed separately.'), citations: [], trace: [...trace, 'Multiple action-linked samples matched. No destination selected and no action offered.'] }
  }
  const fact = matchedFacts[0]
  if (!fact) {
    return { kind: 'out-of-scope', text: styled(session, recipe.test.unknownAnswer, fallbackDetail), citations: [], trace: [...trace, 'No rule recognised the question; no lookup was performed and no answer was invented.'] }
  }
  const document = getAvailableKnowledge(recipe, session).find((item) => item.id === fact.documentId)
  if (!document || !document.content.includes(fact.answer) || !document.content.includes(fact.detail)) {
    return {
      kind: 'missing-knowledge',
      text: styled(session, recipe.test.missingKnowledgeAnswer, 'Connect the correct library and select the matching document. Removed or disconnected sources are never used.'),
      citations: [],
      trace: [...trace, `Matched rule: "${fact.id}".`, `Source "${fact.documentId}" is unavailable or does not support the predefined text.`],
    }
  }
  const answerStart = document.content.indexOf(fact.answer)
  const detailStart = document.content.indexOf(fact.detail)
  const excerpt = session.profile.detail === 'detailed'
    ? document.content.slice(Math.min(answerStart, detailStart), Math.max(answerStart + fact.answer.length, detailStart + fact.detail.length))
    : fact.answer
  if (fact.toolId) {
    const tool = recipe.tools.find(item => item.id === fact.toolId)
    const available = !!tool && isToolAvailable(recipe, session, tool.id)
    return {
      kind: available ? 'handoff-ready' : 'handoff-blocked',
      text: styled(session, `${fact.answer}\n\n${available
        ? `Proposed action: ${tool.title}. Review and confirm the simulated request separately. Nothing has been routed.`
        : 'Routing is blocked. Select the required knowledge, connect the correct queue and enable the matching tool, then run this example again.'}`, fact.detail),
      citations: [{ documentId: document.id, title: document.title, excerpt }],
      trace: [...trace, `Matched sample rule: "${fact.id}".`, `Read pre-authored example from selected source "${document.id}". No files, personal data or live systems were analysed at runtime.`, available ? `Only tool "${tool.id}" is offered; waiting for confirmation.` : `Required tool "${fact.toolId}" or its knowledge prerequisites are unavailable.`],
      ...(available ? { toolId: tool.id } : {}),
    }
  }
  return {
    kind: 'answer',
    text: styled(session, fact.answer, fact.detail),
    citations: [{ documentId: document.id, title: document.title, excerpt }],
    trace: [...trace, `Matched rule: "${fact.id}".`, `Selected source "${document.id}" in connected library "${document.resourceId}".`, 'The answer and details reproduce the fictional document verbatim.'],
  }
}

export function isStepComplete(recipe: CompiledRecipe, session: Session, step: GuideStep): boolean {
  assertSession(recipe, session)
  const condition = step.completeWhen
  switch (condition.type) {
    case 'profile-edited':
      return (['name', 'instructions'] as const).some((key) => recipe.editable.includes(key) && session.profile[key] !== recipe.agent[key])
    case 'behavior-edited':
      return (['tone', 'detail'] as const).some((key) => recipe.editable.includes(key) && session.profile[key] !== recipe.agent[key])
    case 'connection': {
      const connection = recipe.connections.find((item) => item.id === condition.connectionId)
      return !!connection && connection.resources.some((resource) => connected(recipe, session, connection.id, resource.id))
    }
    case 'knowledge':
      return getAvailableKnowledge(recipe, session).some((document) => document.id === condition.documentId)
    case 'tool':
      return isToolAvailable(recipe, session, condition.toolId)
    case 'event':
      return session.activity.some((event) => event.type === condition.event)
    case 'case-tested':
      return !!session.learningEvidence?.testedCases.some(item => item.id === condition.caseId && item.fingerprint === getConfigurationFingerprint(session))
    case 'citation-opened':
      return !!session.learningEvidence?.citations.some(item => item.documentId === condition.documentId && item.fingerprint === getConfigurationFingerprint(session))
    case 'action-confirmed':
      return !!session.learningEvidence?.actions.some(item => item.toolId === condition.toolId && item.outcomeId === condition.outcomeId && item.fingerprint === getConfigurationFingerprint(session))
    case 'evaluation-passed': {
      const run = session.evaluation?.lastRun
      return !!recipe.lab && !!run && run.fingerprint === getConfigurationFingerprint(session)
        && run.rows.length === recipe.lab.cases.length && run.rows.every((row, index) => {
          const testCase = recipe.lab!.cases[index]
          return row.caseId === testCase.id && !!row.assertions?.length && compareLabExpectation(testCase, row.response).every(assertion => assertion.passed)
        })
    }
  }
}

export function setConnection(recipe: CompiledRecipe, session: Session, connectionId: string, resourceId: string | null): Session {
  assertSession(recipe, session)
  const connection = recipe.connections.find((item) => item.id === connectionId)
  if (!connection) throw new Error(`Unknown connection: "${connectionId}".`)
  if (resourceId !== null && !connection.resources.some((resource) => resource.id === resourceId)) {
    throw new Error(`Resource "${resourceId}" does not belong to connection "${connectionId}".`)
  }
  const connections = { ...session.connections }
  if (resourceId === null) delete connections[connectionId]
  else connections[connectionId] = resourceId
  const next = { ...session, connections }
  const enabledKnowledge = session.enabledKnowledge.filter((documentId) => recipe.knowledge.some((document) => document.id === documentId
    && connected(recipe, next, document.connectionId, document.resourceId)))
  const enabledTools = session.enabledTools.filter((toolId) => recipe.tools.some((tool) => tool.id === toolId
    && connected(recipe, next, tool.connectionId, tool.resourceId)))
  const removed = session.enabledKnowledge.length + session.enabledTools.length - enabledKnowledge.length - enabledTools.length
  if (session.connections[connectionId] === (resourceId ?? undefined) && removed === 0) return session
  let result = log({ ...next, enabledKnowledge, enabledTools }, 'connection', resourceId
    ? `Simulated connection "${connection.title}" linked to resource "${resourceId}". No real sign-in or access.`
    : `Simulated connection "${connection.title}" disconnected.`)
  if (removed > 0) result = log(result, 'configuration', `Removed ${removed} document/tool selection(s) because the required resource is no longer available.`)
  return result
}

export function selectKnowledge(recipe: CompiledRecipe, session: Session, documentId: string, enabled: boolean): Session {
  assertSession(recipe, session)
  const document = recipe.knowledge.find((item) => item.id === documentId)
  if (!document) throw new Error(`Unknown document: "${documentId}".`)
  if (typeof enabled !== 'boolean') throw new Error('Document selection must be true or false.')
  if (enabled && !connected(recipe, session, document.connectionId, document.resourceId)) throw new Error('Connect the exact library for this document before selecting it.')
  if (session.enabledKnowledge.includes(documentId) === enabled) return session
  return log({
    ...session,
    enabledKnowledge: enabled ? [...session.enabledKnowledge, documentId] : session.enabledKnowledge.filter((item) => item !== documentId),
  }, 'configuration', `Fictional document "${document.title}" ${enabled ? 'selected' : 'removed'}.`)
}

export function selectTool(recipe: CompiledRecipe, session: Session, toolId: string, enabled: boolean): Session {
  assertSession(recipe, session)
  const tool = recipe.tools.find((item) => item.id === toolId)
  if (!tool) throw new Error(`Unknown tool: "${toolId}".`)
  if (typeof enabled !== 'boolean') throw new Error('Tool selection must be true or false.')
  if (enabled && !connected(recipe, session, tool.connectionId, tool.resourceId)) throw new Error('Connect the exact queue for this tool before enabling it.')
  if (session.enabledTools.includes(toolId) === enabled) return session
  return log({
    ...session,
    enabledTools: enabled ? [...session.enabledTools, toolId] : session.enabledTools.filter((item) => item !== toolId),
  }, 'configuration', `Simulated tool "${tool.title}" ${enabled ? 'enabled' : 'disabled'}.`)
}

export function updateProfile(recipe: CompiledRecipe, session: Session, patch: Partial<AgentProfile>): Session {
  assertSession(recipe, session)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('The profile update must be an object.')
  for (const [key, value] of Object.entries(patch)) {
    if (!PROFILE_KEYS.includes(key as keyof AgentProfile)) throw new Error(`Unknown profile field: "${key}".`)
    if (!recipe.editable.includes(key as keyof AgentProfile)) throw new Error(`The field "${key}" is locked in this recipe.`)
    if (key === 'tone' && value !== 'friendly' && value !== 'formal') throw new Error('Invalid tone: use friendly or formal.')
    if (key === 'detail' && value !== 'concise' && value !== 'detailed') throw new Error('Invalid detail level: use concise or detailed.')
    if (key === 'name' || key === 'description' || key === 'instructions') {
      if (typeof value !== 'string' || value.length > PROFILE_LIMITS[key] || (key === 'name' && !value.trim())) {
        throw new Error(`The field "${key}" must be text of no more than ${PROFILE_LIMITS[key]} characters${key === 'name' ? ' and cannot be blank' : ''}.`)
      }
    }
  }
  const profile = { ...session.profile, ...patch }
  if (PROFILE_KEYS.every((key) => profile[key] === session.profile[key])) return session
  return { ...session, profile }
}

export function setAgentIcon(recipe: CompiledRecipe, session: Session, icon: AgentIcon): Session {
  assertSession(recipe, session)
  if (!agentIcons.includes(icon)) throw new Error('Choose an available agent icon.')
  if (session.agentIcon === icon) return session
  return { ...session, agentIcon: icon }
}

export function executeHandoff(recipe: CompiledRecipe, session: Session, toolId: string, summary: string): Session {
  assertSession(recipe, session)
  const tool = recipe.tools.find((item) => item.id === toolId)
  if (!tool || !isToolAvailable(recipe, session, toolId)) throw new Error('Handoff blocked: connect the correct queue, enable the tool and select its required knowledge.')
  const cleanSummary = checkedInput(summary, 'The summary', 6_000)
  const { sequence, at } = nextEvent(session)
  const id = `SIM-${String(sequence).padStart(6, '0')}`
  const receipt = `Simulated case ${id} recorded in fictional queue "${tool.resourceId}".\n\nSummary: ${cleanSummary}\n\nNo email was sent and no real request was created. This receipt exists only in the demonstration.`
  return {
    ...session,
    cases: [...session.cases, { id, toolId, resourceId: tool.resourceId, summary: cleanSummary, at, ...(session.messages.at(-1)?.response?.lab ? { outcomeId: session.messages.at(-1)!.response!.lab!.outcomeId } : {}) }].slice(-50),
    activity: [...session.activity, { id: `event-${sequence}`, at, type: 'escalated' as const, text: `Explicit confirmation recorded: ${id}, local simulation only, nothing sent.` }].slice(-100),
    messages: [...session.messages, { id: `receipt-${sequence}`, role: 'assistant' as const, text: receipt }].slice(-100),
  }
}

export function emptyLearningEvidence(): LearningEvidence {
  return { testedCases: [], citations: [], actions: [] }
}

export function setLabInputs(recipe: CompiledRecipe, session: Session, inputs: LabInputs): Session {
  assertSession(recipe, session)
  if (!recipe.lab) throw new Error('This recipe has no interactive inputs.')
  return { ...session, labInputs: checkedLabInputs(recipe.lab, inputs) }
}

export function respondLab(recipe: CompiledRecipe, session: Session, rawInputs: LabInputs): TestResponse {
  assertSession(recipe, session)
  if (!recipe.lab) throw new Error('This recipe has no interactive lab.')
  const conversation = session.messages.slice(-6).map(item => `${item.role === 'user' ? 'Learner' : 'Agent'}: ${item.text.slice(0, 180)}${item.text.length > 180 ? ' [abbreviated]' : ''}`).join('\n')
  const available = getAvailableKnowledge(recipe, session)
  const result = calculateLab(recipe.lab, rawInputs, conversation, new Set(available.map(doc => doc.id)))
  const fingerprint = getConfigurationFingerprint(session)
  const lab = { outcomeId: result.outcome.id, ruleId: result.rule.id, inputs: result.inputs, checks: result.checks, recommendations: result.recommendations, fingerprint }
  const missing = result.outcome.documentIds.filter(id => !available.some(document => document.id === id))
  const trace = ['Deterministic calculation from editable fictional inputs; no AI or external service.',
    ...result.checks.map(check => `${check.label}: ${check.passed ? 'met' : 'not met / unknown'}.`),
    `First matching rule: ${result.rule.label} (${result.rule.id}).`]
  if (missing.length) {
    return { kind: 'missing-knowledge', text: `Run blocked: connect and select these policy sources before using this outcome: ${missing.map(id => recipe.knowledge.find(document => document.id === id)?.title ?? id).join('; ')}. No draft or action was produced.`, citations: [], trace, lab: { ...lab, recommendations: [] } }
  }
  const tool = result.outcome.toolId ? recipe.tools.find(item => item.id === result.outcome.toolId) : undefined
  const toolReady = !!tool && isToolAvailable(recipe, session, tool.id)
  const text = `${result.title}\n\n${result.summary}${result.recommendations.length ? `\n\nLearning resources / next steps:\n${result.recommendations.map(item => `- ${item}`).join('\n')}` : ''}${tool ? `\n\n${toolReady ? `Proposed action: ${tool.title}. Review the draft and confirm separately.` : `Action blocked: connect and enable "${tool.title}" and its required knowledge, then run again.`}` : ''}\n\nFictional exercise only. Nothing has been sent, approved, booked or published.`
  if (text.length > 14_000) throw new Error('This example produced too much text. Shorten the fictional context before running it again.')
  return {
    kind: tool ? toolReady ? 'handoff-ready' : 'handoff-blocked' : 'answer',
    text,
    citations: result.outcome.documentIds.map(id => {
      const document = available.find(item => item.id === id)!
      return { documentId: id, title: document.title, excerpt: document.content.slice(0, 2000) }
    }),
    trace: [...trace, ...(result.outcome.skillId ? [`Local teaching rules for skill "${result.outcome.skillId}"; no native skill or model was invoked.`] : []),
      ...(result.outcome.documentIds.length ? ['Citations identify the selected policies used by these declared rules, not a verbatim quotation of the calculated result.'] : [])],
    lab,
    ...(toolReady ? { toolId: tool.id } : {}),
    ...(result.draft ? { draft: result.draft } : {}),
  }
}

export function runLabExample(recipe: CompiledRecipe, session: Session): Session {
  if (!recipe.lab) throw new Error('This recipe has no interactive lab.')
  const inputs = session.labInputs ?? defaultLabInputs(recipe.lab)
  const response = respondLab(recipe, session, inputs)
  const { sequence, at } = nextEvent(session)
  const fingerprint = getConfigurationFingerprint(session)
  const previous = session.learningEvidence ?? emptyLearningEvidence()
  const passedCases = recipe.lab.cases.filter(testCase =>
    !testCase.disabledKnowledge?.length && !testCase.disabledTools?.length &&
    inputsEqual(recipe.lab!, inputs, testCase.inputs) &&
    compareLabExpectation(testCase, response).every(assertion => assertion.passed))
  const testedCases = [...previous.testedCases.filter(item => item.fingerprint === fingerprint && !passedCases.some(testCase => testCase.id === item.id)),
    ...passedCases.map(testCase => ({ id: testCase.id, fingerprint }))]
  return {
    ...session, labInputs: { ...inputs }, learningEvidence: { ...previous, testedCases },
    messages: [...session.messages, { id: `event-${sequence}`, role: 'user' as const, text: `Run fictional example: ${recipe.lab.fields.map(field => {
      const value = String(inputs[field.id] ?? 'not provided')
      return `${field.label} = ${value.length > 100 ? `${value.slice(0, 100)} [abbreviated; full input in rule evidence]` : value}`
    }).join('; ')}` },
      { id: `event-${sequence + 1}`, role: 'assistant' as const, text: response.text, response }].slice(-100),
    activity: [...session.activity, { id: `event-${sequence + 2}`, at, type: 'answered' as const, text: `Interactive outcome: ${response.lab?.outcomeId}; ${passedCases.length} expected example(s) demonstrated.` }].slice(-100),
  }
}

export function recordCitationOpen(recipe: CompiledRecipe, session: Session, documentId: string): Session {
  assertSession(recipe, session)
  const fingerprint = getConfigurationFingerprint(session)
  if (!getAvailableKnowledge(recipe, session).some(document => document.id === documentId)
    || !session.messages.some(message => message.response?.lab?.fingerprint === fingerprint && message.response.citations.some(citation => citation.documentId === documentId))) {
    throw new Error('Run an example using this source in the current configuration before recording its citation review.')
  }
  const evidence = session.learningEvidence ?? emptyLearningEvidence()
  return { ...session, learningEvidence: { ...evidence, citations: [...evidence.citations.filter(item => item.fingerprint === fingerprint && item.documentId !== documentId), { documentId, fingerprint }] } }
}
