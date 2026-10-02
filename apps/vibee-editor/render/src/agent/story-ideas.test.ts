import { describe, expect, it } from 'vitest'
import { parseIdeas, storyTopicIdeas, STORY_IDEAS_MAX } from './story-template'

describe('story topic ideas', () => {
  it('reads a JSON list out of the answer, distinct and capped', () => {
    expect(parseIdeas('ok: ["A", "A", " B ", "C", "D", "E"]')).toEqual([
      'A',
      'B',
      'C',
      'D',
    ])
    expect(parseIdeas('no list')).toEqual([])
    expect(STORY_IDEAS_MAX).toBe(4)
  })

  it('writes from her SOUL and the correspondence, not from nothing', async () => {
    const seen: string[] = []
    const pool = {
      query: async (q: string) =>
        q.includes('user_soul')
          ? { rows: [{ content: 'florist, loves peonies' }] }
          : { rows: [{ out: false, text: 'let us do a peony reel' }] },
    }
    const ideas = await storyTopicIdeas(
      pool,
      async m => {
        seen.push(m.map(x => x.content).join('\n'))
        return '["Peonies of the week"]'
      },
      'seller',
      'lead',
      { name: 'Gaia', about: 'florist' }
    )
    expect(ideas).toEqual(['Peonies of the week'])
    expect(seen[0]).toContain('loves peonies')
    expect(seen[0]).toContain('peony reel')
  })

  it('asks nothing when there is nothing to go on', async () => {
    let asked = false
    const pool = { query: async () => ({ rows: [] }) }
    const ideas = await storyTopicIdeas(
      pool,
      async () => ((asked = true), '[]'),
      's',
      'l',
      { name: '', about: '' }
    )
    expect(ideas).toEqual([])
    expect(asked).toBe(false)
  })

  it('keeps the ideas a day: a second open asks the model nothing', async () => {
    let calls = 0
    const pool = {
      query: async (q: string) =>
        q.startsWith('SELECT ideas')
          ? { rows: [{ ideas: ['Kept topic'] }] }
          : { rows: [] },
    }
    const ideas = await storyTopicIdeas(
      pool,
      async () => (calls++, '["New"]'),
      's',
      'l',
      { name: 'G', about: 'x' }
    )
    expect(ideas).toEqual(['Kept topic'])
    expect(calls).toBe(0)
  })
})
