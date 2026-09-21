/**
 * THE AGENT IS SHOWN THE PERSON'S FILES, SO IT NEED NOT RECALL AN ADDRESS.
 *
 * The defect this guards: on 20.09.2026 a client was sent a URL the model had
 * composed out of two real ones. Nothing had put her actual files in front of
 * it, so recollection was the only source it had.
 */
import { describe, it, expect, vi } from 'vitest'
import { filesBlock, FILES_IN_CONTEXT } from './chat'

const CLIENT = '900000011'
const URL_ONE =
  'https://bucket-production-8259.up.railway.app/vibee-assets/assets/1789924235674-agent-edit-1789924235613.png'

/** A pool that answers with rows, or refuses outright. */
function pool(rows: Array<Record<string, string>> | Error) {
  return {
    query: vi.fn(async () => {
      if (rows instanceof Error) throw rows
      return { rows }
    }),
  }
}
const ctxWith = (p: unknown) => ({ pool: p, telegramId: CLIENT }) as never

describe('the files block', () => {
  it('names the files with the addresses they actually have', async () => {
    const out = await filesBlock(
      ctxWith(
        pool([
          {
            type: 'generated_image',
            public_url: URL_ONE,
            trigger_word: 'lena',
            day: '2026-09-20',
          },
        ])
      ),
      CLIENT
    )
    expect(out).toContain(URL_ONE)
    expect(out).toContain('2026-09-20')
    expect(out).toContain('lena')
  })

  it('says, in as many words, that a link is copied and never composed', async () => {
    const out = await filesBlock(
      ctxWith(
        pool([{ type: 'video', public_url: URL_ONE, day: '2026-09-20' }])
      ),
      CLIENT
    )
    expect(out).toContain('ДОСЛОВНО')
    expect(out).toContain('my_assets')
  })

  it('a row with no public_url is named as having no link, not given one', async () => {
    const out = await filesBlock(
      ctxWith(
        pool([{ type: 'generated_image', public_url: '', day: '2026-09-19' }])
      ),
      CLIENT
    )
    expect(out).toContain('без ссылки')
    expect(out).not.toContain('http')
  })

  it('asks for no more than it will show', async () => {
    const p = pool([])
    await filesBlock(ctxWith(p), CLIENT)
    expect(p.query).toHaveBeenCalledWith(expect.any(String), [
      CLIENT,
      FILES_IN_CONTEXT,
    ])
  })

  it('nothing to show is an empty block, not an empty heading', async () => {
    expect(await filesBlock(ctxWith(pool([])), CLIENT)).toBe('')
  })

  it('a malformed id is not a query', async () => {
    const p = pool([])
    expect(await filesBlock(ctxWith(p), 'не-число')).toBe('')
    expect(p.query).not.toHaveBeenCalled()
  })

  it('an unreachable table costs the block, never the answer', async () => {
    const out = await filesBlock(
      ctxWith(pool(new Error('relation "assets" does not exist'))),
      CLIENT
    )
    expect(out).toBe('')
  })
})
