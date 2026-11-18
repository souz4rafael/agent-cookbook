import type { CompiledRecipe } from '../src/domain/types.ts'

// An independent pre-lab recipe keeps keyword routing and legacy event predicates covered.
const facts: CompiledRecipe['facts'] = [
  {
    id: 'documents-answer', documentId: 'required-documents',
    keywords: ['documents', 'documentation', 'proof of address', 'what should I bring'],
    answer: 'To apply for the fictional Community Card, provide photo identification and proof of address issued within the last 90 days.',
    detail: "If the proof of address is in someone else's name, include a signed residency declaration. Legible copies are sufficient in this simulation; do not enter identification numbers or upload personal files.",
  },
  {
    id: 'appeals-answer', documentId: 'appeals-contact',
    keywords: ['appeal', 'appeals', 'challenge', 'review a decision', 'contact'],
    answer: 'Under the fictional Community Card policy, you can appeal a decision within 15 calendar days of receiving the outcome by providing the demonstration reference number and your reason for requesting a review.',
    detail: 'The fictional review is answered within 8 working days. The example contact address is support@example-council.invalid; it does not receive messages. To test a local handoff, ask for human support and then confirm the simulation separately.',
  },
  {
    id: 'deadlines-answer', documentId: 'processing-deadlines',
    keywords: ['deadline', 'deadlines', 'how long', 'processing time', 'application status'],
    answer: 'The fictional Community Card assessment takes up to 10 working days from receipt of all documents required in this demonstration.',
    detail: 'If a document is missing, the fictional clock pauses until it is supplied. The example status check uses a SIM reference at portal.example-council.invalid; this portal is not an accessible service.',
  },
]

export const legacyRecipe: CompiledRecipe = {
  schemaVersion: 1, revision: 2, id: 'legacy-citizen', status: 'published',
  title: 'Legacy citizen regression fixture',
  summary: 'A fictional keyword-based citizen assistant without an interactive lab.',
  industry: 'Government and public services', difficulty: 'beginner', estimatedMinutes: 6, accentIcon: 'citizen',
  learningGoals: ['Select sources, test literal citations and explicitly confirm a local handoff.'],
  sourceUrl: 'https://example.invalid/legacy-citizen',
  agent: {
    name: 'Citizen Services Assistant', description: 'A fictional Community Card assistant.',
    instructions: 'Use only selected example documents. Confirm local handoffs separately.',
    tone: 'friendly', detail: 'concise',
  },
  editable: ['name', 'description', 'instructions', 'tone', 'detail'],
  connections: [
    {
      id: 'sharepoint-demo', type: 'sharepoint', title: 'Demo SharePoint', description: 'Fictional local library.',
      accountLabel: 'Example user', realWorldNote: 'No network access.',
      resources: [
        { id: 'citizen-service', label: 'Citizen services', description: 'Fictional documents.' },
        { id: 'empty-library', label: 'Empty library', description: 'No documents.' },
      ],
    },
    {
      id: 'service-desk-demo', type: 'service-desk', title: 'Demo service desk', description: 'Fictional local queue.',
      accountLabel: 'Example user', realWorldNote: 'No real requests.',
      resources: [{ id: 'citizen-support', label: 'Citizen support', description: 'Local SIM receipts.' }],
    },
  ],
  knowledge: ['required-documents', 'processing-deadlines', 'appeals-contact'].map(id => {
    const fact = facts.find(item => item.documentId === id)!
    return {
      id, title: id, summary: 'Original fictional regression source.',
      connectionId: 'sharepoint-demo', resourceId: 'citizen-service', file: `documents/${id}.txt`,
      content: `Fictional demonstration only.\n\n${fact.answer}\n\n${fact.detail}\n`,
    }
  }),
  facts,
  tools: [{
    id: 'create-citizen-case', type: 'create-case', title: 'Create a human support case',
    description: 'Creates only a local SIM receipt after explicit confirmation.',
    connectionId: 'service-desk-demo', resourceId: 'citizen-support', realWorldNote: 'No email is sent.',
  }],
  journey: [
    { id: 'personalize', title: 'Personalise', description: 'Edit name or instructions.', tab: 'overview', completeWhen: { type: 'profile-edited' } },
    { id: 'connect-library', title: 'Connect', description: 'Connect the library.', tab: 'knowledge', completeWhen: { type: 'connection', connectionId: 'sharepoint-demo' } },
    { id: 'select-documents', title: 'Select', description: 'Select the source.', tab: 'knowledge', completeWhen: { type: 'knowledge', documentId: 'required-documents' } },
    { id: 'verify-answer', title: 'Answer', description: 'Record a cited answer.', tab: 'activity', completeWhen: { type: 'event', event: 'answered' } },
    { id: 'enable-handoff', title: 'Enable', description: 'Enable the tool.', tab: 'tools', completeWhen: { type: 'tool', toolId: 'create-citizen-case' } },
    { id: 'confirm-case', title: 'Confirm', description: 'Confirm a local handoff.', tab: 'handoff', completeWhen: { type: 'event', event: 'escalated' } },
  ],
  test: {
    suggestedQuestions: [
      'What documents do I need for the Community Card?', 'How long does the assessment take?',
      'How do I appeal a decision?', 'I would like human support.', 'What is the weather forecast for tomorrow?',
    ],
    handoffKeywords: ['human support', 'speak to a person', 'speak to an adviser', 'open a case', 'human adviser'],
    unknownAnswer: 'This question is outside the fictional topics recognised in this test.',
    missingKnowledgeAnswer: 'Connect and select the required fictional document.',
    handoffBlockedAnswer: 'Connect the fictional queue and enable its tool first.',
    handoffReadyAnswer: 'Review a summary and confirm separately. This response has not created a case.',
  },
  implementation: [{ title: 'Limits', description: 'A local keyword simulation; no real service or network requests.' }],
}
