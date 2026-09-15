import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { keepDraft, draftText } from '@/helpers/streamDraft'

/**
 * THE OWNER WATCHES THE ANSWER BEING WRITTEN.
 *
 * A turn runs up to three minutes and used to show a typing indicator for all
 * of it. sendMessageDraft (Bot API 9.3, opened to all bots in 9.5) streams the
 * partial text instead. What has to be right: the preview must not flood
 * Telegram, must not show half-written button markers, must keep itself alive
 * through a long silent tool call, and must never cost the owner the only
 * sign of life if the draft turns out to be impossible.
 */

function fakeCtx(fail = false) {
  const calls: Array<Record<string, unknown>> = []
  const typing: number[] = []
  return {
    calls,
    typing,
    chat: { id: 144022504, type: 'private' },
    telegram: {
      callApi: vi.fn(
        async (method: string, payload: Record<string, unknown>) => {
          if (fail) throw new Error('unknown method')
          calls.push({ method, ...payload })
          return true
        }
      ),
    },
    sendChatAction: vi.fn(async () => {
      typing.push(1)
      return true
    }),
  }
}

describe('what the preview shows', () => {
  it('drops a finished button marker, the way the real answer does', () => {
    expect(draftText('Готово! [[Оплатить|act:pay]]')).toBe('Готово!')
  })

  it('cuts a marker still being typed instead of flashing brackets', () => {
    // The stream arrives token by token, so half a marker is the normal
    // intermediate state, not an edge case.
    expect(draftText('Готово! [[Опла')).toBe('Готово!')
    expect(draftText('Готово! [[')).toBe('Готово!')
  })

  it('keeps the tail once past the limit, so it reads as progress', () => {
    const long = 'я' + 'а'.repeat(5000) + 'конец'
    const out = draftText(long)
    expect(out.length).toBe(4096)
    expect(out.endsWith('конец')).toBe(true)
  })

  it('survives nothing at all', () => {
    expect(draftText('')).toBe('')
    expect(draftText(undefined as never)).toBe('')
  })
})

describe('the draft while the agent works', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens with an empty draft, which Telegram renders as Thinking', async () => {
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(ctx.calls[0].method).toBe('sendMessageDraft')
    expect(ctx.calls[0].text).toBe('')
    expect(ctx.calls[0].chat_id).toBe(144022504)
    d.stop()
  })

  it('carries a non-zero draft id, and the same one all turn', async () => {
    // The reference: the id must be non-zero, and changes to drafts with the
    // same id are animated rather than replaced.
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    d.show('раз')
    await vi.advanceTimersByTimeAsync(1000)
    const ids = ctx.calls.map(c => c.draft_id)
    expect(ids[0]).not.toBe(0)
    expect(new Set(ids).size).toBe(1)
    d.stop()
  })

  it('sends once a second, not once a token', async () => {
    // One call per delta would meet a flood limit, and the allowed rate is
    // documented nowhere -- so the throttle is the contract.
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 200; i++) d.show('т'.repeat(i + 1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(ctx.calls).toHaveLength(2)
    expect(ctx.calls[1].text).toBe('т'.repeat(200))
    d.stop()
  })

  it('says nothing again while nothing changed', async () => {
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    d.show('одно и то же')
    await vi.advanceTimersByTimeAsync(1000)
    const after = ctx.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(ctx.calls.length).toBe(after)
    d.stop()
  })

  it('refreshes an unchanged draft before it expires on its own', async () => {
    // Telegram drops the preview after about thirty seconds, and the agent
    // can be inside one tool call for longer than that saying nothing.
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    d.show('думаю')
    await vi.advanceTimersByTimeAsync(1000)
    const after = ctx.calls.length
    await vi.advanceTimersByTimeAsync(11_000)
    expect(ctx.calls.length).toBeGreaterThan(after)
    d.stop()
  })

  it('stops calling once the turn is over', async () => {
    const ctx = fakeCtx()
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    d.stop()
    d.show('поздно')
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.calls).toHaveLength(1)
  })
})

describe('when the draft is impossible', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('falls back to the typing indicator instead of showing nothing', async () => {
    const ctx = fakeCtx(true)
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(ctx.typing.length).toBeGreaterThan(0)
    d.stop()
  })

  it('does not keep retrying a method the server does not know', async () => {
    const ctx = fakeCtx(true)
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    const tried = ctx.telegram.callApi.mock.calls.length
    d.show('дальше')
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.telegram.callApi.mock.calls.length).toBe(tried)
    d.stop()
  })

  it('falls back when there is no chat to draft into', async () => {
    const ctx = { ...fakeCtx(), chat: undefined }
    const d = keepDraft(ctx as never)
    await vi.advanceTimersByTimeAsync(0)
    expect(ctx.typing.length).toBeGreaterThan(0)
    expect(ctx.calls).toHaveLength(0)
    d.stop()
  })
})

describe('the client in a business DM is NOT streamed to', () => {
  it('businessBotService asks the agent without onProgress', () => {
    /*
     * THE LIMIT IS THE POINT, NOT AN OVERSIGHT.
     *
     * Raw deltas still carry button markers, and the business path strips
     * them from the WHOLE text afterwards (businessBotService) while
     * payButton scans the finished answer for the invoice link. A streamed
     * preview there would show a client bracket soup in the owner's name --
     * and the owner sells that seller as a product.
     *
     * Checked at the call site, because the draft is only ever as absent as
     * the argument that feeds it.
     */
    const src = readFileSync(
      join(process.cwd(), 'src/services/businessBotService.ts'),
      'utf8'
    )
    expect(src).toContain('спроситьАгента')
    expect(src).not.toContain('onProgress')
    expect(src).not.toContain('keepDraft')
  })
})
