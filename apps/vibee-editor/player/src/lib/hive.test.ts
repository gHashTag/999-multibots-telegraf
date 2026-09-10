import { describe, expect, it } from 'vitest'
import { QUEEN_PAGE } from './hive'
import { PRIMARY_NAV_ITEMS } from './primaryNavigation'

describe('the hive tab is her page, whole', () => {
  it('points at the board on t27.ai, hash route included', () => {
    // A single-page site: `/queen` without the hash is a 404 on GitHub Pages.
    expect(QUEEN_PAGE).toBe('https://t27.ai/#/queen')
    expect(new URL(QUEEN_PAGE).protocol).toBe('https:')
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
