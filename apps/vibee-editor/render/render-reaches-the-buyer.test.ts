import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A finished render must reach the person who ordered it.
 *
 * It did not. Every completed video was sent to TELEGRAM_RENDERS_GROUP -- an
 * internal group id hardcoded in the server -- and the bot is not in that
 * chat, so Telegram answered "Bad Request: chat not found", the fallback
 * message failed identically, and the video was dropped.
 *
 * Verified in production before this was written: two renders in a single log
 * window, each about two minutes of compute, uploaded to S3 and then thrown
 * away. From the outside that is exactly "the bot does not make assets" --
 * they were made, and never arrived.
 *
 * The job always knew the buyer: userInfo.telegram_id is set when the render
 * is created, and is used a few lines further down to publish to the feed.
 *
 * These checks are structural because the delivery sits deep inside the render
 * loop of a server file with no seam to call it through. Structural is enough
 * for the property that broke: WHO the video is addressed to, and in what
 * order.
 */

const SERVER = path.resolve(__dirname, 'render-server.ts')
const src = fs.readFileSync(SERVER, 'utf8')

/**
 * The completion block.
 *
 * Anchored on the unique comment header rather than on `const hlsInfo =` and
 * the feed marker: "// Auto-publish to community feed" appears THREE times in
 * this file, so indexOf found an earlier one and the slice came out backwards
 * -- the first version of these checks read an empty string and failed on its
 * own anchor rather than on the code.
 */
function completionBlock(): string {
  const start = src.indexOf('THE FINISHED VIDEO GOES TO THE PERSON WHO ASKED')
  expect(
    start,
    'the completion block moved -- these checks read nothing'
  ).toBeGreaterThan(0)
  const end = src.indexOf('// Auto-publish to community feed', start)
  expect(end, 'the feed publish marker moved').toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('a finished render reaches the buyer', () => {
  it('still finds the completion block', () => {
    // Every assertion below reads this slice. If the markers move, an empty
    // slice would satisfy the negative checks and quietly prove nothing.
    expect(completionBlock().length).toBeGreaterThan(200)
  })

  it('sends the video to the telegram id on the job', () => {
    const block = completionBlock()
    expect(
      block,
      'the finished video must be addressed to userInfo.telegram_id -- ' +
        'the buyer -- and not only to an internal group'
    ).toMatch(new RegExp('userInfo\\?\\.telegram_id'))
    expect(block).toMatch(new RegExp('sendTelegramVideo\\(\\s*buyerChatId'))
  })

  it('serves the buyer before the courtesy copy', () => {
    // Order is the property, not decoration: the group send is the one that
    // has been failing, and doing it first is how a failure there could stop
    // the delivery that matters.
    const block = completionBlock()
    const buyer = block.indexOf('buyerChatId,')
    const group = block.indexOf('TELEGRAM_RENDERS_GROUP,')
    expect(buyer, 'the buyer send is missing').toBeGreaterThan(-1)
    expect(group, 'the group copy is missing').toBeGreaterThan(-1)
    expect(
      buyer,
      'the internal group must not be served before the person who paid'
    ).toBeLessThan(group)
  })

  it('reports a failed delivery to the buyer as an error, not a note', () => {
    // The old code logged one cheerful line whatever happened, so a dropped
    // video looked exactly like a delivered one.
    const block = completionBlock()
    expect(
      block,
      'a video that reached nobody must be logged as an error'
    ).toMatch(new RegExp('console\\.error'))
    expect(block).toMatch(new RegExp('did NOT receive'))
  })

  it('does not report success when the group copy alone succeeded', () => {
    // The failure this guards: reporting "notification sent" after the buyer
    // send failed and only the internal copy went through.
    const block = completionBlock()
    expect(
      block,
      'the log line must distinguish the buyer from the group'
    ).toMatch(new RegExp('buyer='))
    expect(block).toMatch(new RegExp('group='))
  })
})
