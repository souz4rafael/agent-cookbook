import type { EvaluationAssertion, LabDefinition, LabDraft, LabInputs, LabResponse, LearningEvidence } from './lab-types.ts'
import type { ConversationDefinition } from '../conversations/schema.ts'

export type Tone = 'friendly' | 'formal'
export type Detail = 'concise' | 'detailed'
export type StudioTab = 'overview' | 'knowledge' | 'tools' | 'activity' | 'handoff'
export const agentIcons = ['citizen', 'document', 'learning', 'benefit', 'bot', 'chat', 'sparkle', 'globe'] as const
export type AgentIcon = typeof agentIcons[number]

export interface AgentProfile {
  name: string
  description: string
  instructions: string
  tone: Tone
  detail: Detail
}

export interface InstructionStyles {
  structured: string
  stepByStep: string
  decisionRules: string
  examples: string
}

export interface Connection {
  id: string
  type: 'sharepoint' | 'service-desk'
  title: string
  description: string
  accountLabel: string
  resources: { id: string; label: string; description: string }[]
  realWorldNote: string
}

export interface KnowledgeDocument {
  id: string
  title: string
  summary: string
  connectionId: string
  resourceId: string
  file: string
}

export interface Fact {
  id: string
  documentId: string
  keywords: string[]
  answer: string
  detail: string
  toolId?: string
}

export interface SimulatedTool {
  id: string
  type: 'create-case'
  title: string
  description: string
  connectionId: string
  resourceId: string
  realWorldNote: string
  requiredKnowledge?: string[]
}

export type GuideCondition =
  | { type: 'profile-edited' }
  | { type: 'behavior-edited' }
  | { type: 'connection'; connectionId: string }
  | { type: 'knowledge'; documentId: string }
  | { type: 'tool'; toolId: string }
  | { type: 'event'; event: 'answered' | 'escalated' }
  | { type: 'case-tested'; caseId: string }
  | { type: 'citation-opened'; documentId: string }
  | { type: 'action-confirmed'; toolId: string; outcomeId: string }
  | { type: 'evaluation-passed' }

export interface GuideStep {
  id: string
  title: string
  description: string
  tab: StudioTab
  completeWhen: GuideCondition
}

export interface ScenarioEditorial {
  group?: { journey: string; perspective: 'guidance' | 'operations' }
  headline: string
  problem: string
  impact: string
  approach: string
  startSmall: string
  potentialValue: string
  measure: string
  boundary: string
  sourceLabel?: string
  home: { challenge: string; experiment: string; takeaway: string; scope: string }
}

export interface Recipe {
  schemaVersion: 1
  revision: number
  id: string
  status: 'draft' | 'published'
  title: string
  summary: string
  industry: string
  difficulty: 'beginner' | 'intermediate'
  estimatedMinutes?: number
  accentIcon: 'citizen' | 'document' | 'learning' | 'benefit'
  learningGoals: string[]
  scenario?: ScenarioEditorial
  sourceUrl: string
  agent: AgentProfile
  instructionStyles?: InstructionStyles
  editable: (keyof AgentProfile)[]
  connections: Connection[]
  knowledge: KnowledgeDocument[]
  facts: Fact[]
  tools: SimulatedTool[]
  skills?: {
    id: string
    title: string
    description: string
    instructions: string
    coverage: 'simulated' | 'reference'
  }[]
  journey: GuideStep[]
  test: {
    suggestedQuestions: string[]
    handoffKeywords: string[]
    unknownAnswer: string
    missingKnowledgeAnswer: string
    handoffBlockedAnswer: string
    handoffReadyAnswer: string
  }
  implementation: { title: string; description: string }[]
  lab?: LabDefinition
  conversations?: ConversationDefinition[]
}

export interface CompiledRecipe extends Recipe {
  estimatedMinutes: number
  knowledge: (KnowledgeDocument & { content: string })[]
}

export type ResponseKind = 'answer' | 'missing-knowledge' | 'out-of-scope' | 'handoff-ready' | 'handoff-blocked'

export interface Citation {
  documentId: string
  title: string
  excerpt: string
}

export interface TestResponse {
  kind: ResponseKind
  text: string
  citations: Citation[]
  trace: string[]
  toolId?: string
  lab?: LabResponse
  draft?: LabDraft
}

export const messageReactions = ['like', 'dislike'] as const
export type MessageReaction = typeof messageReactions[number]

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  response?: TestResponse
  reaction?: MessageReaction
}

export interface EvaluationRow {
  question: string
  response: TestResponse
  caseId?: string
  assertions?: EvaluationAssertion[]
}

export interface EvaluationRun {
  ranAt: string
  fingerprint: string
  rows: EvaluationRow[]
}

export interface RecipeEvaluation {
  name: string
  createdAt: string
  lastRun?: EvaluationRun
}

export interface Activity {
  id: string
  at: string
  type: 'answered' | 'escalated' | 'connection' | 'configuration'
  text: string
}

export interface SimulatedCase {
  id: string
  toolId: string
  resourceId: string
  summary: string
  at: string
  outcomeId?: string
}

export interface Session {
  version: 1
  recipeId: string
  recipeRevision: number
  profile: AgentProfile
  agentIcon: AgentIcon
  connections: Record<string, string>
  enabledKnowledge: string[]
  enabledTools: string[]
  messages: ChatMessage[]
  activity: Activity[]
  cases: SimulatedCase[]
  evaluation?: RecipeEvaluation
  labInputs?: LabInputs
  learningEvidence?: LearningEvidence
}
