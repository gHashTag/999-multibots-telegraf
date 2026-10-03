import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE ENTER KEY, PRESSED -- NOT READ.
 *
 * The bee on #3490: the source-text check passed with `isComposing` removed,
 * because the word is also in the comment above it. Here the real component
 * gets the real keydowns, and the only thing asked is whether a rule was
 * saved.
 */
const putSiteRule = vi.fn(async () => undefined)
vi.mock('@/lib/remoteBrowser', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/remoteBrowser')>()),
  putSiteRule: (...a: unknown[]) => putSiteRule(...(a as [])),
  readSiteListState: async () => ({ rows: [] }),
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))

const { SiteRules } = await import('./SiteRules')

;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  putSiteRule.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root.render(<SiteRules />)
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function typeSite(text: string) {
  const input = host.querySelector('input')!
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  await act(async () => {
    set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}

async function enter(
  input: HTMLInputElement,
  how: { isComposing?: boolean; keyCode?: number } = {}
) {
  const e = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    isComposing: how.isComposing ?? false,
  })
  if (how.keyCode !== undefined)
    Object.defineProperty(e, 'keyCode', { value: how.keyCode })
  await act(async () => {
    input.dispatchEvent(e)
  })
}

describe('the Enter key in the site field', () => {
  it('a plain Enter saves the site as "ask"', async () => {
    await enter(await typeSite('clinic.example'))
    expect(putSiteRule).toHaveBeenCalledWith('clinic.example', 'ask')
  })

  it('the Enter that ends an input-method word saves nothing (isComposing)', async () => {
    await enter(await typeSite('clinic.exa'), { isComposing: true })
    expect(putSiteRule).not.toHaveBeenCalled()
  })

  it("nor does Safari's, which only says keyCode 229", async () => {
    await enter(await typeSite('clinic.exa'), { keyCode: 229 })
    expect(putSiteRule).not.toHaveBeenCalled()
  })

  it('an empty field saves nothing', async () => {
    await enter(await typeSite('   '))
    expect(putSiteRule).not.toHaveBeenCalled()
  })
})
