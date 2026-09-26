import { describe, expect, it } from 'vitest'
import { boardHash, queenPage, queenPublicPage } from './hive'
import { PRIMARY_NAV_ITEMS } from './primaryNavigation'

describe('the hive tab is her page, whole', () => {
  it('points at the board built into THIS origin, hash route included', () => {
    // Owner, 2026-09-26: "embed the Queen's board into the app". The board is
    // served at /queen/ by this server; the frame holds that copy.
    expect(queenPage('en')).toBe('/queen/?lang=en#/queen')
    expect(queenPage('ru')).toBe('/queen/?lang=ru#/queen')
    expect(queenPage('fr')).toBe('/queen/?lang=en#/queen')
    // The way out when the frame is blank is the public site.
    expect(queenPublicPage('ru')).toBe('https://t27.ai/?lang=ru#/queen')
  })

  it('opens the view the app address asked for, and only her own views', () => {
    expect(queenPage('ru', '#/queen?tab=tri&screen=chat')).toBe(
      '/queen/?lang=ru#/queen?tab=tri&screen=chat'
    )
    expect(boardHash('#/queen/specs')).toBe('#/queen/specs')
    // Anything that is not her #/queen route opens her front page.
    expect(boardHash('')).toBe('#/queen')
    expect(boardHash('#/profile')).toBe('#/queen')
    expect(boardHash('#/queenx')).toBe('#/queen')
    expect(boardHash('#/queen?x="><script>')).toBe('#/queen')
  })

  it('is a top-level tab, and any old sub-tab address still lights it up', () => {
    const hive = PRIMARY_NAV_ITEMS.find(x => x.id === 'hive')
    expect(hive, 'the hive tab is missing from the bar').toBeTruthy()
    expect(hive!.route).toBe('/hive')
    // Links to the former sub-tabs (`/hive/comb`, `/hive/tree`) may still be
    // out there in chats; they must land on the hive, not on a blank screen.
    expect(hive!.match.test('/hive')).toBe(true)
    expect(hive!.match.test('/hive/comb')).toBe(true)
    // The board's own address in the app lights the same tab.
    expect(hive!.match.test('/queen')).toBe(true)
    expect(hive!.match.test('/queenly')).toBe(false)
  })
})
