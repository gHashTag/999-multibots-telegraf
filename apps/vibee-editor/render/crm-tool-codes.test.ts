import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeValues, quotedCodes } from './failure-code-values'

/*
 * THE /mcp REFUSALS NAME THEMSELVES; THE CRM SCREEN MUST KNOW EVERY NAME.
 *
 * The CRM screen calls the agent's tools over `/mcp`. A refusal arrived as a
 * Russian JSON-RPC `error.message` -- written for a model -- and an English
 * screen printed it after "Could not load:". Since 2026-10-03 every `/mcp`
 * error also carries `error.data.code`, and player/src/lib/crmErrorText.ts
 * turns the code into the dictionary sentence `crm.error.code.<code>`, which
 * must exist in BOTH the en and ru blocks of player/src/atoms/language.ts.
 *
 * Two sources of codes, both read out of the server -- no list is copied here:
 *   - the handler's own refusals (unknown tool, scope, method), literal codes
 *     at each `err(` call in routes.ts;
 *   - a thrown tool error: `toolFailureCode(e)`, which is the `ToolRefusalCode`
 *     union of tool-refusal.ts for the shared gates, else `tool_failed`.
 * What a single tool throws past those gates is NOT named one by one -- that
 * set is open (every handler, every query) -- and the screen words it as
 * `tool_failed`. This contract only holds the closed part closed.
 */
const root = path.join(__dirname, '..', '..', '..')
const render = (...p: string[]) =>
  fs.readFileSync(
    path.join(root, 'apps', 'vibee-editor', 'render', ...p),
    'utf8'
  )
const between = (src: string, from: string, to: string) => {
  const start = src.indexOf(from)
  if (start < 0) return ''
  const end = src.indexOf(to, start + from.length)
  return end < 0 ? '' : src.slice(start, end)
}

const routes = render('src', 'agent', 'routes.ts')
/**
 * The /mcp handler, from just after its `err` helper (whose own
 * `{ code, message, data }` is the envelope, not a value) to its end.
 */
const handler = between(
  routes,
  "const scoped = identity.scope === 'leela-editorial'",
  "{ code: 'unknown_method' }"
)
const refusal = render('src', 'agent', 'tool-refusal.ts')
const union = quotedCodes(
  between(refusal, 'export type ToolRefusalCode', 'export class ToolRefusal')
)
/** `toolFailureCode` is the file's last declaration: its codes to the end. */
const fallback = quotedCodes(
  refusal.slice(Math.max(0, refusal.indexOf('export const toolFailureCode')))
)
const gates = ['crm-tools.ts', 'crm-reach.ts', 'telegram-tools.ts'].map(f =>
  render('src', 'agent', f)
)
const player = (...p: string[]) =>
  fs.readFileSync(
    path.join(root, 'apps', 'vibee-editor', 'player', 'src', ...p),
    'utf8'
  )
/** The screen looks a server code up as `crm.error.code.<code>`. */
const web = player('lib', 'crmErrorText.ts')
const dictionary = player('atoms', 'language.ts')
/** Each language's block, from its declaration to the next top-level `}`. */
const block = (lang: string) =>
  between(dictionary, `const ${lang}: Translations = {`, '\n}\n')
const dictionaries = { en: block('en'), ru: block('ru') }

const handlerCodes = () => [
  ...codeValues(handler + "{ code: 'unknown_method' }").found,
]
const allCodes = () => [...new Set([...handlerCodes(), ...union, ...fallback])]
const unworded = (text: string) =>
  allCodes().filter(code => !text.includes(`'crm.error.code.${code}':`))

describe('/mcp refusal codes', () => {
  it('the slice is the handler, and every err( is named', () => {
    // Positive controls: a moved handler would otherwise read as "no codes".
    expect(handler, '/mcp handler moved').not.toBe('')
    expect(handler).toContain("rpc.method === 'tools/call'")
    const src = handler + "{ code: 'unknown_method' }"
    const calls = src.match(/\berr\(/g) ?? []
    const { found, opaque } = codeValues(src)
    expect(calls.length).toBeGreaterThanOrEqual(5)
    // One code per call: literals, plus the one computed from a thrown error.
    expect(found.length + 1).toBe(calls.length)
    // The only name trusted is toolFailureCode(e); its values are read below.
    expect(opaque).toEqual(['toolFailureCode', 'e'])
  })

  it('a thrown error is named only by the closed union or tool_failed', () => {
    expect(union.length).toBeGreaterThanOrEqual(4)
    expect(fallback).toContain('tool_failed')
  })

  it('every union member is thrown at a shared gate', () => {
    // A member nobody throws is a sentence the screen will never show, and a
    // sign the gate was renamed without the union.
    for (const code of union)
      expect(
        gates.some(src =>
          new RegExp(`new ToolRefusal\\(\\s*'${code}'`).test(src)
        ),
        code
      ).toBe(true)
  })

  it('the CRM screen has a sentence for every code, in en AND ru', () => {
    // Positive controls: the screen reads this key, and both blocks are found.
    expect(web).toContain('`crm.error.code.${code}`')
    for (const [lang, src] of Object.entries(dictionaries)) {
      expect(src, `${lang} block moved`).toContain("'crm.unreachable':")
      expect(allCodes().length).toBeGreaterThanOrEqual(10)
      expect(unworded(src), lang).toEqual([])
    }
    // The blocks are distinct: one slice read twice would hide a missing ru.
    expect(dictionaries.en).not.toBe(dictionaries.ru)
  })

  it('negative control: a dropped sentence turns this red', () => {
    for (const [lang, src] of Object.entries(dictionaries)) {
      const mutated = src.replace("'crm.error.code.no_bots':", "'gone_away':")
      expect(mutated, `${lang}: the mutation did not land`).not.toBe(src)
      expect(unworded(mutated), lang).toEqual(['no_bots'])
    }
  })
})
