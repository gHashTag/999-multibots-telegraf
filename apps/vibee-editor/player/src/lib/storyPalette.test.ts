import { describe, expect, it } from 'vitest'
import {
  cardKey,
  fieldSource,
  panelKeepOffered,
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
