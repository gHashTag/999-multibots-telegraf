import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import {
  answeredAlbumAlready,
  forgetAlbums,
  albumsRemembered,
  ALBUM_QUIET_MS,
} from '@/services/albumOnce'

/**
 * ONE ANSWER PER ALBUM, NOT ONE PER PHOTO.
 *
 * Telegram delivers every element of an album as its own business_message and
 * puts the caption on at most one of them. The seller's non-text branch
 * answers with a canned line and returns ABOVE the only duplicate guard in
 * that function, so nothing suppressed anything: four photos with no caption
 * produced four identical messages in a row, signed with the owner's name, at
 * the exact moment the client had shown what they wanted.
 */
describe('an album is answered once', () => {
  beforeEach(() => forgetAlbums())

  it('answers the first element and stays quiet for the rest', () => {
    const album = () => answeredAlbumAlready('conn', 'g1')
    expect(album(), 'the first photo was not answered').toBe(false)
    expect(album()).toBe(true)
    expect(album()).toBe(true)
    expect(album()).toBe(true)
  })

  it('always answers a single file, which has no album id', () => {
    // Treating a lone photo as part of a group would silence real messages.
    expect(answeredAlbumAlready('conn', undefined)).toBe(false)
    expect(answeredAlbumAlready('conn', undefined)).toBe(false)
    expect(answeredAlbumAlready('conn', null)).toBe(false)
  })

  it('tells two albums apart, and two connections apart', () => {
    expect(answeredAlbumAlready('conn', 'g1')).toBe(false)
    expect(answeredAlbumAlready('conn', 'g2')).toBe(false)
    // The same album id from another business connection is another album.
    expect(answeredAlbumAlready('other', 'g1')).toBe(false)
    expect(answeredAlbumAlready('conn', 'g1')).toBe(true)
  })

  it('answers again once the album is long past', () => {
    const t0 = 1_000_000
    expect(answeredAlbumAlready('conn', 'g1', t0)).toBe(false)
    expect(answeredAlbumAlready('conn', 'g1', t0 + 1000)).toBe(true)
    expect(answeredAlbumAlready('conn', 'g1', t0 + ALBUM_QUIET_MS + 1)).toBe(
      false
    )
  })

  it('forgets old albums instead of growing forever', () => {
    // A guard that remembers for the life of the process is a slow leak.
    const t0 = 1_000_000
    for (let i = 0; i < 50; i++) answeredAlbumAlready('conn', `g${i}`, t0)
    expect(albumsRemembered()).toBe(50)
    answeredAlbumAlready('conn', 'later', t0 + ALBUM_QUIET_MS + 1)
    expect(albumsRemembered(), 'nothing was swept').toBe(1)
  })
})

describe('the seller actually consults it', () => {
  const src = fs.readFileSync('src/services/businessBotService.ts', 'utf8')

  it('asks before the canned reply goes out', () => {
    const branch = src.slice(src.indexOf('if (!text) {'))
    const guard = branch.indexOf('answeredAlbumAlready(')
    const reply = branch.indexOf('sendAsOwner(media.reply')
    expect(guard, 'the album is never checked').toBeGreaterThan(-1)
    expect(
      guard,
      'the reply goes out before anything asks whether this is a repeat'
    ).toBeLessThan(reply)
  })

  it('leaves the relay to the owner outside the guard', () => {
    // Every element must still reach the owner; only the client-facing line
    // is deduplicated, and the relay happens above this branch.
    const relay = src.indexOf('await relayMediaToOwner(')
    expect(relay).toBeGreaterThan(-1)
    expect(relay).toBeLessThan(src.indexOf('if (!text) {'))
  })
})
