import { describe, expect, it } from 'vitest'
import { CHANNELS, isOwnUrl, tagValue, tagged } from './src/agent/utm'

/**
 * THE TAGGER (epic #2974). Each case is a way a tag could lie or do harm:
 * tagging somebody else's link, hiding the tag behind a hash route where no
 * analytics reads it, or overwriting a tag somebody chose by hand.
 */
describe('tagging our own links', () => {
  it('puts the query before the hash, so the route still opens and the tag is read', () => {
    const t = tagged('https://t27.ai/#/blog/s', 'x', {
      campaign: 'blog',
      content: 's',
    })
    expect(t).toBe(
      'https://t27.ai/?utm_source=x&utm_medium=social&utm_campaign=blog&utm_content=s#/blog/s'
    )
  })

  it("never tags somebody else's link", () => {
    for (const u of [
      'https://github.com/gHashTag/x',
      'https://evil.t27.ai.example.com/',
      'not a url',
    ])
      expect(tagged(u, 'x')).toBe(u)
    expect(isOwnUrl('https://app.t27.ai/agents')).toBe(true)
  })

  it('never overwrites a tag already there', () => {
    const t = new URL(tagged('https://app.t27.ai/?utm_source=manual', 'reddit'))
    expect(t.searchParams.get('utm_source')).toBe('manual')
    expect(t.searchParams.get('utm_medium')).toBe('social')
  })

  it('every channel has a medium, and the messenger is not "social"', () => {
    for (const [c, m] of Object.entries(CHANNELS))
      expect(m, c).toMatch(/^[a-z]+$/)
    expect(CHANNELS.telegram).toBe('messenger')
  })

  it('a tag value is lowercase and safe, and an empty one is left out', () => {
    expect(tagValue('Ternary Floats, Measured!')).toBe(
      'ternary-floats-measured'
    )
    const t = new URL(tagged('https://t27.ai/', 'x', { campaign: '' }))
    expect(t.searchParams.has('utm_campaign')).toBe(false)
  })
})

describe('a link into our bot carries its channel in /start', () => {
  it('the channel rides after a double underscore, within Telegram’s 64', async () => {
    const { tagged, START_PAYLOAD_MAX } = await import('./src/agent/utm')
    expect(tagged('https://t.me/t27ai_bot?start=app_feed', 'telegram')).toBe(
      'https://t.me/t27ai_bot?start=app_feed__telegram'
    )
    expect(tagged('https://t.me/t27ai_bot?start=club', 'x')).toBe(
      'https://t.me/t27ai_bot?start=club__x'
    )
    const long = `app_${'a'.repeat(START_PAYLOAD_MAX - 6)}`
    expect(tagged(`https://t.me/b_bot?start=${long}`, 'linkedin')).toBe(
      `https://t.me/b_bot?start=${long}`
    )
  })

  it('never touches a payload that is not ours, or already tagged', async () => {
    const { tagged } = await import('./src/agent/utm')
    for (const url of [
      'https://t.me/someone_else_bot?start=ref42', // their payload
      'https://t.me/t27ai_bot?start=144022504', // a referral code
      'https://t.me/t27ai_bot?start=app_feed__x', // already carries a channel
      'https://t.me/t27ai_bot', // no payload: not ours to invent
      'https://t.me/t27ai_bot?startapp=feed', // Mini App param, not /start
      'https://example.com/?start=app_feed', // not Telegram
    ])
      expect(tagged(url, 'reddit'), url).toBe(url)
  })

  it('the tag keeps only what a /start payload may hold', async () => {
    const { startTag } = await import('./src/agent/utm')
    expect(startTag('Tele.Gram_1')).toBe('tele-gram-1')
    expect(startTag('x')).toMatch(/^[a-z0-9-]+$/)
  })
})
