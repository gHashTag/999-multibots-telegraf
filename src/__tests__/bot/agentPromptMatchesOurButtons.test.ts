import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ACTIONS } from '@/navigation/helpers/actionButtons'

/**
 * THE PROMPT AND THE PARSER MUST NAME THE SAME BUTTONS.
 *
 * The agent lives in the render service and the parser lives here; they are
 * different packages and nothing links them but prose. So the failure mode is
 * drift: an action added here that the agent never learns to offer, or an id
 * left in the prompt after it was removed here — which the parser then drops
 * silently, and the person sees an answer that promised a button and has none.
 *
 * The prompt is read as TEXT on purpose. Importing across the package boundary
 * would need the render service's own module graph; the contract that matters
 * is what the model is told, and that is a string.
 */
const PROMPT_FILE = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'apps',
  'vibee-editor',
  'render',
  'src',
  'agent',
  'chat.ts'
)
const PARSER_FILE = path.join(
  __dirname,
  '..',
  '..',
  'navigation',
  'helpers',
  'actionButtons.ts'
)

const SOURCE = fs.readFileSync(PROMPT_FILE, 'utf8')
const PARSER = fs.readFileSync(PARSER_FILE, 'utf8')

/** Just the button rule, not the whole prompt: other parts mention other words. */
const RULE = (() => {
  const start = SOURCE.indexOf('const BUTTON_MARKERS')
  expect(start).toBeGreaterThan(-1)
  const end = SOURCE.indexOf('\n\n', start)
  return SOURCE.slice(start, end === -1 ? SOURCE.length : end)
})()

describe('the agent is told exactly the buttons this bot can render', () => {
  it('found a rule to check at all', () => {
    expect(RULE.length).toBeGreaterThan(200)
    expect(ACTIONS.length).toBeGreaterThan(0)
  })

  it('names every registered action', () => {
    const missing = ACTIONS.map(a => a.id).filter(id => !RULE.includes(id))
    expect(missing).toEqual([])
  })

  /**
   * The other direction, and the one that hurts: an id in the prompt that the
   * parser does not know is dropped in silence, so the answer reads as if a
   * button were coming and none arrives.
   */
  it('names no id the parser would drop', () => {
    const known = new Set(ACTIONS.map(a => a.id))
    const promised = [...RULE.matchAll(/\bact:([a-z_]{1,24})\b/g)]
      .map(m => m[1])
      .filter(id => id !== 'id') // the literal placeholder in the marker example
    const invented = promised.filter(id => !known.has(id))
    expect(invented).toEqual([])
  })

  it('states the label limit the parser actually enforces', () => {
    const marker =
      PARSER.match(/\[\\\[\(\[\^\\\]\|\]\{1,(\d+)\}/) ||
      PARSER.match(/\{1,(\d+)\}\\\|act:/)
    expect(
      marker,
      'could not read the label limit out of the parser'
    ).not.toBeNull()
    const limit = marker![1]
    expect(RULE).toContain(limit)
  })
})
