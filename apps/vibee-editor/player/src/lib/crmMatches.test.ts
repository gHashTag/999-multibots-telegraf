import { describe, expect, it } from 'vitest'
import { matches, searchNeedle, type ClientRow } from './crm'

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
