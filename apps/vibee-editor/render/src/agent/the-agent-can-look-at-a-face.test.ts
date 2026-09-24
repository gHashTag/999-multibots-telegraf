/**
 * THE AGENT COULD DRAW A FACE AND COULD NOT LOOK AT ONE.
 *
 * Owner, 24.09.2026: "why does the agent have no access to the user's
 * avatar? this is the main thing in the CRM -- we hook clients through their
 * face." Every piece was present and none of them was reachable: the face
 * was fetched inside the lead magnet, inside the portrait, and by a screen
 * batch the model is forbidden to call (crm_client_avatars, DIRECT_CALL_ONLY).
 * So the seller could not answer "is there a photo to work from?" and told
 * people it had nothing while the owner saw their picture in his chat list.
 *
 * The two guards that matter are not "it returns a URL":
 *
 *   1. in a turn working for a client, naming somebody ELSE is refused --
 *      the photos come through the owner's session, and a client's sentence
 *      must not be able to fetch a stranger's face;
 *   2. the model is actually OFFERED it, including on a 16k provider. A tool
 *      nobody is shown is the state this whole change is about.
 */
import { describe, it, expect } from 'vitest'
import { makeClientFaceTool, NOT_YOUR_CALL } from './client-face-tool'
import {
  TOOLS_BY_NAME,
  DIRECT_CALL_ONLY,
  COMPACT_TOOLS,
  COMPACT_TOOLS_EXCLUDED,
} from './tools'

const pool = {
  async query() {
    return { rows: [] }
  },
}
const ctxFor = (extra: Record<string, unknown> = {}) =>
  ({ telegramId: '900000001', pool, ...extra }) as never

const deps = (o: Partial<Record<string, any>> = {}) => ({
  avatar: o.avatar ?? (async () => 'https://ours/lead.jpg'),
  sentPhotos: o.sentPhotos ?? (async () => []),
  ownAvatar: o.ownAvatar ?? (async () => 'https://ours/owner.jpg'),
})

const tool = (o?: any) => makeClientFaceTool(deps(o) as never)[0]!

describe('the agent can look at a face', () => {
  it('a named lead comes back as a URL on OUR storage, with its origin', async () => {
    const r: any = await tool().handler({ lead_id: '900000077' }, ctxFor())
    expect(r.has).toBe(true)
    expect(r.url).toBe('https://ours/lead.jpg')
    expect(r.from).toBe('avatar')
    expect(r.whose).toBe('900000077')
  })

  it('THE GUARD: in a client turn, another name is refused', async () => {
    let askedFor = ''
    const t = tool({
      avatar: async (_c: any, l: any) => {
        askedFor = l.id
        return 'https://ours/x.jpg'
      },
    })
    const r: any = await t.handler(
      { lead_id: '900000099' },
      ctxFor({ faceOf: '900000077' })
    )
    expect(r.has).toBe(false)
    expect(r.why).toBe(NOT_YOUR_CALL)
    // And nothing was fetched: a refusal that still opened the session would
    // leak the face it declined to name.
    expect(askedFor).toBe('')
  })

  it('in a client turn with no argument, it is that client', async () => {
    const r: any = await tool().handler({}, ctxFor({ faceOf: '900000077' }))
    expect(r.whose).toBe('900000077')
  })

  it('no face: it says to ask for a photo, never invents one', async () => {
    const r: any = await tool({ avatar: async () => '' }).handler(
      { lead_id: '900000077' },
      ctxFor()
    )
    expect(r.has).toBe(false)
    expect(r.url).toBeUndefined()
    expect(String(r.why)).toContain('фото') // cyrillic-ok: tool result copy
  })

  it('a CRM row that refuses the write does not lose the face', async () => {
    const angry = {
      async query() {
        throw new Error('no such column avatar_url')
      },
    }
    const r: any = await tool().handler(
      { lead_id: '900000077' },
      ctxFor({ pool: angry })
    )
    expect(r.has).toBe(true)
  })

  it('nobody named at all: the caller sees their own face', async () => {
    const r: any = await tool().handler({}, ctxFor())
    expect(r.url).toBe('https://ours/owner.jpg')
    expect(r.whose).toBe('900000001')
  })

  it('THE POINT: the model is offered it, on a 16k provider too', () => {
    expect(TOOLS_BY_NAME.get('crm_client_face')).toBeTruthy()
    // Not the screen batch's fate: that one the model may never call.
    expect(DIRECT_CALL_ONLY.has('crm_client_face')).toBe(false)
    expect(COMPACT_TOOLS.test('crm_client_face')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_client_face')).toBe(false)
  })
})
