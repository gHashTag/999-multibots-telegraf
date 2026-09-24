/**
 * TWO ANSWERS, NEVER THREE.
 *
 * `facesKnown` answers who we ALREADY hold a picture for. What it must never
 * do is let the caller conclude "this person has no photo": the cache is
 * filled by the screen's batch and by crm_client_face, so an empty row means
 * NOBODY HAS LOOKED. The queue orders by this, and a wrong 'no' would bury
 * people over a fact never checked -- silently, on any database whose
 * crm_people has not grown the column yet.
 */
import { describe, it, expect } from 'vitest'
import { facesKnown } from './crm-avatars'

const poolWith = (rows: any[], onSql?: (q: string, p: any[]) => void) => ({
  async query(q: string, p: any[] = []) {
    onSql?.(q, p)
    return { rows }
  },
})

describe('whose face we already hold', () => {
  it('names only the leads that came back', async () => {
    const got = await facesKnown(
      poolWith([{ lead_id: '900000002' }]),
      '900000001',
      ['900000002', '900000003']
    )
    expect([...got]).toEqual(['900000002'])
  })

  it('asks only about this owner, and skips empty pictures', async () => {
    let sql = ''
    let params: any[] = []
    await facesKnown(
      poolWith([], (q, p) => {
        sql = q
        params = p
      }),
      '900000001',
      ['900000002']
    )
    expect(sql).toContain('owner_id = $1')
    expect(sql).toContain("avatar_url <> ''")
    expect(params[0]).toBe('900000001')
    expect(params[1]).toEqual(['900000002'])
  })

  it('THE GUARD: a database without the column demotes nobody', async () => {
    const angry = {
      async query() {
        throw new Error('column "avatar_url" does not exist')
      },
    }
    await expect(facesKnown(angry, '900000001', ['9'])).resolves.toEqual(
      new Set()
    )
  })

  it('no leads, no query at all', async () => {
    let asked = false
    await facesKnown(
      poolWith([], () => {
        asked = true
      }),
      '900000001',
      []
    )
    expect(asked).toBe(false)
  })
})
