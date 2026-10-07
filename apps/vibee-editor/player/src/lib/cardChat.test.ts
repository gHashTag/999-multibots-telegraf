import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as SPEC from '@/spec/kanban-card-chat.gen'
import {
  CARD_SHEET,
  cardFromAnchor,
  cardFromHistory,
  cardFromHref,
  cardFromMessage,
  cardFromSearch,
  keepCard,
  searchWithCard,
  withoutCard,
} from './cardChat'

/**
 * A CARD ON THE KANBAN OPENS ITS CONVERSATION (spec kanban-card-chat.t27).
 *
 * The player's build stage cannot reach render/, so the generated module is
 * vendored twice. The copy is held byte-equal here; the test stage of the
 * Dockerfile copies render/ for exactly this kind of read.
 */
const root = join(__dirname, '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8')

const ENVELOPE = { v: 1, type: 't27-app', kind: 'open-card' }

describe('the generated module is the render copy, byte for byte', () => {
  it('player/src/spec equals render/src/spec', () => {
    expect(read('player', 'src', 'spec', 'kanban-card-chat.gen.ts')).toBe(
      read('render', 'src', 'spec', 'kanban-card-chat.gen.ts')
    )
  })
})

describe('cardFromMessage', () => {
  it('opens a card only from the same origin and the named envelope', () => {
    const msg = { ...ENVELOPE, repo: 'gHashTag/t27', number: 5382 }
    expect(cardFromMessage(msg, true)).toMatchObject({
      task: 'gHashTag/t27#5382',
      repo: 'gHashTag/t27',
      number: 5382,
    })
    expect(cardFromMessage(msg, false)).toBeNull()
    expect(cardFromMessage({ ...msg, v: 2 }, true)).toBeNull()
    expect(cardFromMessage({ ...msg, type: 'other' }, true)).toBeNull()
    expect(cardFromMessage({ ...msg, kind: 'open-mail' }, true)).toBeNull()
    expect(cardFromMessage(null, true)).toBeNull()
  })

  it('refuses a stranger repository, a bad number, and bounds the title', () => {
    const base = { ...ENVELOPE, number: 1 }
    expect(cardFromMessage({ ...base, repo: 'someone/t27' }, true)).toBeNull()
    expect(cardFromMessage({ ...base, repo: 'gHashTag/a/b' }, true)).toBeNull()
    expect(
      cardFromMessage({ ...ENVELOPE, repo: 'gHashTag/t27', number: 0 }, true)
    ).toBeNull()
    expect(
      cardFromMessage({ ...ENVELOPE, repo: 'gHashTag/t27', number: 1.5 }, true)
    ).toBeNull()
    expect(
      cardFromMessage(
        { ...ENVELOPE, repo: 'gHashTag/t27', number: SPEC.NUMBER_MAX + 1 },
        true
      )
    ).toBeNull()
    const long = cardFromMessage(
      { ...base, repo: 'ghashtag/t27', title: 'x'.repeat(500) },
      true
    )
    expect(long?.repo).toBe('gHashTag/t27')
    expect(long?.title?.length).toBe(SPEC.TITLE_MAX)
  })
})

describe('cardFromHref', () => {
  it('takes only an issue of ours on github.com', () => {
    expect(
      cardFromHref('https://github.com/gHashTag/t27/issues/5382')
    ).toMatchObject({ task: 'gHashTag/t27#5382' })
    expect(
      cardFromHref('https://github.com/ghashtag/trinity/issues/7/')
    ).toMatchObject({ task: 'gHashTag/trinity#7' })
    expect(cardFromHref('https://github.com/gHashTag/t27/pull/5382')).toBeNull()
    expect(cardFromHref('https://github.com/other/t27/issues/1')).toBeNull()
    expect(cardFromHref('http://github.com/gHashTag/t27/issues/1')).toBeNull()
    expect(cardFromHref('https://evil.com/gHashTag/t27/issues/1')).toBeNull()
    expect(cardFromHref('https://github.com/gHashTag/t27/issues/01')).toBeNull()
    expect(cardFromHref('not a url')).toBeNull()
    expect(cardFromHref(undefined)).toBeNull()
  })
})

describe('cardFromAnchor', () => {
  // The board as shipped (QUEEN_REF) draws this; the sheet said "untitled".
  const board = (title: string | null, strong: string) => {
    const host = document.createElement('div')
    host.innerHTML = `<article class="queen27-column is-running"><header><h3>running</h3></header><div class="queen27-cards"><a class="queen27-card" href="https://github.com/gHashTag/t27/issues/5673"><div><b>#5673</b></div><strong>${strong}</strong><span>6 criteria</span></a></div></article>`
    const a = host.querySelector('a')!
    if (title !== null) a.setAttribute('title', title)
    return a
  }

  it('reads the whole title and the column from the drawn card', () => {
    const full =
      'Port gHashTag/trios:crates/trios-cli/src/lock.rs (Rust, 5 functions) into the spec of the same name, five functions and all of their callers'
    expect(cardFromAnchor(board(full, 'Port gHashTag/trios:cr'))).toEqual({
      task: 'gHashTag/t27#5673',
      repo: 'gHashTag/t27',
      number: 5673,
      title: full,
      column: 'running',
    })
  })

  it('falls back to the drawn text, caps a hostile title, refuses a stranger', () => {
    expect(cardFromAnchor(board(null, '  Two\n  lines '))?.title).toBe(
      'Two lines'
    )
    expect(
      cardFromAnchor(board('x'.repeat(SPEC.TITLE_MAX + 50), ''))?.title
    ).toHaveLength(SPEC.TITLE_MAX)
    const a = board('t', 't')
    a.setAttribute('href', 'https://evil.com/gHashTag/t27/issues/1')
    expect(cardFromAnchor(a)).toBeNull()
    expect(cardFromAnchor(null)).toBeNull()
  })
})

describe('the address', () => {
  it('?card= opens a card; a bare number waits for the server', () => {
    expect(cardFromSearch('?card=5382')).toEqual({
      task: '#5382',
      repo: '',
      number: 5382,
    })
    expect(cardFromSearch('?card=5382', 'gHashTag/t27')).toMatchObject({
      task: 'gHashTag/t27#5382',
    })
    expect(cardFromSearch('?card=7&repo=gHashTag/trinity')).toMatchObject({
      task: 'gHashTag/trinity#7',
    })
    expect(cardFromSearch('?card=7&repo=other/x')).toBeNull()
    expect(cardFromSearch('?card=0')).toBeNull()
    expect(cardFromSearch('?card=abc')).toBeNull()
    expect(cardFromSearch('')).toBeNull()
  })

  it('searchWithCard writes ?repo= only when it is not the board repository', () => {
    const t27 = cardFromSearch('?card=5', 'gHashTag/t27')
    expect(searchWithCard('?x=1', t27, 'gHashTag/t27')).toBe('?x=1&card=5')
    const trinity = cardFromSearch('?card=7&repo=gHashTag/trinity')
    expect(searchWithCard('', trinity, 'gHashTag/t27')).toBe(
      '?card=7&repo=gHashTag%2Ftrinity'
    )
    expect(searchWithCard('?card=5&x=1', null)).toBe('?x=1')
    expect(searchWithCard('?card=5', null)).toBe('')
  })

  it('round-trips: the address written opens the same card', () => {
    const open = cardFromSearch('?card=7&repo=gHashTag/trinity')!
    expect(cardFromSearch(searchWithCard('', open, 'gHashTag/t27'))).toEqual(
      open
    )
  })

  it("the board's own moves keep the open card; the frame never sees it", () => {
    expect(keepCard('/game/queue', '/game/kanban?card=5')).toBe(
      '/game/queue?card=5'
    )
    expect(
      keepCard('/game/kanban?x=1', '/game/kanban?card=7&repo=gHashTag/trinity')
    ).toBe('/game/kanban?x=1&card=7&repo=gHashTag%2Ftrinity')
    expect(keepCard('/game/queue', '/game/kanban')).toBe('/game/queue')
    expect(withoutCard('?card=5&repo=gHashTag/t27&x=1')).toBe('?x=1')
    expect(withoutCard('?card=5')).toBe('')
  })
})

describe('cardFromHistory', () => {
  const bare = cardFromSearch('?card=5382')!

  it('takes the key the server resolved and what the board calls the card', () => {
    const body = {
      thread: 'task:gHashTag/t27#5382',
      card: { title: 'Ship the sheet', column: 'running' },
    }
    expect(cardFromHistory(body, bare)).toEqual({
      task: 'gHashTag/t27#5382',
      repo: 'gHashTag/t27',
      number: 5382,
      title: 'Ship the sheet',
      column: 'running',
    })
  })

  it('adds nothing -> null, so the sheet does not re-render', () => {
    const open = cardFromHistory(
      { thread: 'task:gHashTag/t27#5382', card: { title: 'A', column: 'b' } },
      bare
    )!
    expect(
      cardFromHistory(
        { thread: 'task:gHashTag/t27#5382', card: { title: 'A', column: 'b' } },
        open
      )
    ).toBeNull()
  })

  it('an untitled card keeps what the app had; another card is ignored', () => {
    const untitled = cardFromHistory(
      { thread: 'task:gHashTag/t27#5382', card: { title: '', column: 'x' } },
      bare
    )
    expect(untitled?.title).toBeUndefined()
    expect(cardFromHistory({ thread: 'task:gHashTag/t27#1' }, bare)).toBeNull()
    expect(cardFromHistory({ thread: 'self' }, bare)).toBeNull()
    expect(cardFromHistory({ thread: 'task:other/t27#5382' }, bare)).toBeNull()
    expect(cardFromHistory(null, bare)).toBeNull()
  })
})

describe('the sheet is the spec', () => {
  it('opens at half and reads the history door', () => {
    expect(CARD_SHEET.openDetent).toBe(SPEC.DETENT_HALF)
    expect(CARD_SHEET.historyDoor).toBe('/api/agent/history')
    expect(CARD_SHEET.field).toBe('task')
    expect(CARD_SHEET.touchPx).toBeGreaterThanOrEqual(44)
  })
})
