import { describe, expect, it } from 'vitest'
import {
  cardKey,
  fieldSource,
  panelKeepOffered,
  panelTakeOffered,
  takeBg,
  takeFix,
  toColourInput,
} from './storyPalette'

/** The panel's pure logic (crm-story-reel.t27 v11). */
describe('her palette on the card: the pure part', () => {
  it('keep is offered only for the card the last check passed', () => {
    expect(panelKeepOffered(true, false, true)).toBe(true)
    expect(panelKeepOffered(false, false, true)).toBe(false)
    expect(panelKeepOffered(true, true, true)).toBe(false)
    expect(panelKeepOffered(true, false, false)).toBe(false)
  })

  it('take is offered only beside the verdict on the card still on screen (v12)', () => {
    expect(panelTakeOffered(true, false, true)).toBe(true)
    expect(panelTakeOffered(false, false, true)).toBe(false)
    expect(panelTakeOffered(true, true, true)).toBe(false)
    expect(panelTakeOffered(true, false, false)).toBe(false)
  })

  it('taking the shade changes the call and the button line, nothing else', () => {
    const card = { bg: '#f5efe0', title: '#d4b04c', text: '#fff', button: 'x' }
    expect(takeFix(card, { title: '#6a5826' })).toEqual({
      ...card,
      title: '#6a5826',
    })
    expect(takeFix(card, { accent: '#2b2b2b' })).toEqual({
      ...card,
      accent: '#2b2b2b',
    })
    // Only title and accent are taken, whatever else the answer carried.
    expect(takeFix(card, { bg: '#abc', text: '#def', button: 'y' })).toEqual(
      card
    )
    expect(takeFix({}, {})).toEqual({})
  })

  it('taking the ground changes the background, nothing else (v13)', () => {
    const card = { bg: '#f5efe0', title: '#d4b04c', button: 'x' }
    expect(takeBg(card, { bg: '#45433f' })).toEqual({ ...card, bg: '#45433f' })
    expect(takeBg(card, { title: '#000', accent: '#111' })).toEqual(card)
    expect(takeBg({}, {})).toEqual({})
  })

  it('a field comes from the kept palette, then her profile, then the default', () => {
    const kept = { bg: '#1a2b3c' }
    const card = { bg: '#1a2b3c', title: '#eeeeee' }
    expect(fieldSource('bg', kept, card)).toBe('kept')
    expect(fieldSource('title', kept, card)).toBe('profile')
    expect(fieldSource('accent', kept, card)).toBe('default')
    expect(fieldSource('bg', null, null)).toBe('default')
  })

  it('the colour input gets #rrggbb whatever the card spells', () => {
    expect(toColourInput('#abc')).toBe('#aabbcc')
    expect(toColourInput('#ABCD')).toBe('#aabbcc')
    expect(toColourInput('#10182A')).toBe('#10182a')
    expect(toColourInput('#10182a80')).toBe('#10182a')
    expect(toColourInput('black')).toBe('#000000')
    expect(toColourInput(undefined)).toBe('#000000')
  })

  it('two cards are one card when every field is the same', () => {
    expect(cardKey({ bg: '#abc', button: 'x' })).toBe(
      cardKey({ button: 'x', bg: '#abc' })
    )
    expect(cardKey({ bg: '#abc' })).not.toBe(cardKey({ bg: '#abd' }))
    expect(cardKey(null)).toBe(cardKey({}))
  })
})
