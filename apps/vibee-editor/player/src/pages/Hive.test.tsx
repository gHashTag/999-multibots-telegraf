import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const language = vi.hoisted(() => ({ lang: 'en' }))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: language.lang, t: (key: string) => key }),
}))

/**
 * THE HIVE PAGE OPENS THE GAME IN THE PLAYER LANGUAGE.
 *
 * `queenPage` is tested on its own in lib/hive.test.ts; this asserts the page
 * actually hands it the player's language. A page that hard-coded 'en' would
 * pass every other test while a Russian player saw an English game.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import HivePage from './Hive'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the hive page', () => {
  it.each(['ru', 'en'])('frames and links the game in %s', lang => {
    language.lang = lang
    act(() => root.render(<HivePage />))

    const expected = `https://t27.ai/?lang=${lang}#/queen`
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      expected
    )
    expect(container.querySelector('a.hive-out')?.getAttribute('href')).toBe(
      expected
    )
  })
})
