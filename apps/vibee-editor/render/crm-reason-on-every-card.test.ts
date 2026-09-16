import { describe, it, expect, vi } from 'vitest'

/**
 * EVERY CARD SAYS WHY THIS PERSON -- NOT ONLY THE ONE WITH AN INVOICE.
 *
 * The offer card got the reason line first. Most cards are ordinary letters
 * from the sweep, and they went out carrying a recipient and a text and
 * nothing else -- so the owner still had to open the chat to decide, which is
 * the thing the whole line exists to remove.
 *
 * Driven through the REAL tg_send handler with the memory stubbed: the seam
 * being checked is that the tool ASKS for a reason and passes it on. A test
 * that called reasonFor itself would prove the reason and nothing about the
 * card.
 */
describe('tg_send asks for the reason and carries it', () => {
  it('a numeric target gets a reason on the card', async () => {
    vi.resetModules()
    vi.doMock('./src/agent/crm-reason', () => ({
      reasonFor: async (_c: unknown, lead: string) =>
        lead === '900000001' ? 'ответил, а мы молчим, 3 дн.' : '',
    }))
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')
    expect(tool, 'tg_send is gone from the registry').toBeTruthy()
    const out = (await tool!.handler({ chat: '900000001', text: 'привет' }, {
      telegramId: '144022504',
      surface: 'bot',
      pool: {},
    } as never)) as { because?: string }
    expect(
      out.because,
      'an ordinary letter still leaves without a reason'
    ).toBe('ответил, а мы молчим, 3 дн.')
    vi.doUnmock('./src/agent/crm-reason')
  })

  it('a @username target asks nothing and carries nothing', async () => {
    vi.resetModules()
    const asked: string[] = []
    vi.doMock('./src/agent/crm-reason', () => ({
      reasonFor: async (_c: unknown, lead: string) => {
        asked.push(lead)
        return 'не должно попасть на карточку'
      },
    }))
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')
    const out = (await tool!.handler({ chat: '@someone', text: 'привет' }, {
      telegramId: '144022504',
      surface: 'bot',
      pool: {},
    } as never)) as { because?: string }
    expect(asked, 'the memory was asked about a name it cannot know').toEqual(
      []
    )
    expect(out.because).toBeUndefined()
    vi.doUnmock('./src/agent/crm-reason')
  })

  it('a memory that throws costs a line, not the card', async () => {
    vi.resetModules()
    vi.doMock('./src/agent/crm-reason', () => ({
      reasonFor: async () => {
        throw new Error('память недоступна')
      },
    }))
    const { TELEGRAM_TOOLS } = await import('./src/agent/telegram-tools')
    const tool = TELEGRAM_TOOLS.find(t => t.name === 'tg_send')
    const out = (await tool!.handler({ chat: '900000001', text: 'привет' }, {
      telegramId: '144022504',
      surface: 'bot',
      pool: {},
    } as never)) as { because?: string; proposal?: boolean; target?: string }
    expect(out.because).toBeUndefined()
    expect(out.target, 'the card itself was lost with the reason').toBe(
      '900000001'
    )
    vi.doUnmock('./src/agent/crm-reason')
  })
})
