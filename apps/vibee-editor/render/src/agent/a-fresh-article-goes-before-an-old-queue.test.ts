import { describe, expect, it } from 'vitest'
import { FRESH_MS, nextArticle, parseRss } from './blog-share'

/*
 * 2026-10-04..06: the owner's queue, written once with August articles first,
 * sent golden-ratio-weights (09-27), open-gigabit-ethernet-artix7 (08-09) and
 * six-and-a-half-years (08-14) to X on three days while the articles of 10-04
 * waited. A fresh article goes ahead of the queue; the queue orders the rest.
 */
const item = (slug: string, date: string) =>
  `<item><title>${slug}</title><link>https://t27.ai/#/blog/${slug}</link>` +
  `<guid isPermaLink="false">${slug}</guid><pubDate>${date}</pubDate>` +
  `<description>${slug} summary</description></item>`

const FEED = `<rss><channel>${[
  item('three-bits-each-necessary', 'Sun, 04 Oct 2026 12:00:00 GMT'),
  item(
    'golden-ratio-weights-ran-on-the-board',
    'Sun, 27 Sep 2026 12:00:00 GMT'
  ),
  item('open-gigabit-ethernet-artix7', 'Sun, 09 Aug 2026 12:00:00 GMT'),
].join('')}</channel></rss>`

const NOW = Date.parse('2026-10-06T08:00:00Z')
const QUEUE = [
  'golden-ratio-weights-ran-on-the-board',
  'open-gigabit-ethernet-artix7',
]

describe('a fresh article goes before an old queue', () => {
  it('reads the pubDate from the feed', () => {
    expect(parseRss(FEED)[0].published).toBe(Date.parse('2026-10-04T12:00:00Z'))
  })

  it('offers the fresh article, not the queued August one', () => {
    const pick = nextArticle(parseRss(FEED), new Set(), QUEUE, NOW)
    expect(pick?.article.slug).toBe('three-bits-each-necessary')
    expect(pick?.queued).toBe(false)
  })

  it('falls back to the queue once nothing fresh is left', () => {
    const pick = nextArticle(
      parseRss(FEED),
      new Set(['three-bits-each-necessary']),
      QUEUE,
      NOW
    )
    expect(pick?.article.slug).toBe('golden-ratio-weights-ran-on-the-board')
    expect(pick?.queued).toBe(true)
  })

  it('an article older than the window is not fresh', () => {
    const pick = nextArticle(
      parseRss(FEED),
      new Set(),
      QUEUE,
      Date.parse('2026-10-04T12:00:00Z') + FRESH_MS + 1
    )
    expect(pick?.article.slug).toBe('golden-ratio-weights-ran-on-the-board')
  })
})
