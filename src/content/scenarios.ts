import type { CompiledRecipe, Recipe } from '../domain/types.ts'

export interface BusinessScenario {
  id: string
  name: string
  icon: Recipe['accentIcon']
  headline: string
  summary: string
  problem: string
  impact: string
  approach: string
  startSmall: string
  potentialValue: string
  measure: string
  boundary: string
  sourceUrl: string
  sourceLabel?: string
  recipeId?: string
  home: {
    challenge: string
    experiment: string
    takeaway: string
    scope: string
  }
}

export const scenarioLibraryUrl = 'https://adoption.microsoft.com/en-gb/scenario-library/government/?product=agents'

export const businessScenarios: BusinessScenario[] = [
  {
    id: 'citizen-qa',
    name: 'Citizen Q&A agent',
    icon: 'citizen',
    headline: 'Help people get answers, not another phone number.',
    summary: 'Give residents a clear next step and give service teams more time for the cases that need a person.',
    problem: 'A resident wants to use a public service but cannot work out which documents to bring, how long the process takes, or how to challenge a decision. The answers exist, but they are scattered across guidance documents. Residents call for help, and advisers search the same information again and again.',
    impact: 'Unclear guidance becomes repeat calls, incomplete applications and avoidable visits. Residents lose time and confidence, while staff spend time explaining routine steps instead of helping people with more complex needs.',
    approach: 'A Copilot Studio agent can turn approved service guidance into a conversation: explain the required documents, clarify processing times and describe the appeals process, with links to the source. When the guidance is missing or the question needs personal attention, it can acknowledge the limit and, with a configured tool, prepare a support request for a human team.',
    startSmall: 'Start with one service, three approved guidance documents and a clear route to human support. You do not need to connect every department to make the first version useful.',
    potentialValue: 'Aim for fewer avoidable enquiries, better-prepared applications and more adviser time for complex cases.',
    measure: 'Track repeat enquiries, incomplete applications and time spent finding guidance.',
    boundary: 'Explain the process, do not decide the outcome. Looking up a real application requires authenticated access to the relevant system; that is not part of this recipe.',
    sourceUrl: 'https://adoption.microsoft.com/en-gb/scenario-library/government/citizen-qa-agent/',
    recipeId: 'citizen-qa',
    home: {
      challenge: 'Residents struggle to find clear service guidance, so staff answer the same questions repeatedly.',
      experiment: "Change a question's topic or urgency to see when the agent answers from a source or prepares a handoff.",
      takeaway: 'Understand how trusted sources, citations and a reviewed handoff work together.',
      scope: 'Fictional guidance and local requests only; no live adviser or real application lookup.',
    },
  },
  {
    id: 'document-processing-routing',
    name: 'Document processing & routing agent',
    icon: 'document',
    headline: 'Get applications to the right team, with less back-and-forth.',
    summary: 'Help staff spot missing information before an application spends days in the wrong queue.',
    problem: 'Forms and supporting documents arrive through different channels. Someone has to identify the request, check that the required documents are present and work out which team should receive it. Missing attachments or unclear ownership can stay unnoticed until a caseworker opens the file.',
    impact: 'Residents are asked to resend information, teams repeat checks and incomplete cases occupy processing queues. A simple administrative issue becomes a longer wait for the service itself.',
    approach: 'A Copilot Studio agent can coordinate connected document-processing tools and a defined checklist to identify document types, flag missing items and prepare a summary. A configured workflow can route the package to the right queue, while uncertain matches and exceptions go to a member of staff.',
    startSmall: 'Choose one application type, one required-document checklist and one receiving team. Begin with intake support before adding cross-system comparisons.',
    potentialValue: 'Aim for more complete submissions and fewer unnecessary transfers between teams.',
    measure: 'Track returned applications, routing corrections and time from receipt to the right queue.',
    boundary: 'An intake check is not proof that a document is authentic or an application should be approved. Staff need to review uncertain results; document tools and routing connections require separate configuration.',
    sourceUrl: 'https://adoption.microsoft.com/en-gb/scenario-library/government/document-processing-routing-agent/',
    recipeId: 'document-processing-routing',
    home: {
      challenge: 'Missing evidence and misrouted applications keep residents waiting and make teams repeat checks.',
      experiment: 'Remove a document or change a room reference to see the checklist result and destination change.',
      takeaway: 'See how input checks lead to processing, follow-up or manual review.',
      scope: 'You edit example fields, not upload files. Document extraction and OCR are not simulated.',
    },
  },
  {
    id: 'upskilling-recommendation',
    name: 'Upskilling recommendation agent',
    icon: 'learning',
    headline: 'Turn "I need new skills" into a practical next step.',
    summary: 'Make learning options easier to navigate, without replacing the judgement of a careers adviser.',
    problem: 'A resident wants to move into a new type of work but cannot see how their experience connects to the skills it requires. Training options are spread across course catalogues and guidance pages, making it difficult to choose where to begin.',
    impact: "People can spend time on courses that do not support their goals, or give up before starting. Advisers spend valuable appointment time finding basic information rather than discussing the person's needs and choices.",
    approach: "A Copilot Studio agent can ask about a person's learning goals and self-described skills, compare them with approved role descriptions and suggest relevant courses from a maintained catalogue. It can explain why an option may help and prepare a summary for a careers adviser when the next step is unclear.",
    startSmall: 'Focus on one career pathway and a small, approved training catalogue. Help the person explore learning options before considering CV processing or live vacancy integrations.',
    potentialValue: 'Aim for clearer learning choices and better-prepared conversations with advisers.',
    measure: 'Track time to find suitable learning, course take-up and feedback on recommendation relevance.',
    boundary: 'Offer guidance, not hiring decisions or a promise of employment. Let people correct the information used and choose whether to share it with an adviser.',
    sourceUrl: 'https://adoption.microsoft.com/en-gb/scenario-library/government/upskilling-recommendation-agent/',
    recipeId: 'upskilling-recommendation',
    home: {
      challenge: 'People cannot easily connect their current skills to useful training, making the next step hard to choose.',
      experiment: 'Choose a goal, mark skills already recorded and watch the suggested learning resources change.',
      takeaway: 'Learn to explain a recommendation and recognise when an adviser should help.',
      scope: 'Fictional courses and skills only; no CV analysis, enrolment or hiring decisions.',
    },
  },
  {
    id: 'benefit-eligibility',
    name: 'Benefit eligibility agent',
    icon: 'benefit',
    headline: 'Make support easier to understand before an application stalls.',
    summary: 'Help residents understand what to check and help caseworkers prepare a transparent review.',
    problem: 'A resident is unsure which support may be relevant, what evidence is required or how a change in circumstances affects the process. Caseworkers also need to bring application information together and check it against the current policy.',
    impact: 'People may miss support they should enquire about or submit incomplete applications. Staff spend time resolving basic gaps, and unclear explanations make decisions harder to understand or challenge.',
    approach: 'A Copilot Studio agent can explain published criteria and evidence requirements in plain language. With approved connections and an explicit rules service, it can help organise information for a caseworker, flag missing evidence and draft an explanation for review. The responsible service, not a conversational model, makes entitlement decisions.',
    startSmall: 'Begin with guidance for one benefit: what the policy says, which evidence to prepare and how to ask for a human review. Keep real eligibility assessments outside the first version.',
    potentialValue: 'Aim for better-prepared applications and clearer explanations of the next step.',
    measure: 'Track missing-evidence requests, time spent clarifying guidance and resident understanding.',
    boundary: 'This learning approach deliberately focuses on guidance and human-reviewed support, not automated approval or refusal. Real assessments require validated rules, privacy controls, an audit trail and an appeals process.',
    sourceUrl: 'https://adoption.microsoft.com/en-gb/scenario-library/government/benefit-eligibility-agent/',
    recipeId: 'benefit-eligibility',
    home: {
      challenge: 'Unclear criteria and incomplete evidence delay support applications and make decisions harder to understand.',
      experiment: 'Change income, evidence or residence to explore a threshold, missing information and conflicting figures.',
      takeaway: 'Distinguish a preliminary rule check from a human decision, with a reviewable explanation.',
      scope: 'Fictional benefit rules only. No entitlement decisions, refusal letters or payments are issued.',
    },
  },
  {
    id: 'customer-service-optimize',
    name: 'Customer Service Optimize - closure lab',
    icon: 'document',
    headline: 'A closed case is not always a solved customer problem.',
    summary: 'Help service managers distinguish confirmed resolution from silence, without turning an incomplete record into a confident conclusion.',
    problem: 'A support representative sends a proposed fix and closes the case, but the record does not always show whether the customer accepted the resolution. Managers reviewing closure totals cannot easily distinguish confirmed outcomes from unanswered messages or incomplete evidence.',
    impact: 'Unconfirmed closures can hide unresolved issues and contribute to repeat contacts. Treating every closed case as a successful resolution can make service reporting misleading and leave managers unsure where to focus a review.',
    approach: 'A Copilot Studio agent can use a dedicated skill to assess supplied case evidence against configured closure scenarios, explain why a condition matched and prepare a finding for an administrator. The service team remains responsible for investigating gaps and deciding whether follow-up is appropriate.',
    startSmall: 'Begin with one closure scenario and fictional observations. Change customer acceptance, case status and the configured rapid-closure threshold to learn when a finding changes before connecting real case data.',
    potentialValue: 'Aim for more transparent closure reviews, better-targeted follow-up and fewer unsupported claims of successful resolution.',
    measure: 'Track repeat contacts, the share of closures with explicit confirmation and agreement between reviewer judgements and supported findings. Keep unassessed cases separate from healthy results.',
    boundary: 'This is a partial teaching adaptation, not the original agent runtime. Only one closure scenario executes; six other skills are references. Inputs are manually supplied observations, not extracted messages. No customer is contacted and no case is updated.',
    sourceUrl: 'https://copilotstudio.microsoft.com/',
    sourceLabel: 'Copilot Studio product',
    recipeId: 'customer-service-optimize',
    home: {
      challenge: 'A closed case may still lack customer confirmation, hiding unresolved issues and weakening service reporting.',
      experiment: 'Change acceptance, case status or the rapid-closure threshold and compare the resulting findings.',
      takeaway: 'Distinguish a supported closure finding from an unassessed case or incomplete evidence.',
      scope: 'One skill-based exercise and six reference-only skills. Fictional evidence; no model, customer contact or case updates.',
    },
  },
]

export function getScenarioRecipe(scenario: BusinessScenario, recipes: CompiledRecipe[]) {
  return recipes.find(recipe => recipe.id === scenario.recipeId && recipe.status === 'published')
}

export function getRecipeScenario(recipe: Pick<Recipe, 'id'>) {
  return businessScenarios.find(scenario => scenario.recipeId === recipe.id)
}
