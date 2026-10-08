/**
 * bot-neuro-office.t27 v2 names_speaker: a room turn carries who asked, so
 * the render names the stored line after them; a private turn carries no
 * name. The render side is roomLine (render bot-agent-team.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { спроситьАгента } from '@/services/trinityAgent' // cyrillic-ok: pre-existing identifier

describe('a room turn names who asked; a private turn does not', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.unstubAllEnvs()
  })

  const capture = () => {
    const bodies: any[] = []
    globalThis.fetch = (async (url: string, init: any) => {
      if (String(url).includes('/api/agent/chat')) {
        bodies.push(JSON.parse(init.body))
        return new Response(
          [
            JSON.stringify({ тип: 'текст', текст: 'ok' }), // cyrillic-ok: wire field names
            JSON.stringify({ тип: 'готово', витков: 1 }), // cyrillic-ok: wire field names
          ].join('\n'),
          { status: 200 }
        )
      }
      return new Response(JSON.stringify({ turns: [] }), { status: 200 })
    }) as never
    return bodies
  }

  it('the speaker travels with a room only', async () => {
    vi.stubEnv('RENDER_API_KEY', 'k')
    const bodies = capture()
    const ask = спроситьАгента // cyrillic-ok: pre-existing identifier
    await ask('5', 'Treasurer, how much?', {
      room: '-1001234567890',
      speaker: 'Anna',
    })
    expect(bodies[0].room).toBe('-1001234567890')
    expect(bodies[0].speaker).toBe('Anna')
    await ask('5', 'hi', { speaker: 'Anna' })
    expect(bodies[1].speaker).toBeUndefined()
    // the question itself is never prefixed: the render finds a member named first
    expect(JSON.stringify(bodies[0].messages)).not.toContain('Anna:')
  })
})
