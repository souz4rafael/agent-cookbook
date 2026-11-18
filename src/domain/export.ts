import { getAvailableKnowledge, isToolAvailable } from './engine.ts'
import type { CompiledRecipe, Session } from './types.ts'
import { implementationReferences } from '../content/implementation-references.ts'
import { identifyInstructionStyle, instructionStyleOptions } from './instructions.ts'

export function createImplementationBrief(recipe: CompiledRecipe, session: Session): string {
  const documents = getAvailableKnowledge(recipe, session)
  const tools = recipe.tools.filter(tool => isToolAvailable(recipe, session, tool.id))
  const style = recipe.instructionStyles ? identifyInstructionStyle(recipe.instructionStyles, session.profile.instructions) : null
  return [
    'COPILOT STUDIO AGENTS COOKBOOK | IMPLEMENTATION BRIEF',
    `Recipe: ${recipe.title} (${recipe.id}, revision ${recipe.revision})`,
    '',
    'EDUCATIONAL SIMULATION. This file is not an importable, published or certified agent.',
    'No credentials are included. Connections, documents and requests in this exercise are fictional.',
    'The beta uses deterministic responses, not generative AI. Free text was not executed as instructions.',
    '',
    'CONFIGURED PROFILE',
    `Name: ${session.profile.name}`,
    `Icon: ${session.agentIcon}`,
    ...(recipe.instructionStyles ? [`Instruction writing style: ${style ? instructionStyleOptions.find(option => option.id === style.style)!.label + (style.includeExamples ? ' with behaviour examples' : '') : 'Custom / previously saved text'}`] : []),
    `Proposed instructions: ${session.profile.instructions}`,
    `Tone: ${session.profile.tone === 'friendly' ? 'friendly' : 'formal'}`,
    `Detail: ${session.profile.detail === 'concise' ? 'concise' : 'detailed'}`,
    ...(recipe.instructionStyles ? [
      '',
      'INSTRUCTION AUTHORING NOTES (NOT PART OF THE INSTRUCTIONS)',
      'Writing styles are cookbook learning templates, not official Copilot Studio modes. Test their generative effect in the real product.',
      'Configure resources first. Bind objects with the real product slash picker; pasted names do not create resource bindings.',
      'Leave system-managed citation behaviour unchanged. Instructions do not override retrieval settings, system fallback or Adaptive Card triggers.',
      'Microsoft Learn: https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-instructions',
      'Standard harness guidance: https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/generative-mode-guidance',
    ] : []),
    '',
    'ACTIVE SOURCES IN THE SIMULATION',
    ...(documents.length ? documents.map(doc => `- ${doc.title}`) : ['No active sources.']),
    '',
    'SIMULATED CONNECTIONS',
    ...recipe.connections.map(connection => {
      const selected = connection.resources.find(resource => resource.id === session.connections[connection.id])
      return [
        `- ${connection.title}: ${selected?.label ?? 'not connected'}`,
        `  In a real environment: ${connection.realWorldNote}`,
      ].join('\n')
    }),
    '',
    'ACTIVE TOOLS IN THE SIMULATION',
    ...(tools.length ? tools.map(tool => `- ${tool.title}\n  In a real environment: ${tool.realWorldNote}`) : ['No active tools.']),
    ...(recipe.skills?.length ? [
      '',
      'SKILL REFERENCES AND TEACHING COVERAGE',
      'These paraphrased references are not uploaded skill packages or native execution.',
      ...recipe.skills.map(skill => `- ${skill.id} (${skill.coverage === 'simulated' ? 'bounded teaching exercise' : 'reference only; not executable'})\n${skill.description}\n${skill.instructions}`),
    ] : []),
    '',
    'STEPS TO BUILD IN THE REAL PRODUCT',
    ...recipe.implementation.map((step, index) => `${index + 1}. ${step.title}\n${step.description}`),
    ...(recipe.lab ? [
      '',
      'DECLARATIVE LEARNING CONTRACT',
      'Inputs and rules below are learning fixtures, not a deployable Copilot Studio package.',
      ...recipe.lab.fields.map(field => `Input: ${field.id} (${field.type}) - ${field.label}. ${field.hint}`),
      ...recipe.lab.checks.map(check => `Check: ${check.id} - ${check.field} ${check.operator} ${check.otherField ? `field ${check.otherField}` : JSON.stringify(check.value ?? null)}`),
      ...recipe.lab.rules.map(rule => `Rule: ${rule.id} -> ${rule.outcomeId}; all=${JSON.stringify(rule.all)}; any=${JSON.stringify(rule.any ?? [])}`),
      ...recipe.lab.cases.map(testCase => `Acceptance case: ${testCase.id} - ${testCase.title}; expected=${JSON.stringify(testCase.expected)}`),
      'Inputs entered during this session, conversation context and reviewed drafts are not exported.',
    ] : []),
    '',
    'BEFORE PUBLISHING',
    'Confirm the environment, permissions, authentication, licensing, cost, source access and organisational policies.',
    'Replace all fictional data with authorised, validated and versioned content.',
    'Evaluate answers, citations, failures and human handoff using representative test cases.',
    'Define human review and auditability appropriate to the impact of the service. Do not let a model make autonomous decisions about rights or entitlements.',
    '',
    'OFFICIAL IMPLEMENTATION REFERENCES',
    ...implementationReferences.map(reference => `${reference.title}: ${reference.url}`),
    'Guides include standard-harness instructions; screen names and capabilities vary by harness and environment.',
    '',
    `Reference scenario: ${recipe.sourceUrl}`,
    'Real product: https://copilotstudio.microsoft.com',
    'No conversation messages or simulated case contents are included in this brief.',
    '',
  ].join('\n')
}
