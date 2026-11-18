import type { AgentDefinition } from './framework.ts'

// Add a recipe here to reuse the same composer, history, rendering and provider.
export const chatAgents: readonly AgentDefinition[] = [
  {
    id: 'copilot',
    name: 'Copilot',
    description: 'A little help to get started. Explore what agents can do with fictional examples.',
    greeting: 'What can I help you with?',
    icon: 'copilot',
    starters: [
      { label: 'Summarize a meeting', prompt: 'Summarize the sample project meeting and highlight the next steps.' },
      { label: 'Draft a follow-up', prompt: 'Draft a follow-up email for the sample project meeting.' },
      { label: 'Explore an idea', prompt: 'Help me brainstorm ideas for a better employee onboarding experience.' },
    ],
    sources: [{
      title: 'Northstar project notes',
      content: 'Fictional example. The Northstar team agreed to pilot a new employee onboarding guide with five volunteers. Alex owns the draft; Sam coordinates feedback. The team will review feedback before deciding whether to expand the pilot. No dates or budget were approved.',
    }],
    rules: [
      {
        keywords: ['email', 'follow-up', 'follow up', 'draft'],
        text: 'Here is a follow-up you can review and adapt.',
        sections: [
          { title: 'Subject: Next steps for the Northstar pilot', items: ['Thanks for the discussion. We agreed to test the onboarding guide with five volunteers before considering a wider rollout.'] },
          { title: 'Next steps', items: ['Alex: prepare the first draft of the guide.', 'Sam: coordinate volunteer feedback.', 'Team: review what we learn and decide whether to expand the pilot.'] },
          { title: 'Still to agree', items: ['Confirm the timeline and review date. Nothing has been sent or scheduled.'] },
        ],
      },
      {
        keywords: ['summar', 'meeting', 'next step', 'resum', 'reuni'],
        text: 'The Northstar team agreed to start small: test an onboarding guide, learn from feedback, then decide what comes next.',
        sections: [
          { title: 'What was decided', items: ['Pilot the guide with five volunteers.', 'Use feedback to inform a possible wider rollout.'] },
          { title: 'Who is doing what', items: ['Alex will write the first draft.', 'Sam will coordinate feedback from volunteers.'] },
          { title: 'Open questions', items: ['The timeline, review date and budget have not been agreed.'] },
        ],
      },
      {
        keywords: ['idea', 'brainstorm', 'onboard', 'plan'],
        text: 'Here are three ways to make an employee\'s first week easier.',
        sections: [
          { title: 'Start with the moments that matter', items: ['A first-day guide: one place for the essentials, from access to key contacts.', 'A question-answering agent: help people find approved policies without searching several sites.', 'A buddy check-in: a short conversation to spot confusion early.'] },
          { title: 'A simple experiment', items: ['Pick one team and five volunteers.', 'Ask which questions still go unanswered, then improve the guide.'] },
        ],
      },
    ],
    fallback: 'This playground uses scripted examples, not a connected AI model. Try asking me to summarize the sample meeting, draft a follow-up, or brainstorm onboarding ideas. You can also choose a specialist agent from the sidebar.',
  },
  {
    id: 'citizen-qa',
    name: 'Citizen Q&A',
    description: 'Help residents find clear answers in approved council guidance, without inventing policy.',
    greeting: 'How can I help your community?',
    icon: 'citizen',
    starters: [
      { label: 'Report a missed collection', prompt: 'How do I report a missed bin collection?' },
      { label: 'Find library hours', prompt: 'When is the sample library open?' },
      { label: 'Check the boundaries', prompt: 'Can you approve my benefit application?' },
    ],
    sources: [{
      title: 'Contoso council service guide',
      content: 'Fictional example. Missed bin collections can be reported after 6 pm on the scheduled collection day and within two working days. The report needs a street address and bin type. The library opens Monday to Friday, 9 am to 6 pm, and Saturday, 10 am to 4 pm. It is closed on Sundays. Benefit decisions require a council officer.',
    }],
    rules: [
      { keywords: ['bin', 'collection', 'waste'], text: 'You can report a missed collection after 6 pm on your scheduled collection day.', sections: [
        { title: 'Before you report it', items: ['Check that the collection was due today.', 'Report it within two working days.', 'Have your street address and bin type ready.'] },
        { title: 'In this playground', items: ['This is fictional council guidance. No service request will be submitted.'] },
      ] },
      { keywords: ['library', 'hours', 'open'], text: 'Here are the opening hours for the fictional Contoso library.', sections: [
        { title: 'Opening hours', items: ['Monday to Friday: 9 am to 6 pm.', 'Saturday: 10 am to 4 pm.', 'Sunday: closed.'] },
      ] },
      { keywords: ['benefit', 'approve', 'application'], text: 'I cannot approve an application or make a benefit decision.', sections: [
        { title: 'The right next step', items: ['A council officer needs to review the application.', 'Do not enter personal or financial information in this playground.'] },
      ] },
    ],
    fallback: 'That answer is not in this recipe\'s sample service guide. I should not guess. Try asking about missed bin collections, library hours, or how benefit decisions are handled.',
  },
  {
    id: 'meeting-coach',
    name: 'Meeting Coach',
    description: 'Turn fictional meeting notes into decisions, owners and a useful follow-up.',
    greeting: 'Make your next meeting matter.',
    icon: 'meeting',
    starters: [
      { label: 'Find the decisions', prompt: 'Summarize the decisions in the sample launch meeting.' },
      { label: 'List action items', prompt: 'What action items and owners came out of the meeting?' },
      { label: 'Draft a follow-up', prompt: 'Draft a follow-up for the launch meeting.' },
    ],
    sources: [{
      title: 'Fabrikam launch meeting',
      content: 'Fictional example. Fabrikam will run an internal preview before the public launch. Jordan will prepare the demo; Taylor will collect accessibility feedback. A public launch date was not agreed. The team needs a security review before widening access.',
    }],
    rules: [
      { keywords: ['follow', 'draft', 'email'], text: 'Here is a review-ready follow-up for the fictional launch meeting.', sections: [
        { title: 'Subject: Internal preview - agreed next steps', items: ['Thanks, everyone. We will start with an internal preview and use the feedback before deciding on a public launch.'] },
        { title: 'Actions', items: ['Jordan: prepare the demo.', 'Taylor: collect accessibility feedback.', 'Team: arrange the security review before widening access.'] },
        { title: 'Not yet decided', items: ['The public launch date remains open. This draft has not been sent.'] },
      ] },
      { keywords: ['summar', 'decision', 'action', 'owner', 'meeting'], text: 'The team agreed to an internal preview, not a public launch.', sections: [
        { title: 'Owners and actions', items: ['Jordan will prepare the demo.', 'Taylor will collect accessibility feedback.'] },
        { title: 'Dependencies and unknowns', items: ['A security review is required before widening access.', 'No public launch date has been agreed.'] },
      ] },
    ],
    fallback: 'I can demonstrate decisions, action items or a follow-up using the fictional Fabrikam meeting. I do not have access to your calendar, recordings or transcripts.',
  },
  {
    id: 'writing-coach',
    name: 'Writing Coach',
    description: 'Practice turning a wordy sample update into clear, audience-friendly writing.',
    greeting: 'Let\'s find the right words.',
    icon: 'writing',
    starters: [
      { label: 'Make it clearer', prompt: 'Rewrite the sample update in plain English.' },
      { label: 'Write for leaders', prompt: 'Turn the sample update into an executive summary.' },
      { label: 'Try a warmer tone', prompt: 'Make the sample update warmer and more conversational.' },
    ],
    sources: [{
      title: 'Sample project update',
      content: 'Fictional example. Original: Following the completion of our initial validation activities, we are in a position to initiate a limited pilot, contingent upon the receipt of feedback from the participating team. The pilot has not started yet.',
    }],
    rules: [
      { keywords: ['leader', 'executive'], text: 'Validation is complete. The pilot is ready to start once the participating team provides feedback.', sections: [
        { title: 'What changed', items: ['Put the status first.', 'Kept the dependency visible.', 'Did not imply the pilot has already started.'] },
      ] },
      { keywords: ['warm', 'tone', 'conversation'], text: 'We\'ve finished the initial checks and are nearly ready for a small pilot. First, we\'d love to hear the participating team\'s feedback.', sections: [
        { title: 'Why this works', items: ['Uses everyday words and a friendly tone.', 'Preserves the original condition: feedback comes before the pilot.'] },
      ] },
      { keywords: ['clear', 'rewrite', 'plain', 'update', 'simpl'], text: 'We\'ve finished the initial checks. We can start a small pilot once the participating team shares its feedback.', sections: [
        { title: 'The editing recipe', items: ['Replace abstract phrases with concrete actions.', 'Use two short sentences rather than one long sentence.', 'Keep the original meaning and dependencies.'] },
      ] },
    ],
    fallback: 'This recipe rewrites a fixed fictional project update. Try "make the sample clearer", "write for leaders", or "try a warmer tone". Arbitrary document rewriting needs a real model provider.',
  },
  {
    id: 'research-assistant',
    name: 'Research Assistant',
    description: 'Compare sample evidence, surface gaps and avoid presenting assumptions as facts.',
    greeting: 'A good answer starts with evidence.',
    icon: 'research',
    starters: [
      { label: 'Compare the options', prompt: 'Compare the two options in the sample research brief.' },
      { label: 'Find the gaps', prompt: 'What evidence is missing from this research?' },
      { label: 'Recommend a next step', prompt: 'What should we do next based on the research?' },
    ],
    sources: [{
      title: 'Sample research brief',
      content: 'Fictional example. Option A is a searchable onboarding guide; it is simple to maintain but relies on employees finding the right page. Option B is a question-answering agent grounded in approved guidance; it can answer directly but needs content ownership and evaluation. No measured cost, adoption or time-saving data is available.',
    }],
    rules: [
      { keywords: ['gap', 'missing', 'evidence'], text: 'The brief describes trade-offs, but it does not establish which option performs better.', sections: [
        { title: 'Evidence still needed', items: ['Measured time to find an answer.', 'User adoption and satisfaction.', 'Content maintenance effort and total cost.'] },
      ] },
      { keywords: ['next', 'recommend'], text: 'Run a small comparison before choosing a wider rollout.', sections: [
        { title: 'A practical next step', items: ['Give a small group the same approved guidance in both formats.', 'Measure answer accuracy, time to answer and user feedback.', 'Choose based on evidence rather than assumed savings.'] },
      ] },
      { keywords: ['compar', 'option', 'research'], text: 'Both options can improve access to guidance, but they solve the problem differently.', sections: [
        { title: 'Option A: searchable guide', items: ['Simple to maintain.', 'Employees still need to find the right page.'] },
        { title: 'Option B: grounded Q&A agent', items: ['Answers questions directly from approved guidance.', 'Needs clear content ownership and ongoing evaluation.'] },
        { title: 'What we cannot conclude', items: ['No measured cost, adoption or time-saving data is available.'] },
      ] },
    ],
    fallback: 'This example only uses the fictional research brief. Try comparing the options or asking about missing evidence. Live web research is not connected.',
  },
]

export function getChatAgent(id: string): AgentDefinition {
  const agent = chatAgents.find(item => item.id === id)
  if (!agent) throw new Error(`Unknown chat recipe: ${id}`)
  return agent
}
