import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { noteForPress, notePressToHive } from '@/services/hiveNote'
import { NOTABLE_KINDS } from '../../../apps/vibee-editor/render/src/hive/note-route'

/*
 * THE PRESS ITSELF, WHICH NOTHING RECORDED.
 *
 * A sweep writes three outcomes into the hive journal. The act those outcomes
 * exist for -- the owner pressing a button -- wrote nothing at all: the
 * `written` touch needs a lead on the draft, a successful press has no log
 * line, and the journal had no kind for it.
 *
 * So "how often does the owner press", which is what this design's whole
 * throughput reduces to, could not be answered from production. An
 * investigation on 2026-09-16 listed it as the one thing it could not
 * establish, and it was right: there was nothing to read.
 */
const OWNER = '144022504'

describe('what a press says', () => {
  it('names the owner and which button, as one kind', () => {
    const sent = noteForPress(OWNER, 'sent')
    expect(sent.kind).toBe('card-pressed')
    expect(sent.who).toBe(OWNER)
    expect(sent.severity, 'a press is the product working, not a problem').toBe(
      'normal'
    )
    const no = noteForPress(OWNER, 'cancelled')
    expect(no.kind).toBe('card-pressed')
    expect(
      no.what,
      'the two buttons must be distinguishable in the journal'
    ).not.toBe(sent.what)
  })

  it('the render will actually accept this kind', () => {
    /*
     * The allowlist on the other side is the thing that decides. Without this
     * the bot would post happily, the route would answer 400, and the journal
     * would stay exactly as empty as before -- with a writer, a test and a
     * deploy to prove it works.
     */
    expect(NOTABLE_KINDS.has('card-pressed')).toBe(true)
  })
})

describe('a journal that is down must not eat a press', () => {
  const OLD = process.env.RENDER_API_KEY
  beforeEach(() => {
    process.env.RENDER_API_KEY = 'k'
  })
  afterEach(() => {
    if (OLD === undefined) delete process.env.RENDER_API_KEY
    else process.env.RENDER_API_KEY = OLD
  })

  it('a refusal is reported, never thrown', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as never
    await expect(notePressToHive(OWNER, 'sent', { fetchImpl })).resolves.toBe(
      'not noted'
    )
  })

  it('a throw is caught, never raised', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection terminated')
    }) as never
    await expect(
      notePressToHive(OWNER, 'cancelled', { fetchImpl })
    ).resolves.toBe('not noted')
  })

  it('with no server key nothing is sent at all', async () => {
    delete process.env.RENDER_API_KEY
    const fetchImpl = vi.fn() as never
    await expect(notePressToHive(OWNER, 'sent', { fetchImpl })).resolves.toBe(
      'not noted'
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a good answer is noted, and carries the kind and the owner', async () => {
    let body: any = null
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      body = JSON.parse(String(init.body))
      return { ok: true, status: 200 }
    }) as never
    await expect(notePressToHive(OWNER, 'sent', { fetchImpl })).resolves.toBe(
      'noted'
    )
    expect(body.kind).toBe('card-pressed')
    expect(body.who).toBe(OWNER)
  })
})

describe('both buttons are wired, not just the one that sends', () => {
  it('the source calls the writer under tgp:ok AND tgp:no', async () => {
    /*
     * A source read, deliberately. The handlers reach Telegram and the whole
     * proposal store; the promise worth guarding here is narrow and would
     * survive no mock: BOTH presses write, and they write different things.
     * Counting only the sends would make a careful owner look like an idle
     * one.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    const ok = src.indexOf('tgp:ok:([^:]+)')
    const no = src.indexOf('tgp:no:([^:]+)')
    expect(ok).toBeGreaterThan(-1)
    expect(no).toBeGreaterThan(-1)
    expect(src.slice(ok, no), 'the send press writes nothing').toMatch(
      // [\s\S] rather than [^)]: the argument is String(ctx.from?.id ?? ''),
      // which carries its own parentheses.
      /notePressToHive\([\s\S]*?'sent'\s*\)/
    )
    expect(src.slice(no), 'the cancel press writes nothing').toMatch(
      /notePressToHive\([\s\S]*?'cancelled'\s*\)/
    )
  })
})
