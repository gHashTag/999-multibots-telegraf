import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/*
 * A CAPABILITY THAT IS OFF FOR EVERY ANSWER SHOULD NOT BE A CONSOLE LINE.
 *
 * SOUL.md sets the agent's tone. It is absent from the render image -- the
 * build context is apps/vibee-editor and Docker cannot COPY above its own
 * root, so the repository-root file never enters -- and the agent says so
 * once, to console.warn, on the first turn after a restart. Nobody reads that,
 * and meanwhile every answer is produced without the owner's voice.
 *
 * /health is the one place anything already looks, so it carries the fact.
 * Not an alarm: a boolean somebody can check when judging answer quality.
 */
const HERE = __dirname
const SERVER = fs.readFileSync(path.join(HERE, 'render-server.ts'), 'utf8')
const CHAT = fs.readFileSync(path.join(HERE, 'src', 'agent', 'chat.ts'), 'utf8')

describe('health says whether the owner voice is loaded', () => {
  it('the health payload carries the fact', () => {
    expect(SERVER).toMatch(/ownerVoiceLoaded:\s*Boolean\(soul\(\)\)/)
  })

  it('soul() is exported, so the answer comes from the loader itself', () => {
    // Not a re-implementation of the search: a second copy of the path list
    // would drift from the one the agent actually uses, and then health would
    // report on a file nobody reads.
    expect(CHAT).toMatch(/export function soul\(\)/)
  })

  it('the loader still tries SOUL_MD_PATH, which is the way in today', () => {
    // The escape hatch the code's own comment names. If it disappears, the
    // health flag can never become true without a Dockerfile change.
    expect(CHAT).toMatch(/process\.env\.SOUL_MD_PATH/)
  })

  it('and it is a fact, not an alarm: nothing throws when the file is absent', () => {
    // soul() returns null and caches it; the agent keeps answering. A health
    // endpoint that threw on a missing optional file would take the service
    // down over a tone setting.
    expect(CHAT).toMatch(/soulCache = null/)
    expect(CHAT).toMatch(/return null/)
  })
})
