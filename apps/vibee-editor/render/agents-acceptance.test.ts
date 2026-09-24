import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MARKETPLACE_AGENTS } from '../packages/vibee-atoms/src/agent-marketplace'
import { TOOLS } from './src/agent/tools'

/*
 * THE ACCEPTANCE SCRIPT IS ONLY AS GOOD AS ITS TABLE (#2959).
 * scripts/agents-acceptance.cjs runs on the live service; this holds that
 * its table covers every catalogued agent, names only real tools, and that
 * a canary which acts is a FAIL.
 */
const require = createRequire(import.meta.url)
const acc = require('../../../scripts/agents-acceptance.cjs') as {
  AGENTS: Array<{ id: string; canary: string; expect: string[] }>
  ACTING: string[]
  readStream: (body: string) => {
    tools: string[]
    text: string
    error: string | null
  }
  verdict: (
    a: { expect: string[] },
    run: { status: number; tools: string[]; text: string; error: string | null }
  ) => { pass: boolean; reasons: string[] }
}
const names = new Set(TOOLS.map(t => t.name))

describe('agents acceptance table', () => {
  it('has one canary for every catalogued agent', () => {
    expect(acc.AGENTS.map(a => a.id).sort()).toEqual(
      MARKETPLACE_AGENTS.map(a => a.id).sort()
    )
  })

  it('names only tools that exist, expected and forbidden alike', () => {
    for (const a of acc.AGENTS)
      for (const t of a.expect) expect(names.has(t), `${a.id}: ${t}`).toBe(true)
    for (const t of acc.ACTING) expect(names.has(t), t).toBe(true)
  })

  it('reads the stream the server writes', () => {
    const body = [
      JSON.stringify({
        ['тип']: 'инструмент',
        ['имя']: 'web_search',
        ['аргументы']: '{}',
      }), // cyrillic-ok: server event keys
      JSON.stringify({ ['тип']: 'текст', ['текст']: 'three sources' }), // cyrillic-ok: server event keys
      JSON.stringify({ ['тип']: 'готово', ['витков']: 2 }), // cyrillic-ok: server event keys
    ].join('\n')
    expect(acc.readStream(body)).toEqual({
      tools: ['web_search'],
      text: 'three sources',
      error: null,
    })
  })

  it('a canary that publishes or sends is a FAIL, whatever else it did', () => {
    const run = {
      status: 200,
      tools: ['web_search', 'feed_publish'],
      text: 'done',
      error: null,
    }
    const v = acc.verdict({ expect: ['web_search'] }, run)
    expect(v.pass).toBe(false)
    expect(v.reasons.join()).toContain('acted: feed_publish')
    expect(
      acc.verdict({ expect: ['web_search'] }, { ...run, tools: ['web_search'] })
        .pass
    ).toBe(true)
    expect(
      acc
        .verdict({ expect: ['web_search'] }, { ...run, tools: [] })
        .reasons.join()
    ).toContain('none of web_search')
  })
})
