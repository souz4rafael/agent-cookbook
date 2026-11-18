import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatAgents, getChatAgent } from '../src/copilot/agents.ts'
import { copilotIconAssets, copilotIconUrl } from '../src/copilot/icons.ts'
import type { CopilotIconName } from '../src/copilot/icons.ts'
import {
  conversationTitle, decodeHistory, encodeHistory, replyToText, simulateReply, simulatedProvider,
} from '../src/copilot/framework.ts'
import type { ChatRequest, Conversation } from '../src/copilot/framework.ts'

const request = (agentId: string, text: string): ChatRequest => ({
  agent: getChatAgent(agentId), messages: [{ id: 'm1', role: 'user', text }], useSources: true, style: 'Auto',
})
const conversation = (temporary = false): Conversation => ({
  id: 'c1', agentId: 'copilot', title: 'Summarize the meeting', updatedAt: '2026-01-01T10:00:00.000Z',
  temporary, messages: [{ id: 'm1', role: 'user', text: 'Summarize the sample meeting.' }],
})

test('every configured chat recipe has working starter examples and valid source references', () => {
  assert.equal(new Set(chatAgents.map(agent => agent.id)).size, chatAgents.length)
  for (const agent of chatAgents) {
    assert.ok(agent.starters.length >= 3)
    for (const starter of agent.starters) {
      const result = simulateReply(request(agent.id, starter.prompt))
      assert.notEqual(result.text, agent.fallback, `${agent.id}: ${starter.prompt}`)
      assert.ok(result.sections.length > 0)
      assert.ok(result.sources.every(title => agent.sources.some(source => source.title === title)))
    }
  }
})

test('unknown prompts and prohibited decisions get honest scoped responses', () => {
  const agent = getChatAgent('citizen-qa')
  assert.equal(simulateReply(request(agent.id, 'Who won the football match?')).text, agent.fallback)
  assert.match(simulateReply(request(agent.id, 'Approve my benefit application')).text, /cannot approve/)
  assert.throws(() => getChatAgent('not-an-agent'), /Unknown chat recipe/)
})

test('sample context can be disabled without fabricating source-backed specialist answers', () => {
  const input = request('citizen-qa', 'library hours')
  const result = simulateReply({ ...input, useSources: false })
  assert.match(result.text, /context is turned off/)
  assert.deepEqual(result.sources, [])
  const previous = simulateReply(input)
  const followup = simulateReply({ ...input, useSources: false, messages: [
    ...input.messages, { id: 'm2', role: 'assistant', text: previous.text, reply: previous },
    { id: 'm3', role: 'user', text: 'Make it shorter' },
  ] })
  assert.match(followup.text, /context is turned off/)
})

test('response styles and follow-ups change results without mutating recipes', () => {
  const input = request('copilot', 'Summarize the meeting')
  const before = JSON.stringify(chatAgents)
  const auto = simulateReply(input)
  const quick = simulateReply({ ...input, style: 'Quick response' })
  const deep = simulateReply({ ...input, style: 'Think deeper' })
  assert.ok(quick.sections.length < auto.sections.length)
  assert.ok(deep.sections.length > auto.sections.length)
  const followup = simulateReply({ ...input, messages: [
    ...input.messages, { id: 'm2', role: 'assistant', text: auto.text, reply: auto },
    { id: 'm3', role: 'user', text: 'Make it shorter' },
  ] })
  assert.equal(followup.text, auto.text)
  assert.equal(followup.sections.length, 1)
  assert.equal(JSON.stringify(chatAgents), before)
  assert.match(replyToText(auto), /Sample sources: Northstar project notes/)
})

test('provider cancellation rejects before or during a response', async () => {
  const input = request('copilot', 'Summarize the meeting')
  const stopped = new AbortController()
  stopped.abort()
  await assert.rejects(simulatedProvider.respond(input, stopped.signal), { name: 'AbortError' })
  const controller = new AbortController()
  const pending = simulatedProvider.respond(input, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('saved history round-trips and excludes all temporary conversations', () => {
  const saved = conversation()
  const temporary = { ...conversation(true), id: 'temp', messages: [{ id: 'private', role: 'user' as const, text: 'temporary content' }] }
  const raw = encodeHistory([saved, temporary])
  assert.doesNotMatch(raw, /temporary content/)
  assert.deepEqual(decodeHistory(raw, chatAgents), [saved])
  assert.deepEqual(decodeHistory(null, chatAgents), [])
  assert.deepEqual(decodeHistory(encodeHistory([temporary]), chatAgents), [])
})

test('corrupted, oversized, duplicate and unrecognised history is rejected explicitly', () => {
  assert.throws(() => decodeHistory('{broken', chatAgents), SyntaxError)
  assert.throws(() => decodeHistory('x'.repeat(2_000_001), chatAgents), RangeError)
  assert.throws(() => decodeHistory('{"version":2,"conversations":[]}', chatAgents), /invalid format/)
  assert.throws(() => decodeHistory(JSON.stringify({ version: 1, conversations: [conversation(true)] }), chatAgents), /invalid agent/)
  assert.throws(() => decodeHistory(encodeHistory([{ ...conversation(), agentId: 'missing' }]), chatAgents), /invalid agent/)
  assert.throws(() => decodeHistory(encodeHistory([conversation(), conversation()]), chatAgents), /invalid agent/)
  assert.throws(() => encodeHistory(Array.from({ length: 41 }, (_, index) => ({ ...conversation(), id: String(index) }))))
})

test('titles are normalized and bounded while message content stays plain data', () => {
  assert.equal(conversationTitle('  Hello\n  world  '), 'Hello world')
  assert.equal(conversationTitle('x'.repeat(100)).length, 64)
  const saved = conversation()
  saved.messages[0].text = '<script>alert("not executed")</script>'
  assert.equal(decodeHistory(encodeHistory([saved]), chatAgents)[0].messages[0].text, saved.messages[0].text)
})

test('Copilot portal build stays separate from the existing public and restricted portals', async () => {
  const config = await readFile(new URL('../vite.copilot.config.ts', import.meta.url), 'utf8')
  const existing = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8')
  const html = await readFile(new URL('../copilot/index.html', import.meta.url), 'utf8')
  assert.match(config, /dist-copilot/)
  assert.match(config, /port: 4196/)
  assert.doesNotMatch(existing, /copilot\/|dist-copilot/)
  assert.match(html, /<title>Copilot Agents Cookbook<\/title>/)
  assert.match(html, /<meta name="referrer" content="no-referrer"/)
})

test('product-specific icons reference the original public assets and have bundled SVG fallbacks', () => {
  const expected: Record<CopilotIconName, string> = {
    tasks: 'apps/bebop-unread-tasks.svg',
    new: 'shared/add-circle-filled.svg',
    newIdle: 'shared/add-circle.svg',
    search: 'apps/search.svg',
    autopilot: 'nav-tabs/autopilot-home.svg',
    library: 'apps/library.svg',
    automations: 'cowork/arrow-repeat-all.svg',
    plugins: 'apps/plugins-v2.svg',
    agents: 'apps/bebop-agents.svg',
    workspaces: 'apps/workspaces.svg',
    settings: 'shared/settings-gear.svg',
  }
  for (const name of Object.keys(copilotIconAssets) as CopilotIconName[]) {
    const url = new URL(copilotIconUrl(name))
    assert.equal(url.origin, 'https://res.public.onecdn.static.microsoft')
    assert.equal(url.pathname, `/midgard/versionless/m365copilotresources/${expected[name]}`)
    assert.equal(url.search, '')
    assert.match(renderToStaticMarkup(createElement(copilotIconAssets[name].fallback)), /viewBox="0 0 20 20"/)
  }
})
