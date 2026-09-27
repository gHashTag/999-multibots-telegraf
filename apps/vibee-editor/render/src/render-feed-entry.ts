/**
 * WHAT A FINISHED RENDER PUTS INTO THE FEED, AND WHO SEES IT.
 *
 * Owner's rule (#2051): "a post is in the feed only if the person approved
 * it". The agent's own `feed_publish` has kept it since: it publishes hidden,
 * and the person approves in "Awaiting approval". The render step behind it
 * did not. Every render that finished called publishToFeed with no
 * visibility, and publishTemplateRow's default is VISIBLE -- so a client's
 * story reel, her face and her voice, went public under whoever paid for it,
 * before the seller had even looked (measured 2026-09-27, render-server.ts
 * /render/template).
 *
 * And every one of them was named "Vibee Reel". The row is upserted by
 * (owner, name), so each new render overwrote the previous post -- an
 * approved one included -- and brought a deleted one back.
 *
 * The rule here:
 *   - a render asked for by a PERSON (a signed request from the app) is
 *     published as before: the press was theirs;
 *   - a render asked for through the service key -- the agent, a pipeline,
 *     the bot -- is published HIDDEN, into the payer's "Awaiting approval",
 *     and under a name of its own, so it never overwrites another post.
 *
 * Who asked is decided by how the request was authenticated, never by a
 * field of its body: a body can say anything.
 */

export interface RenderFeedEntry {
  isPublic: boolean
  name: string
}

export function renderFeedEntry(o: {
  /** The request came with the service key, not a person's signature. */
  viaServiceKey: boolean
  /** The name the caller gave the project, if any. */
  projectName?: string | null
  compositionId?: string | null
  renderId: string
}): RenderFeedEntry {
  const given = String(o.projectName ?? '').trim()
  if (!o.viaServiceKey) return { isPublic: true, name: given || 'Vibee Reel' }
  const what = given || String(o.compositionId ?? '').trim() || 'Reel'
  return {
    isPublic: false,
    name: `${what} · ${String(o.renderId).slice(0, 8)}`,
  }
}
