/**
 * Ratchet: `tri ton-verify` stays wired and stays HONEST.
 *
 * The tool proves the USDT jetton parser against real chain data with TON
 * Center v3 as an independent oracle (#2147: the parser read the BoC magic as
 * the op and returned 0 for every transfer, so no USDT payment was ever
 * credited). Three properties are pinned:
 *  (1) its offline --self-check passes (address normalisation, 4-point
 *      corroboration, the PARSER-BLIND classifier, BoC magic);
 *  (2) it imports the REAL parser from src/core/ton/jettonBody.ts and does not
 *      carry a copy of the cell-parsing logic (a copy would drift and prove
 *      nothing about production);
 *  (3) it is registered in ./tri (help, cmd_, case) so it is one command.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

const REPO = path.resolve(__dirname, '..', '..', '..')
const TOOL = path.join(REPO, '.claude/loop-opus/ton-verify.mjs')
const TRI = path.join(REPO, 'tri')

// The CODE construct that resolves the parser file -- a mention in a comment
// does not count (a quotation is not an invocation).
const REAL_PARSER_CONSTRUCT =
  /path\.join\(ROOT,\s*'src\/core\/ton\/jettonBody\.ts'\)/
function usesRealParser(src: string): boolean {
  return REAL_PARSER_CONSTRUCT.test(src) && !/\.loadCoins\(/.test(src)
}

describe('tri ton-verify is wired and honest', () => {
  const tool = fs.readFileSync(TOOL, 'utf8')
  const tri = fs.readFileSync(TRI, 'utf8')

  it('offline --self-check passes (exit 0, SELF-CHECK OK)', () => {
    const out = execFileSync('node', [TOOL, '--self-check'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(out).toContain('SELF-CHECK OK')
  })

  it('imports the REAL parser and carries no cell-parsing copy', () => {
    expect(usesRealParser(tool)).toBe(true)
  })

  it('self-check of the detector: a copied loadCoins parser is refused', () => {
    expect(
      usesRealParser(
        "path.join(ROOT, 'src/core/ton/jettonBody.ts'); s.loadCoins()"
      )
    ).toBe(false)
    expect(
      usesRealParser("// see src/core/ton/jettonBody.ts\nconst f = 'COPY.ts'")
    ).toBe(false)
    expect(
      usesRealParser(
        "const file = path.join(ROOT, 'src/core/ton/jettonBody.ts')"
      )
    ).toBe(true)
  })

  it('is registered in ./tri: cmd function, case entry, help text', () => {
    expect(tri).toContain('cmd_ton_verify()')
    expect(tri).toMatch(/^\s*ton-verify\)\s+cmd_ton_verify "\$@" ;;/m)
    expect(tri).toMatch(/^\s*tri ton-verify/m)
  })

  it('mutation: dropping the real-parser import turns the check RED', () => {
    const mutated = tool.replace(
      "path.join(ROOT, 'src/core/ton/jettonBody.ts')",
      "path.join(ROOT, 'src/core/ton/COPY.ts')"
    )
    expect(mutated).not.toEqual(tool)
    expect(usesRealParser(mutated)).toBe(false)
  })
})
