import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderFeedEntry } from './render-feed-entry'

/**
 * A RENDER THE AGENT ASKED FOR WAITS FOR APPROVAL; A PERSON'S IS HERS.
 *
 * The defect: every finished render went public under the payer as
 * "Vibee Reel" -- a client's story reel with her face included -- and each
 * one overwrote the last. See render-feed-entry.ts.
 */
describe('what a finished render puts into the feed', () => {
  it('the service key (agent, pipeline, bot) publishes HIDDEN', () => {
    const e = renderFeedEntry({
      viaServiceKey: true,
      compositionId: 'StoryReel',
      renderId: 'a1b2c3d4-e5f6-0000-0000-000000000000',
    })
    expect(e.isPublic).toBe(false)
  })

  it('each service render has a name of its own, so none overwrites another', () => {
    const a = renderFeedEntry({
      viaServiceKey: true,
      compositionId: 'StoryReel',
      renderId: 'aaaaaaaa-0000',
    })
    const b = renderFeedEntry({
      viaServiceKey: true,
      compositionId: 'StoryReel',
      renderId: 'bbbbbbbb-0000',
    })
    expect(a.name).not.toBe(b.name)
    expect(a.name).toContain('StoryReel')
    expect(a.name).not.toBe('Vibee Reel')
  })

  it('a project name given by the caller is kept, still unique', () => {
    const e = renderFeedEntry({
      viaServiceKey: true,
      projectName: 'Promo',
      renderId: 'cccccccc-0000',
    })
    expect(e.name).toBe('Promo · cccccccc')
  })

  it("a person's own render from the app is published as before", () => {
    expect(
      renderFeedEntry({ viaServiceKey: false, renderId: 'dddddddd' })
    ).toEqual({ isPublic: true, name: 'Vibee Reel' })
    expect(
      renderFeedEntry({
        viaServiceKey: false,
        projectName: 'My cut',
        renderId: 'dddddddd',
      })
    ).toEqual({ isPublic: true, name: 'My cut' })
  })
})

/*
 * The seam: every publishToFeed after a render goes through the rule, and
 * publishToFeed hands the visibility to the one function that writes. A
 * refactor that drops either half puts client reels back in public.
 */
describe('render-server wires the rule into every render publish', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'render-server.ts'),
    'utf8'
  )

  it('no render publishes under the shared name any more', () => {
    expect(src).not.toMatch(/project_name \|\| 'Vibee Reel'/)
  })

  it('every publishToFeed call carries a visibility from the rule', () => {
    const calls = src.split('await publishToFeed({').slice(1)
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const c of calls) {
      const args = c.slice(0, c.indexOf('})'))
      expect(args).toMatch(/isPublic:/)
    }
  })

  it('publishToFeed passes the visibility to publishTemplateRow', () => {
    const fn = src.slice(src.indexOf('async function publishToFeed('))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toMatch(/is_public:\s*params\.isPublic/)
  })

  it('one video is one post: publishing a rendered video again updates its row', () => {
    const fn = src.slice(src.indexOf('async function publishTemplateRow('))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toMatch(/video_url = \$3/)
  })

  it('the service-key flag is taken from authentication, not the body', () => {
    expect(src).toMatch(/viaServiceKey:\s*auth\.via === 'api-key'/)
    expect(src).not.toMatch(/viaServiceKey:\s*(req|request|renderReq)\./)
  })
})
