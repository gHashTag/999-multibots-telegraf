/**
 * Ratchet: avatarBrainWizard must not send parse_mode:'HTML'.
 *
 * The scene's confirmation reply interpolates raw user free-text
 * (company/position/skills) into the message. With parse_mode:'HTML', a single
 * '<' or '&' in that text yields a Telegram 400 ("can't parse entities"), the
 * reply throws, and the user is falsely told the avatar brain failed -- even
 * though updateUserSoul already saved it. The template contains no HTML markup,
 * so parse_mode is unnecessary; dropping it removes the failure mode.
 *
 * This pins it: no reply-options object in the scene sets parse_mode:'HTML'.
 * If HTML formatting is genuinely needed later, escape the user fields first.
 *
 * loop-fable iter196 (found by the bug-hunt-fresh-lenses workflow, markdown lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/avatarBrainWizard/index.ts')

function analyze(source: string): number[] {
  const sf = ts.createSourceFile(
    'avatarBrainWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const hits: number[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAssignment(n) &&
      ((ts.isIdentifier(n.name) && n.name.text === 'parse_mode') ||
        (ts.isStringLiteral(n.name) && n.name.text === 'parse_mode')) &&
      ts.isStringLiteral(n.initializer) &&
      n.initializer.text === 'HTML'
    ) {
      hits.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return hits
}

describe('avatarBrainWizard sends no parse_mode:HTML', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const hits = analyze(source)

  it('self-check: detector flags parse_mode:HTML but not a plain reply', () => {
    expect(analyze(`ctx.reply(t, { parse_mode: 'HTML' })`).length).toBe(1)
    expect(analyze(`ctx.reply(t, { reply_markup: k })`).length).toBe(0)
  })

  it('no parse_mode:HTML in the scene', () => {
    expect(
      hits,
      `avatarBrainWizard sets parse_mode:'HTML' (lines: ${hits.join(', ')}) while ` +
        `interpolating raw user text -- a '<' in company/position/skills yields a ` +
        `Telegram 400 and falsely reports failure. Drop parse_mode or escape the fields.`
    ).toEqual([])
  })

  // matcher-not-stale floor: the guard is "no parse_mode:HTML on a reply". If the
  // wizard were renamed/gutted to have no message-sending calls at all, the
  // absence assertion above would pass vacuously. Require the scene to still send
  // the replies this ratchet is guarding, so a gutted target fails loud.
  it('floor: the scene still sends replies this ratchet guards', () => {
    const sends = (
      source.match(/\.(reply|editMessageText|sendMessage)\s*\(/g) || []
    ).length
    expect(sends).toBeGreaterThan(0)
  })
})
