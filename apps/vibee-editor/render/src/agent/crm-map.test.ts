import { describe, expect, it } from 'vitest'
import { buildMap, GROUP_PAIR_CAP, mapFor, sphereOf } from './crm-map'
import { COMPACT_TOOLS_EXCLUDED, DIRECT_CALL_ONLY, TOOLS } from './tools'

/**
 * THE MAP DRAWS WHAT THE MEMORY CAN PROVE.
 *
 * Pinned: a sphere comes from a person's own words and is `other` when the
 * words do not say; an edge exists only between people who wrote in the same
 * group; one crowded group does not become a hairball.
 */
const person = (id: string, text = '', talk = 1) => ({
  id,
  name: null,
  username: null,
  avatarUrl: null,
  talk,
  text,
})

describe('sphereOf', () => {
  it.each([
    ['I shoot reels for my instagram blog', 'content'],
    ['we are launching a startup, sales funnel next', 'business'],
    ['yoga and fitness every morning', 'health'],
    ['пишу бота на python', 'tech'], // cyrillic-ok: a Russian sample
    ['ИИ поможет', 'tech'], // cyrillic-ok: a Russian sample
    ['хочу пройти курс в школе', 'education'], // cyrillic-ok: a Russian sample
  ])('%s -> %s', (text, sphere) => {
    expect(sphereOf(text)).toBe(sphere)
  })

  it('does not find a sphere inside another word', () => {
    // A word that merely CONTAINS a stem ("bot" in "work", "ai" in "lines") is not tech.
    expect(sphereOf('работа линии')).toBe('other') // cyrillic-ok: a sample
  })

  it('says other when the words do not place a person', () => {
    expect(sphereOf('hello, how are you')).toBe('other')
  })
})

describe('buildMap', () => {
  it('links only people who wrote in the same group, counting groups', () => {
    const { nodes, edges } = buildMap(
      [person('900000051'), person('900000052'), person('900000053')],
      new Map([
        ['g1', ['900000051', '900000052']],
        ['g2', ['900000052', '900000051', '900000099']],
      ])
    )
    expect(nodes).toHaveLength(3)
    expect(edges).toEqual([{ a: '900000051', b: '900000052', shared: 2 }])
  })

  it('caps the pairs one crowded group can make', () => {
    const ids = Array.from({ length: 40 }, (_, i) => String(900000010 + i))
    const { edges } = buildMap(
      ids.map(id => person(id)),
      new Map([['g', ids]])
    )
    expect(edges).toHaveLength((GROUP_PAIR_CAP * (GROUP_PAIR_CAP - 1)) / 2)
  })
})

describe('mapFor', () => {
  it('an owner with no conversations gets an empty map, not an error', async () => {
    const pool = { query: async () => ({ rows: [] }) }
    expect(await mapFor(pool, '900000050')).toEqual({ nodes: [], edges: [] })
  })

  it('a broken table costs that half, not the map', async () => {
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('crm_group_messages')) throw new Error('no table')
        if (sql.includes('count(*)'))
          return { rows: [{ lead_id: '900000051', n: 4, first_name: 'Ann' }] }
        return { rows: [{ lead_id: '900000051', text: 'my yoga retreat' }] }
      },
    }
    const map = await mapFor(pool, '900000050')
    expect(map.nodes).toEqual([
      expect.objectContaining({
        id: '900000051',
        name: 'Ann',
        sphere: 'health',
        talk: 4,
      }),
    ])
    expect(map.edges).toEqual([])
  })
})

describe('registry', () => {
  it('crm_map is a screen: registered, direct-call only, not in the compact kit', () => {
    expect(TOOLS.some(t => t.name === 'crm_map')).toBe(true)
    expect(DIRECT_CALL_ONLY.has('crm_map')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_map')).toBe(true)
  })
})
