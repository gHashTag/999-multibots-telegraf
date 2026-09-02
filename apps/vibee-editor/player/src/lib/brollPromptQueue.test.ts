import { describe, expect, it } from 'vitest'

import { buildBrollPromptQueue, nextBrollPromptIndex } from './brollPromptQueue'

describe('B-roll prompt queue', () => {
  it('keeps every non-empty script shot in its original order', () => {
    expect(
      buildBrollPromptQueue(['wide hook', ' ', 'close-up proof', 'final CTA'])
    ).toEqual([
      { index: 0, label: 'Кадр 1', prompt: 'wide hook' },
      { index: 1, label: 'Кадр 2', prompt: 'close-up proof' },
      { index: 2, label: 'Кадр 3', prompt: 'final CTA' },
    ])
  })

  it('advances only one reviewed shot and never wraps into a paid rerun', () => {
    expect(nextBrollPromptIndex(0, 3)).toBe(1)
    expect(nextBrollPromptIndex(1, 3)).toBe(2)
    expect(nextBrollPromptIndex(2, 3)).toBe(2)
    expect(nextBrollPromptIndex(0, 0)).toBe(0)
  })
})
