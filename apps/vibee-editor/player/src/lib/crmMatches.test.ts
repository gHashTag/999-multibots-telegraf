import { describe, expect, it } from 'vitest'
import {
  foundOnlyById,
  matches,
  searchNeedle,
  splitByNeedle,
  type ClientRow,
} from './crm'

/**
 * The contact search reads a username the way Telegram prints it.
 *
 * Found live at 390px (CRM mobile loop, tick 2): "lapin" found Igor, and
 * "@lapin" -- the form the row itself displays -- found nobody. The server
 * strips the @ (render clientQuery) and returned him; this filter then hid
 * him again on the phone.
 */

const igor: ClientRow = {
  telegramId: '700100',
  name: 'Igor Lapin',
  username: 'lapin_igor',
  client: null,
  hasProfile: false,
  hasSoul: false,
  skills: 0,
  stage: 'lead',
  paid: false,
  lastSeen: null,
  duets: 0,
  avatarUrl: null,
}

describe('matches', () => {
  it.each(['lapin', '@lapin', '@LAPIN_igor', '  @lapin '])(
    'finds a username typed as %j',
    q => expect(matches(igor, q)).toBe(true)
  )

  it('still finds by name and id, and rejects a stranger', () => {
    expect(matches(igor, 'igor')).toBe(true)
    expect(matches(igor, '7001')).toBe(true)
    expect(matches(igor, '@nobody')).toBe(false)
  })

  it('a bare @ is not a search yet', () => {
    expect(matches(igor, '@')).toBe(true)
  })
})

describe('searchNeedle', () => {
  it('drops one leading @ and the case, keeps the rest', () => {
    expect(searchNeedle('  @Buyers_Club ')).toBe('buyers_club')
    expect(searchNeedle('a@b')).toBe('a@b')
  })
})

/**
 * A result shows why it is a result (CRM mobile loop, tick 11): the typed
 * letters are marked, and a row found only by its id names the id.
 */
describe('splitByNeedle', () => {
  it('marks the first place the search found, in the text as written', () => {
    expect(splitByNeedle('Igor Lapin', 'LAP')).toEqual([
      { text: 'Igor ', hit: false },
      { text: 'Lap', hit: true },
      { text: 'in', hit: false },
    ])
  })

  it('reads a leading @ the way the search does', () => {
    expect(splitByNeedle('lapin_igor', '@lapin')).toEqual([
      { text: 'lapin', hit: true },
      { text: '_igor', hit: false },
    ])
  })

  it('no search, or no hit, is the text whole', () => {
    expect(splitByNeedle('Igor', '')).toEqual([{ text: 'Igor', hit: false }])
    expect(splitByNeedle('Igor', 'zz')).toEqual([{ text: 'Igor', hit: false }])
  })

  it('marks nothing where lowercasing moved the letters', () => {
    // 'İ'.toLowerCase() is two characters: an index would be off by one.
    expect(splitByNeedle('İstanbul Lapin', 'lap')).toEqual([
      { text: 'İstanbul Lapin', hit: false },
    ])
  })

  it('cuts a long lead to keepBefore letters after an ellipsis', () => {
    expect(splitByNeedle('Floristics and decor studio', 'studio', 4)).toEqual([
      { text: '…cor ', hit: false },
      { text: 'studio', hit: true },
    ])
    // A lead only one letter longer is kept: the "…" would save nothing.
    expect(splitByNeedle('decor studio', 'studio', 5)[0].text).toBe('decor ')
    expect(splitByNeedle('decor studio', 'studio')[0].text).toBe('decor ')
  })
})

describe('foundOnlyById', () => {
  it('is true only when nothing shown on the row holds the letters', () => {
    expect(foundOnlyById(igor, '7001')).toBe(true)
    expect(foundOnlyById({ ...igor, name: 'Igor 7001' }, '7001')).toBe(false)
    expect(foundOnlyById({ ...igor, client: 'pack7001' }, '7001')).toBe(false)
    expect(foundOnlyById(igor, 'lapin')).toBe(false)
    expect(foundOnlyById(igor, '')).toBe(false)
  })
})
