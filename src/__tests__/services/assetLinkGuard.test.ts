/**
 * THE DEAD LINK OF 20.09.2026 MUST NOT REACH A CLIENT AGAIN.
 *
 * The address in these tests is the real one a client was sent; it is a splice
 * of two real uploads from the same evening and the bucket answers NoSuchKey.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  assetUrlsIn,
  guardAssetLinks,
  linkIsDead,
  ASSET_ORIGINS,
  MAX_LINKS_CHECKED,
} from '@/services/assetLinkGuard'

const BASE = ASSET_ORIGINS[0]
const SPLICED = `${BASE}/assets/1789924443235674-agent-edit-1789924443235613.png`
const REAL = `${BASE}/assets/1789924235674-agent-edit-1789924235613.png`

/** Answers per URL, so a test says exactly what the store replied. */
function store(byUrl: Record<string, number | 'network'>) {
  return vi.fn(async (url: string) => {
    const answer = byUrl[url]
    if (answer === 'network') throw new Error('ECONNRESET')
    return { status: answer ?? 200 } as Response
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', store({}))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('which addresses are ours to check', () => {
  it('finds our own asset links and ignores everybody else', () => {
    const found = assetUrlsIn(
      `Готово: ${SPLICED}\nа вот статья https://habr.com/ru/post/1 и t.me/x`
    )
    expect(found).toEqual([SPLICED])
  })

  it('a trailing full stop is punctuation, not part of the address', () => {
    expect(assetUrlsIn(`Вот файл: ${REAL}.`)).toEqual([REAL])
  })

  it('the same address twice is one check', () => {
    expect(assetUrlsIn(`${REAL} и ещё раз ${REAL}`)).toHaveLength(1)
  })
})

describe('a reply carrying a link to nothing', () => {
  it('the dead address is removed and the person is told', async () => {
    vi.stubGlobal('fetch', store({ [SPLICED]: 404 }))
    const out = await guardAssetLinks(
      `Держи картинку: ${SPLICED}`,
      '2086031075'
    )
    expect(out).not.toContain(SPLICED)
    expect(out).toContain('Ссылку на файл убрал')
    expect(out).toContain('Держи картинку')
  })

  it('a markdown link loses the address, keeps the words', async () => {
    vi.stubGlobal('fetch', store({ [SPLICED]: 404 }))
    const out = await guardAssetLinks(`Вот [твоя картинка](${SPLICED}) — держи`)
    expect(out).not.toContain(SPLICED)
    expect(out).toContain('твоя картинка')
  })

  it('a live file is left exactly as it was', async () => {
    vi.stubGlobal('fetch', store({ [REAL]: 200 }))
    const text = `Готово: ${REAL}`
    expect(await guardAssetLinks(text)).toBe(text)
  })

  it('one dead link among live ones takes only itself', async () => {
    vi.stubGlobal('fetch', store({ [SPLICED]: 404, [REAL]: 200 }))
    const out = await guardAssetLinks(`Первая ${REAL}, вторая ${SPLICED}`)
    expect(out).toContain(REAL)
    expect(out).not.toContain(SPLICED)
  })
})

describe('not knowing never costs a working file', () => {
  it('a network failure leaves the link alone', async () => {
    vi.stubGlobal('fetch', store({ [REAL]: 'network' }))
    const text = `Готово: ${REAL}`
    expect(await guardAssetLinks(text)).toBe(text)
    await expect(linkIsDead(REAL)).resolves.toBe(false)
  })

  it('a 500 from the store is not an answer about the object', async () => {
    vi.stubGlobal('fetch', store({ [REAL]: 500 }))
    await expect(linkIsDead(REAL)).resolves.toBe(false)
  })

  it('a reply with no links of ours costs no request at all', async () => {
    const fetchSpy = store({})
    vi.stubGlobal('fetch', fetchSpy)
    const text = 'План на месяц готов. Стоит 2 токена — делаю?'
    expect(await guardAssetLinks(text)).toBe(text)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a wall of addresses is bounded, not unbounded work', async () => {
    const fetchSpy = store({})
    vi.stubGlobal('fetch', fetchSpy)
    const many = Array.from(
      { length: MAX_LINKS_CHECKED + 5 },
      (_, i) => `${BASE}/assets/${i}-x.png`
    ).join(' ')
    await guardAssetLinks(many)
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_LINKS_CHECKED)
  })
})
