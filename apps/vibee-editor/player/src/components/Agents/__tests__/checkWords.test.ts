/**
 * The words for a tool describe a tool that exists: every worded name is
 * declared by the render server, so a renamed or removed tool fails here
 * instead of leaving a card describing a call that can no longer happen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WORDED_REASONS,
  WORDED_TOOLS,
  checkedTools,
  failReasons,
} from '../checkWords'

const RENDER_SRC = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'render',
  'src'
)

function declaredTools(dir: string, out = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) declaredTools(path, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      for (const m of readFileSync(path, 'utf8').matchAll(
        /^\s*name: '([a-z_]+)',$/gm
      ))
        out.add(m[1])
    }
  }
  return out
}

describe('checkWords: calls', () => {
  it('words only tools the render server declares', () => {
    const declared = declaredTools(RENDER_SRC)
    expect(declared.size).toBeGreaterThan(20)
    expect(WORDED_TOOLS.filter(t => !declared.has(t))).toEqual([])
  })

  it('one line per tool, in the order first called, with a count', () => {
    expect(checkedTools(['web_read', 'web_search', 'web_read'], 'en')).toEqual([
      { name: 'web_read', label: 'Read a web page', times: 2 },
      { name: 'web_search', label: 'Searched the web', times: 1 },
    ])
  })

  it('shows a name it has no words for as it is, never a guess', () => {
    expect(checkedTools(['brand_new_tool'], 'ru')).toEqual([
      { name: 'brand_new_tool', label: 'brand_new_tool', times: 1 },
    ])
  })
})

describe('checkWords: why a check failed', () => {
  const declared = (() => {
    const src = readFileSync(
      join(RENDER_SRC, 'agent', 'agent-acceptance.ts'),
      'utf8'
    )
    const block = /export const FAIL_CODES = \[([\s\S]*?)\] as const/.exec(
      src
    )?.[1]
    return [...(block ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  })()

  it('has words for exactly the codes the server can send', () => {
    expect(declared.length).toBeGreaterThan(3)
    expect([...WORDED_REASONS].sort()).toEqual([...declared].sort())
  })

  it('each reason once, in order', () => {
    expect(failReasons(['error', 'no_answer', 'error'], 'en')).toEqual([
      'The run broke off with an error',
      'The agent gave no answer',
    ])
  })

  it('shows a code it has no words for as it is', () => {
    expect(failReasons(['brand_new_code'], 'en')).toEqual(['brand_new_code'])
  })
})
