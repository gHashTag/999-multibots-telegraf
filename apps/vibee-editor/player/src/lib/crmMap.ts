/**
 * WHERE EACH PERSON SITS ON THE MAP. Pure geometry, no React, tested.
 *
 * The owner is the centre. Each sphere of interest (render crm-map.ts) gets a
 * sector of the circle, wider the more people it holds; inside its sector a
 * person sits closer to the owner the more we have talked. So the picture
 * reads without a legend: the big wedge is where the owner's people are, the
 * inner ring is who the owner actually talks to.
 *
 * Deterministic: the same data draws the same map, so a person does not jump
 * around between visits and a test can pin a position.
 */

export interface MapNodeData {
  id: string
  name: string | null
  username: string | null
  avatarUrl: string | null
  sphere: string
  talk: number
}

export interface MapEdgeData {
  a: string
  b: string
  shared: number
}

export interface PlacedNode extends MapNodeData {
  x: number
  y: number
  r: number
}

export interface SphereLabel {
  sphere: string
  count: number
  x: number
  y: number
}

export interface MapLayout {
  size: number
  center: number
  ownerR: number
  nodes: PlacedNode[]
  labels: SphereLabel[]
}

export const FIRST_RING = 150
export const RING_STEP = 72
const GAP = 10
/** Half the widest sphere name, in map units: labels never cross the edge. */
export const LABEL_ROOM = 110

/** Bigger circle for somebody we talk to more; 18..30 units. */
export function radiusFor(talk: number): number {
  return Math.round(18 + Math.min(12, Math.log2(1 + Math.max(0, talk)) * 2))
}

export function layoutMap(nodes: MapNodeData[]): MapLayout {
  const bySphere = new Map<string, MapNodeData[]>()
  for (const n of nodes) {
    const list = bySphere.get(n.sphere) ?? []
    list.push(n)
    bySphere.set(n.sphere, list)
  }
  // `other` last: the named spheres are what the owner reads first.
  const spheres = [...bySphere.entries()].sort(
    (a, b) =>
      Number(a[0] === 'other') - Number(b[0] === 'other') ||
      b[1].length - a[1].length ||
      a[0].localeCompare(b[0])
  )
  const weight = (n: number) => Math.max(n, 2)
  const total = spheres.reduce((s, [, l]) => s + weight(l.length), 0) || 1
  const placed: Array<
    Omit<PlacedNode, 'x' | 'y'> & { a: number; ring: number }
  > = []
  const labelsAt: Array<{
    sphere: string
    count: number
    a: number
    ring: number
  }> = []
  let start = -Math.PI / 2
  for (const [sphere, list] of spheres) {
    const span = (2 * Math.PI * weight(list.length)) / total
    const people = [...list].sort(
      (a, b) => b.talk - a.talk || a.id.localeCompare(b.id)
    )
    let i = 0
    let ring = 0
    while (i < people.length) {
      const radius = FIRST_RING + ring * RING_STEP
      // How many circles of the widest size fit along this ring's arc.
      const fits = Math.max(1, Math.floor((span * radius) / (2 * 30 + GAP)))
      const here = people.slice(i, i + fits)
      here.forEach((p, k) => {
        placed.push({
          ...p,
          r: radiusFor(p.talk),
          a: start + (span * (k + 0.5)) / here.length,
          ring: radius,
        })
      })
      i += here.length
      ring++
    }
    labelsAt.push({
      sphere,
      count: list.length,
      a: start + span / 2,
      ring: FIRST_RING + ring * RING_STEP,
    })
    start += span
  }
  const outer = Math.max(
    FIRST_RING + RING_STEP,
    ...labelsAt.map(l => l.ring),
    ...placed.map(p => p.ring + p.r)
  )
  // Room past the outer ring for a sphere name drawn beside it.
  const center = outer + LABEL_ROOM
  const size = center * 2
  return {
    size,
    center,
    ownerR: 44,
    nodes: placed.map(({ a, ring, ...p }) => ({
      ...p,
      x: Math.round(center + ring * Math.cos(a)),
      y: Math.round(center + ring * Math.sin(a)),
    })),
    labels: labelsAt.map(l => ({
      sphere: l.sphere,
      count: l.count,
      x: Math.round(center + (l.ring - 20) * Math.cos(l.a)),
      y: Math.round(center + (l.ring - 20) * Math.sin(l.a)),
    })),
  }
}

/** The people one person is linked to, for "show their links". */
export function neighboursOf(id: string, edges: MapEdgeData[]): Set<string> {
  const out = new Set<string>()
  for (const e of edges) {
    if (e.a === id) out.add(e.b)
    if (e.b === id) out.add(e.a)
  }
  return out
}
