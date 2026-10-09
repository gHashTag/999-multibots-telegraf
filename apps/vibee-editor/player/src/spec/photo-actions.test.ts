/**
 * Spec photo-actions.t27, every test block run against the compiled logic
 * and the host's own functions (lib/photoActions.ts) -- the owner's
 * 2026-10-09 ask: the bot's photo buttons in the Blogger chat.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './photo-actions.gen'
import { showChips, sourceOf, vertical } from './photo-actions.logic'
import {
  PHOTO_ACTION_ASKS,
  PHOTO_ACTION_IDS,
  PHOTO_ACTION_TOOLS,
  lastPicture,
  photoActionAsk,
  photoRowShown,
} from '../lib/photoActions'
import { translations } from '../atoms/language'

const PIC =
  'https://bucket-production-8259.up.railway.app/vibee-assets/assets/1-a-agent-edit-2.png'

describe('spec photo-actions.t27 against the host', () => {
  it('the row shows for the Blogger with a photo, never without one or for another agent', () => {
    expect(showChips(true, true, false)).toBe(true)
    expect(showChips(true, false, true)).toBe(true)
    expect(showChips(true, false, false)).toBe(false)
    expect(showChips(false, true, true)).toBe(false)
    expect(photoRowShown('blogger', true, null)).toBe(true)
    expect(photoRowShown('blogger', false, PIC)).toBe(true)
    expect(photoRowShown('blogger', false, null)).toBe(false)
    expect(photoRowShown('tiktok', true, PIC)).toBe(false)
    expect(photoRowShown(null, true, PIC)).toBe(false)
  })

  it('a press acts on the attached photo first, then the last picture', () => {
    expect(sourceOf(true, true)).toBe(1)
    expect(sourceOf(false, true)).toBe(2)
    expect(sourceOf(false, false)).toBe(0)
    // Attached now: the file rides with the line, no address is added.
    expect(photoActionAsk('poster_plain', true, PIC)).toBe(
      PHOTO_ACTION_ASKS.poster_plain
    )
    // The last picture of the chat: its address goes with the ask.
    expect(photoActionAsk('poster_plain', false, PIC)).toContain(PIC)
    expect(photoActionAsk('poster_plain', false, null)).toBeNull()
    // The last picture is the newest one an ANSWER carried, glued text or not.
    expect(
      lastPicture([
        { role: 'assistant', text: 'old https://x.io/a.png' },
        { role: 'user', text: `mine https://x.io/u.png` },
        { role: 'assistant', text: `📎 **${PIC}**— готово` },
      ])
    ).toBe(PIC)
    expect(lastPicture([{ role: 'user', text: PIC }])).toBeNull()
    // Two pictures in one answer: the later one is the last.
    expect(
      lastPicture([
        { role: 'assistant', text: `https://x.io/first.png и потом ${PIC}` },
      ])
    ).toBe(PIC)
  })

  it('eight actions, each with its tool, posters vertical', () => {
    expect(vertical(SPEC.ASPECT_W, SPEC.ASPECT_H)).toBe(true)
    expect(vertical(16, 9)).toBe(false)
    expect(vertical(1, 1)).toBe(false)
    expect(PHOTO_ACTION_IDS).toHaveLength(SPEC.ACTION_COUNT)
    expect(PHOTO_ACTION_TOOLS).toHaveLength(SPEC.ACTION_COUNT)
    PHOTO_ACTION_IDS.forEach((id, i) => {
      // Each ask names its tool, so the agent does not have to guess one.
      expect(PHOTO_ACTION_ASKS[id]).toContain(PHOTO_ACTION_TOOLS[i])
      for (const lang of ['ru', 'en'] as const)
        expect(
          (translations[lang] as Record<string, string>)[`chat.photo.${id}`]
        ).toBeTruthy()
    })
    // Every drawing ask is vertical.
    for (const id of [
      'poster_plain',
      'poster_face',
      'studio',
      'variant',
    ] as const)
      expect(PHOTO_ACTION_ASKS[id]).toContain(SPEC.ASPECT)
    // The poster without people says so -- the owner's exact ask.
    expect(PHOTO_ACTION_ASKS.poster_plain).toMatch(/БЕЗ людей/) // cyrillic-ok: the ask's own words
    expect(SPEC.PRESS_SENDS_AT_ONCE).toBe(true)
    // CHIPS_ABOVE_INPUT: drawn right before the input container.
    expect(SPEC.CHIPS_ABOVE_INPUT).toBe(true)
    const chat = readFileSync(
      join(__dirname, '..', 'pages', 'Chat.tsx'),
      'utf8'
    )
    const row = chat.search(/<PhotoActionChips\s/)
    expect(row).toBeGreaterThan(-1)
    expect(
      chat.indexOf('<div className="chat-input-container">', row)
    ).toBeGreaterThan(row)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
