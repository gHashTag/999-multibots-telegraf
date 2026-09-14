import { describe, expect, it } from 'vitest'
import { queenPage } from './hive'
import { PRIMARY_NAV_ITEMS } from './primaryNavigation'

describe('the hive tab is her page, whole', () => {
  it('points at the board on t27.ai, hash route included', () => {
    // A single-page site: `/queen` without the hash is a 404 on GitHub Pages.
    expect(queenPage('en')).toBe('https://t27.ai/?lang=en#/queen')
    expect(new URL(queenPage('en')).protocol).toBe('https:')
    expect(new URL(queenPage('en')).hash).toBe('#/queen')
  })

  it('opens her page in the player language, English for a code she does not read', () => {
    // Her page reads `?lang=` from location.search, before the hash.
    expect(queenPage('ru')).toBe('https://t27.ai/?lang=ru#/queen')
    expect(new URL(queenPage('ru')).searchParams.get('lang')).toBe('ru')
    expect(queenPage('fr')).toBe('https://t27.ai/?lang=en#/queen')
  })

  it('is a top-level tab, and any old sub-tab address still lights it up', () => {
    const hive = PRIMARY_NAV_ITEMS.find(x => x.id === 'hive')
    expect(hive, 'the hive tab is missing from the bar').toBeTruthy()
    expect(hive!.route).toBe('/hive')
    // Links to the former sub-tabs (`/hive/comb`, `/hive/tree`) may still be
    // out there in chats; they must land on the hive, not on a blank screen.
    expect(hive!.match.test('/hive')).toBe(true)
    expect(hive!.match.test('/hive/comb')).toBe(true)
  })
})
