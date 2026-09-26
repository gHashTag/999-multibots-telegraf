import { describe, expect, it } from 'vitest'
import {
  FIRST_RING,
  LABEL_ROOM,
  layoutMap,
  neighboursOf,
  radiusFor,
  type MapNodeData,
} from './crmMap'

/**
 * THE MAP'S GEOMETRY: the owner in the centre, a sector per sphere, the
 * people we talk to most on the inner ring, and the same data drawing the
 * same picture every time.
 */
const node = (id: string, sphere: string, talk = 1): MapNodeData => ({
  id,
  name: null,
  username: null,
  avatarUrl: null,
  sphere,
  talk,
})
const dist = (x: number, y: number, c: number) => Math.hypot(x - c, y - c)

describe('layoutMap', () => {
  const people = [
    ...Array.from({ length: 30 }, (_, i) =>
      node(String(900000100 + i), 'content', 30 - i)
    ),
    node('900000201', 'tech', 5),
    node('900000202', 'other', 1),
  ]
  const l = layoutMap(people)

  it('places everybody, none on the owner', () => {
    expect(l.nodes).toHaveLength(people.length)
    for (const n of l.nodes)
      expect(dist(n.x, n.y, l.center)).toBeGreaterThanOrEqual(FIRST_RING - 1)
  })

  it('who we talk to most sits closer', () => {
    const most = l.nodes.find(n => n.id === '900000100')!
    const least = l.nodes.find(n => n.id === '900000129')!
    expect(dist(most.x, most.y, l.center)).toBeLessThan(
      dist(least.x, least.y, l.center)
    )
  })

  it('one label per sphere with its count, and the canvas holds them all', () => {
    expect(l.labels.map(x => [x.sphere, x.count])).toEqual([
      ['content', 30],
      ['tech', 1],
      ['other', 1],
    ])
    for (const x of l.labels) {
      expect(x.x - LABEL_ROOM).toBeGreaterThanOrEqual(0)
      expect(x.x + LABEL_ROOM).toBeLessThanOrEqual(l.size)
    }
    for (const n of l.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0)
      expect(n.x + n.r).toBeLessThanOrEqual(l.size)
    }
  })

  it('is deterministic', () => {
    expect(layoutMap([...people].reverse())).toEqual(l)
  })

  it('no two faces overlap', () => {
    for (let i = 0; i < l.nodes.length; i++)
      for (let j = i + 1; j < l.nodes.length; j++) {
        const a = l.nodes[i]
        const b = l.nodes[j]
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
          a.r + b.r
        )
      }
  })
})

describe('helpers', () => {
  it('radius grows with talk and stays bounded', () => {
    expect(radiusFor(0)).toBe(18)
    expect(radiusFor(10)).toBeGreaterThan(radiusFor(1))
    expect(radiusFor(1e6)).toBe(30)
  })

  it('neighboursOf reads both ends of an edge', () => {
    const edges = [
      { a: '900000001', b: '900000002', shared: 1 },
      { a: '900000003', b: '900000001', shared: 2 },
    ]
    expect([...neighboursOf('900000001', edges)].sort()).toEqual([
      '900000002',
      '900000003',
    ])
  })
})
