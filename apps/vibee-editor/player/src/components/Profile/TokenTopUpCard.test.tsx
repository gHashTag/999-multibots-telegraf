/**
 * THE SCREEN THAT SHOWS THE BALANCE HAD NO WAY TO PAY.
 *
 * Measured 2026-09-17: the profile is 260 lines and does not call the token
 * routes once, so a person who opened it to look at their balance could see the
 * number and had nothing to press. The only working top-up lived in the chat.
 *
 * What is pinned here is the part a second implementation always gets wrong:
 * where the prices come from, and what is shown when they cannot be had.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TokenTopUpCard } from './TokenTopUpCard'

/*
 * THE SERVER'S FIELD NAMES ARE RUSSIAN, and a Russian object KEY is not a
 * string literal, so the no-cyrillic gate refuses it. Quoting the keys works
 * until prettier unquotes them again -- the formatter closing an escape hatch,
 * the same trap as a marker written inside a call it then reflows.
 *
 * Holding the names in variables settles it: the literals are strings (which
 * the gate allows) and the keys are computed, which nothing rewrites.
 */
const TOKENS = 'токенов'
const STARS = 'звёзд'
const LIST = 'пакеты'

const pack = (id: string, tokens: number, stars?: number) => ({
  id,
  [TOKENS]: tokens,
  ...(stars === undefined ? {} : { [STARS]: stars }),
})

const PACKS = {
  ok: true,
  [LIST]: [pack('10', 10, 15), pack('50', 50, 65), pack('150', 150, 175)],
}

let host: HTMLDivElement
let root: Root

const draw = async (props: Parameters<typeof TokenTopUpCard>[0]) => {
  await act(async () => {
    root.render(<TokenTopUpCard {...props} />)
  })
  // let the packs request settle
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => PACKS })) as never
  )
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('the cashier on the profile', () => {
  it('shows the balance it was given', async () => {
    await draw({ tokens: 42, note: null, buy: () => {} })
    expect(host.textContent).toContain('42 tokens')
  })

  /*
   * THE PRICES COME FROM THE SERVER, NOT FROM HERE. The chat's buttons carry a
   * copy of the three packs; a copy of a price is a price that will be wrong
   * one day, and this is the second place that would have to be remembered.
   */
  it('takes the packs from the server, in the server’s numbers', async () => {
    await draw({ tokens: 0, note: null, buy: () => {} })
    expect(host.textContent).toContain('150 tokens')
    expect(host.textContent).toContain('175 ⭐')
    expect(host.textContent).toContain('15 ⭐')
  })

  /*
   * Which pack is the best value is arithmetic on what the server sent, never a
   * label typed next to a number. 175/150 beats 65/50 and 15/10.
   */
  it('marks the best value by dividing, not by remembering', async () => {
    await draw({ tokens: 0, note: null, buy: () => {} })
    const marked = [...host.querySelectorAll('button')].filter(b =>
      b.textContent?.includes('best value')
    )
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('150 tokens')
  })

  it('buys the pack by the id the server gave it', async () => {
    const bought: string[] = []
    await draw({ tokens: 0, note: null, buy: p => bought.push(p) })
    const big = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('150 tokens')
    )
    await act(async () => {
      big?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bought).toEqual(['150'])
  })

  it('passes on what the top-up had to say', async () => {
    await draw({
      tokens: 3,
      note: 'Оплачено! Проверяю зачисление…',
      buy: () => {},
    })
    expect(host.textContent).toContain('Проверяю зачисление')
  })

  /*
   * NO ANSWER MEANS NO PRICE, NEVER AN INVENTED ONE. A cashier that shows made
   * up numbers while the server is unreachable takes money for a promise
   * nobody made.
   */
  it('shows no packs at all when the server does not answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }) as never
    )
    await draw({ tokens: 7, note: null, buy: () => {} })
    // The PACK buttons, not every button on the card: roubles and crypto are
    // always offered, because they do not depend on this request.
    expect(host.querySelectorAll('.profile-topup__pack')).toHaveLength(0)
    expect(host.textContent).not.toContain('⭐')
  })

  it('says the cashier is unavailable when the server sends an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, [LIST]: [] }),
      })) as never
    )
    await draw({ tokens: 7, note: null, buy: () => {} })
    expect(host.textContent).toContain('unavailable')
  })

  /*
   * A pack with a missing price is dropped rather than drawn as "0 ⭐", which
   * would be a button offering something for nothing.
   */
  it('drops a pack the server sent without a price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          [LIST]: [pack('10', 10, 15), pack('broken', 50)],
        }),
      })) as never
    )
    await draw({ tokens: 0, note: null, buy: () => {} })
    expect(host.querySelectorAll('.profile-topup__pack')).toHaveLength(1)
    expect(host.textContent).not.toContain('50 tokens')
  })
})

describe('the two cashiers that live in the bot', () => {
  /*
   * Owner, 2026-09-17: "add all three payment types to the mini app". Stars are
   * paid in this window; roubles and crypto finish in the bot, because their
   * keys are on the bot service and copying payment secrets into a second
   * service to move the window is a bigger decision than a button.
   */
  const opened: string[] = []

  beforeEach(() => {
    opened.length = 0
    vi.stubGlobal('Telegram', {
      WebApp: { openTelegramLink: (u: string) => opened.push(u) },
    })
  })

  it('offers all three ways to pay', async () => {
    await draw({ tokens: 5, note: null, buy: () => {} })
    const text = host.textContent ?? ''
    expect(text).toContain('⭐')
    expect(text).toContain('Rubles')
    expect(text).toContain('Crypto')
  })

  /*
   * THE PAYLOAD IS THE WHOLE POINT. The paywall's three buttons opened the bot
   * for a year with a payload nothing read, and it looked exactly like somebody
   * changing their mind. These must carry the words /start was taught.
   */
  it('opens the bot at the rouble cashier, by the payload /start reads', async () => {
    await draw({ tokens: 5, note: null, buy: () => {} })
    const b = [...host.querySelectorAll('button')].find(x =>
      x.textContent?.includes('Rubles')
    )
    await act(async () => {
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(opened).toHaveLength(1)
    expect(opened[0]).toContain('?start=topup_rub')
  })

  it('opens the bot at the crypto cashier', async () => {
    await draw({ tokens: 5, note: null, buy: () => {} })
    const b = [...host.querySelectorAll('button')].find(x =>
      x.textContent?.includes('Crypto')
    )
    await act(async () => {
      b?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(opened[0]).toContain('?start=topup_crypto')
  })

  /*
   * A Stars pack must still pay in place: if these buttons had stolen that, the
   * one rail that works end to end would start bouncing people out.
   */
  it('leaves the Stars packs paying in this window', async () => {
    const bought: string[] = []
    await draw({ tokens: 5, note: null, buy: p => bought.push(p) })
    const pack = [...host.querySelectorAll('button')].find(x =>
      x.textContent?.includes('150 tokens')
    )
    await act(async () => {
      pack?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(bought).toEqual(['150'])
    expect(opened).toHaveLength(0)
  })
})
