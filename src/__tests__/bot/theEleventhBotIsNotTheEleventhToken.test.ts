/**
 * The name of the variable a token came from is not its index in the array.
 *
 * Production has a hole: BOT_TOKEN_11 is absent (that slot belongs to
 * OM_AI_Digital_studio_bot), BOT_TOKEN_12 (`t27ai_bot`) is present. Discovery
 * deliberately does not trip over the gap, but the names used in logs were
 * assembled from the position -- `BOT_TOKEN_${index + 1}`. Over a hole the two
 * drift apart, and they drift apart in precisely the message the name exists
 * for: "invalid token".
 *
 * This test holds a shape that does not depend on the numbering being dense.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  discoverBotTokenEntries,
  discoverBotTokens,
  nextFreeBotSlot,
} from '@/utils/discoverBotTokens'

/** Production in miniature: ten in a row, a hole, then the twelfth. */
function envWithGapAtEleven(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (let i = 1; i <= 10; i++) env[`BOT_TOKEN_${i}`] = `token-${i}`
  env.BOT_TOKEN_12 = 'token-12'
  return env
}

describe('a hole in the token numbering', () => {
  it('the eleventh token found is called BOT_TOKEN_12, not BOT_TOKEN_11', () => {
    const found = discoverBotTokenEntries(envWithGapAtEleven())

    expect(found).toHaveLength(11)
    const last = found[found.length - 1]
    expect(last.token).toBe('token-12')
    // The point of the fix: the name follows the key, not the position.
    expect(last.key).toBe('BOT_TOKEN_12')
    expect(found.map(e => e.key)).not.toContain('BOT_TOKEN_11')
  })

  it('the hint names a FREE slot, not "count + 1"', () => {
    // Eleven are occupied, but the free slot IS the eleventh. The old formula
    // named the twelfth -- the one already loaded and running.
    expect(nextFreeBotSlot(envWithGapAtEleven())).toBe(11)
  })

  it('the hole does not end the scan: the twelfth bot still comes up', () => {
    expect(discoverBotTokens(envWithGapAtEleven())).toContain('token-12')
  })

  it('an empty environment invents no bots and offers the first slot', () => {
    expect(discoverBotTokenEntries({})).toEqual([])
    expect(nextFreeBotSlot({})).toBe(1)
  })
})

const REPO = path.join(__dirname, '..', '..', '..')
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8')

/** Code without comments: a guard must inspect the deed, not its description. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the token scan exists in exactly one copy', () => {
  /*
   * src/bot.ts is not what Railway starts, but it IS declared an entrypoint by
   * scripts/probe-reachability.cjs and probe-will-it-write.cjs. Its hand-written
   * list stopped at BOT_TOKEN_10, so both reachability tools were walking an
   * environment two bots short. Two lists drifting apart turns nothing red --
   * hence the ratchet.
   */
  it('both entrypoints take their tokens from the shared module', () => {
    for (const f of ['src/index.ts', 'src/bot.ts']) {
      expect(read(f), `${f} must use the shared scan`).toMatch(
        /utils\/discoverBotTokens/
      )
    }
  })

  it('no entrypoint keeps a list of BOT_TOKEN_N of its own', () => {
    for (const f of ['src/index.ts', 'src/bot.ts']) {
      const src = strip(read(f))
      // References to specific numbers: process.env.BOT_TOKEN_7 and the like.
      // The hole in production proved such a list eventually falls behind.
      const hardcoded = src.match(/process\.env\.BOT_TOKEN_\d+/g) || []
      expect(hardcoded, `${f} enumerates tokens by hand`).toEqual([])
    }
  })

  it('the token name in logs is not derived from an array position', () => {
    // The mutation this catches: putting the index back into getTokenName.
    // Over the hole, the invalid-token message would then send the owner to fix
    // a variable that does not exist.
    //
    // It reads the CODE, not the comments: the first cut of this check went red
    // on the explanation written next to the fix. A guard that catches the
    // story about a defect instead of the defect will just as easily stay
    // silent about one.
    expect(strip(read('src/index.ts'))).not.toMatch(
      /`BOT_TOKEN_\$\{index \+ 1\}`/
    )
  })
})
