import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeValues, quotedCodes as quoted } from './failure-code-values'

/*
 * THE AGENT CHAT NAMES ITS FAILURES; BOTH CLIENTS MUST KNOW EVERY NAME.
 *
 * `/api/agent/chat` words its failures for a developer -- some in Russian,
 * the thread gate in English -- and the web and the iPhone showed those words
 * as they came, or the raw JSON body. Since 2026-10-02 every failure carries a
 * `code`: the HTTP refusals, the `ошибка` events and the `готово` that hit the  // cyrillic-ok: the event names
 * step limit. The clients translate the code.
 *
 * The codes are read out of the server itself -- no list is copied here -- so
 * a new one fails this until both clients can say it.
 */
const root = path.join(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')
const literals = (src: string) => codeValues(src).found
/** The only non-literal code the chat route may set: GateCode, read below. */
const TRUSTED = ['gate.code']

const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')
const sStart = server.indexOf("=== '/api/agent/chat' && req.method === 'POST'")
const sEnd = server.indexOf('handleAgentChat(', sStart)
const door = server.slice(sStart, sEnd)

const routes = read(
  'apps',
  'vibee-editor',
  'render',
  'src',
  'agent',
  'routes.ts'
)
const gateUnion = routes.match(/export type GateCode =([^\n]+)/)
const rStart = routes.indexOf('export async function handleAgentChat(')
const rEnd = routes.indexOf('\nexport ', rStart + 1)
const handler = routes.slice(rStart, rEnd)

const chat = read('apps', 'vibee-editor', 'render', 'src', 'agent', 'chat.ts')
const events = [
  // Prettier lays a long member over several lines, so no `;` and no one-line
  // shape is assumed: `{`, the kind, then anything up to `code?:`.
  ...chat.matchAll(/\{\s*тип: '(?:готово|ошибка)'[;\s][^}]*code\?: ([^}]+)\}/g), // cyrillic-ok: the event names
].flatMap(m => quoted(m[1]))
const yielded = literals(chat)

const codes = [
  ...new Set([
    ...literals(door),
    ...(gateUnion ? quoted(gateUnion[1]) : []),
    ...literals(handler),
    ...events,
  ]),
]

const web = read(
  'apps',
  'vibee-editor',
  'player',
  'src',
  'lib',
  'agentChatText.ts'
)
const ios = read('apps', 'vibee-ios', 'Vibee', 'AgentChatView.swift')

describe('agent chat failure codes', () => {
  it('the slices are the chat route, and they name their failures', () => {
    // Positive controls: a moved route would otherwise read as "no codes, all known".
    expect(sStart, 'the chat door moved').toBeGreaterThan(-1)
    expect(sEnd - sStart, 'the chat door slice').toBeLessThan(2000)
    expect(literals(door)).toEqual(['sign_in'])
    expect(gateUnion, 'GateCode moved').not.toBeNull()
    expect(rStart, 'handleAgentChat moved').toBeGreaterThan(-1)
    expect(handler).toContain('code: gate.code')
    expect(literals(handler)).toEqual(
      expect.arrayContaining(['forbidden', 'bad_request', 'internal'])
    )
    expect(events).toEqual(
      expect.arrayContaining([
        'step_limit',
        'no_answer',
        'model_failed',
        'internal',
      ])
    )
  })

  it('sets no code the contract cannot read', () => {
    for (const [name, src] of [
      ['door', door],
      ['handleAgentChat', handler],
      ['chat.ts', chat],
    ] as const)
      for (const o of codeValues(src).opaque)
        expect(TRUSTED, `${name} sets code from ${o}`).toContain(o)
  })

  it('every code the turn yields is declared on its event', () => {
    for (const code of yielded) expect(events, code).toContain(code)
  })

  it('the web has a sentence for every code', () => {
    for (const code of codes)
      expect(web, code).toMatch(new RegExp(`\\b${code}: \\{`))
  })

  it('the app has a sentence for every code', () => {
    for (const code of codes) expect(ios, code).toContain(`"${code}":`)
  })
})
