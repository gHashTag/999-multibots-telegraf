import { describe, expect, it } from 'vitest'

import { PRIMARY_NAV_ITEMS } from './primaryNavigation'
import { TAB_GLYPHS } from './tabGlyphs'

describe('tab glyphs come from the shared list', () => {
  it('has a glyph for every icon the list names', () => {
    for (const tab of PRIMARY_NAV_ITEMS) {
      expect(
        TAB_GLYPHS[tab.icon],
        `no glyph "${tab.icon}" for ${tab.id}`
      ).toBeTruthy()
    }
  })
})
