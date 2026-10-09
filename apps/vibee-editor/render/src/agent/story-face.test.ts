import { describe, expect, it } from 'vitest'
import { keepStoryFace, storySettingsOf } from './story-template'

/**
 * THE FACE OF THE REEL: her avatar by default; a photo the seller (or she)
 * picked stands over it, and an empty one puts the avatar back.
 */
const AVATAR = 'https://t.me/i/userpic/320/her.jpg'
const OWN = 'https://cdn.example/own.jpg'

function pool() {
  let kept = ''
  const sql: string[] = []
  return {
    sql,
    query: async (q: string, p: unknown[] = []) => {
      sql.push(q)
      // v31: a reset clears the reel's photo and keeps the per-scene picks.
      if (/UPDATE story_faces SET face_url = ''/.test(q)) kept = ''
      if (/SELECT face_url FROM story_faces/.test(q))
        return { rows: kept ? [{ face_url: kept }] : [] }
      if (/INSERT INTO story_faces/.test(q)) kept = String(p[2])
      if (/FROM crm_people/.test(q))
        return { rows: [{ first_name: 'Anna', avatar_url: AVATAR }] }
      return { rows: [] }
    },
  }
}

describe('the face of the reel', () => {
  it('is her avatar until a photo is kept, then the photo, then the avatar again', async () => {
    const db = pool()
    let s = await storySettingsOf(db as never, '900000077', '900000078')
    expect(s?.faceUrl).toBe(AVATAR)
    expect(s?.faceCustom).toBe(false)

    expect(
      await keepStoryFace(db as never, '900000078', '900000077', OWN)
    ).toEqual({ kept: true })
    s = await storySettingsOf(db as never, '900000077', '900000078')
    expect(s?.faceUrl).toBe(OWN)
    expect(s?.faceCustom).toBe(true)
    expect(s?.avatarUrl).toBe(AVATAR)

    expect(
      await keepStoryFace(db as never, '900000078', '900000077', '')
    ).toEqual({ kept: false })
    s = await storySettingsOf(db as never, '900000077', '900000078')
    expect(s?.faceUrl).toBe(AVATAR)
    expect(s?.faceCustom).toBe(false)
  })

  it('refuses what is not an https link, and keeps nothing', async () => {
    const db = pool()
    for (const bad of [
      'http://x.example/a.jpg',
      'javascript:alert(1)',
      'not a url',
    ])
      expect((await keepStoryFace(db as never, '1', '2', bad)).why).toMatch(
        /https/
      )
    expect(db.sql.some(q => /INSERT INTO story_faces/.test(q))).toBe(false)
  })
})
