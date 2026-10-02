import { describe, expect, it } from 'vitest'
import {
  boardHash,
  frameHashFor,
  gamePathFor,
  queenPage,
  queenPublicPage,
} from './hive'
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
    // Owner, 2026-10-01: "rename the main page to app.t27.ai/game".
    expect(hive!.route).toBe('/game')
    expect(hive!.match.test('/game')).toBe(true)
    expect(hive!.match.test('/game/specs')).toBe(true)
    // The kanban is the Tasks tab's, and only one tab may be lit at a time.
    expect(hive!.match.test('/game/kanban')).toBe(false)
    expect(hive!.match.test('/gamer')).toBe(false)
    // Links to the former sub-tabs (`/hive/comb`, `/hive/tree`) may still be
    // out there in chats; they must land on the hive, not on a blank screen.
    expect(hive!.match.test('/hive')).toBe(true)
    expect(hive!.match.test('/hive/comb')).toBe(true)
    // The board's own address in the app lights the same tab.
    expect(hive!.match.test('/queen')).toBe(true)
    expect(hive!.match.test('/queenly')).toBe(false)
  })

  it('the kanban is a tab of its own, and one address lights one tab', () => {
    // Owner, 2026-10-01: "make a tab with the tasks" -- app.t27.ai/game/kanban.
    const tasks = PRIMARY_NAV_ITEMS.find(x => x.id === 'tasks')
    expect(tasks, 'the tasks tab is missing from the bar').toBeTruthy()
    expect(tasks!.route).toBe('/game/kanban')
    // The route is the board's own kanban view, not a second kanban.
    expect(frameHashFor(tasks!.route, '')).toBe('#/queen?tab=kanban')
    expect(tasks!.match.test('/game/kanban')).toBe(true)
    expect(tasks!.match.test('/game/kanbanx')).toBe(false)
    expect(tasks!.match.test('/game')).toBe(false)
    // The bar lights the first match; two matches would light the wrong one.
    for (const path of [
      '/game',
      '/game/kanban',
      '/game/specs',
      '/hive',
      '/queen',
    ]) {
      const lit = PRIMARY_NAV_ITEMS.filter(x => x.match.test(path))
      expect(
        lit.map(x => x.id),
        path
      ).toHaveLength(1)
    }
  })
})

/**
 * EVERY VIEW OF THE BOARD HAS ITS OWN ADDRESS (owner, 2026-10-01).
 *
 * The board names its view in the frame's hash; the app names it in the path.
 * The page converts with these two and nothing else, so a round trip that
 * lost a key would lose a link.
 */
describe('the game address and the frame hash are one mapping', () => {
  it('names the view in the path and keeps her other keys as the query', () => {
    expect(gamePathFor('#/queen')).toBe('/game')
    expect(gamePathFor('#/queen?tab=kanban')).toBe('/game/kanban')
    expect(gamePathFor('#/queen?tab=tri&screen=chat')).toBe(
      '/game/tri?screen=chat'
    )
    expect(gamePathFor('#/queen?screen=chat&tab=tri')).toBe(
      '/game/tri?screen=chat'
    )
  })

  it('refuses what is not her board, or not a view name', () => {
    expect(gamePathFor('')).toBeNull()
    expect(gamePathFor('#/profile')).toBeNull()
    expect(gamePathFor('#/queenx')).toBeNull()
    expect(gamePathFor('#/queen?tab=Kanban')).toBeNull()
    expect(gamePathFor('#/queen?tab=../x')).toBeNull()
    expect(gamePathFor('#/queen?x="><script>')).toBeNull()
  })

  it('goes back the other way, and only for /game paths', () => {
    expect(frameHashFor('/game', '')).toBe('#/queen')
    expect(frameHashFor('/game/', '')).toBe('#/queen')
    expect(frameHashFor('/game/kanban', '')).toBe('#/queen?tab=kanban')
    expect(frameHashFor('/game/tri', '?screen=chat')).toBe(
      '#/queen?tab=tri&screen=chat'
    )
    // The path names the view; a tab= in the query cannot overrule it.
    expect(frameHashFor('/game/specs', '?tab=wars')).toBe('#/queen?tab=specs')
    expect(frameHashFor('/game/Kanban', '')).toBe('#/queen')
    expect(frameHashFor('/game/a/b', '')).toBe('#/queen')
  })

  it('a round trip changes nothing', () => {
    for (const hash of [
      '#/queen',
      '#/queen?tab=wars',
      '#/queen?tab=skills&skill=t27%2Ftri',
      '#/queen?tab=tri&screen=profile&path=%2Fanna',
    ]) {
      const path = gamePathFor(hash)!
      const [p, q = ''] = path.split('?')
      expect(frameHashFor(p, q ? `?${q}` : '')).toBe(hash)
    }
  })
})
