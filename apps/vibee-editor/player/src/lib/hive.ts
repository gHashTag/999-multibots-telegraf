/**
 * THE HIVE -- THE GAME'S DATA, READ STRAIGHT FROM THE QUEEN.
 *
 * Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game as
 * another tab with all its sub-tabs", "we are building a social network for
 * developers through engagement via this game".
 *
 * WHAT THE GAME ACTUALLY IS (measured 2026-09-07)
 *
 * The page at t27.ai/#/queen is a 3-D viewer over six views, and every one of
 * them is fed by a URL we can call too:
 *
 *   COMB / KANBAN     /queen/public-board      cards in six columns
 *   TECHNOLOGY TREE   /queen/public-research   40 nodes, 48 edges, 6 layers
 *   FACTORY           /queen/status +
 *                     /queen/public-hardware   4 bee slots; a signed payload
 *   MISSION MAP       t27.ai/queen/foundation.json   epics, releases, rings
 *   SPECS             t27.ai/t27/manifest.json       the spec corpus
 *
 * WHY THE BROWSER CALLS THEM DIRECTLY AND NOT THROUGH OUR SERVER
 *
 * Measured, not assumed: both origins answer `access-control-allow-origin: *`.
 * A proxy on our render service would add a surface to keep in step, and would
 * make our server a single point of failure for a panel that is pure reading.
 * The Queen's own page fetches these the same way.
 *
 * WHY THIS TAB IS OPEN TO EVERYONE, WHILE THE `hive_queen` AGENT TOOL IS NOT
 *
 * That looks inconsistent and is not. The tool answers inside a chat where a
 * person's own money and events are discussed, and mixing platform internals
 * into that is how a bot owner ends up reading engineering state next to their
 * balance. This tab is a separate, clearly labelled destination whose source --
 * t27.ai/#/queen -- is already public with no authentication at all. Showing it
 * here reveals nothing that a browser did not already show anybody.
 *
 * SILENCE IS NOT ZERO
 *
 * Every fetcher reports `reachable`. "0 bees, 0 verdicts" and "she did not
 * answer" look identical on a dashboard and mean opposite things: a quiet hive,
 * or a blind one. The panel says which.
 */

const QUEEN = 'https://trios-agent-server-production.up.railway.app'
const T27 = 'https://t27.ai'

/**
 * How long to wait.
 *
 * Short on purpose: this is a status panel inside a Mini App on a phone. An
 * answer after ten seconds is not an answer, it is a frozen tab.
 */
const TIMEOUT_MS = 8000

export interface Fetched<T> {
  reachable: boolean
  data?: T
  why?: string
}

async function get<T>(url: string): Promise<Fetched<T>> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: stop.signal })
    if (!res.ok) throw new Error(`ответ ${res.status}`)
    return { reachable: true, data: (await res.json()) as T }
  } catch (e) {
    return {
      reachable: false,
      why: e instanceof Error ? e.message : String(e),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Defang text that came from another system.
 *
 * Titles, labels and evidence strings are written by the Queen and rendered
 * here. React escapes HTML, so this is not about injection -- it is about a
 * title with newlines wrecking a card, and a 4000-character "evidence" field
 * pushing everything else off a phone screen.
 */
export function clean(raw: unknown, max = 160): string {
  const s = (raw == null ? '' : String(raw)).replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}

// ── FACTORY ────────────────────────────────────────────────────────────────

export interface Bees {
  capacity: number
  active: number
  idle: number
}

export interface Factory {
  swarmState: string
  bees: Bees
  tickEverySeconds: number | null
  lastTickAt: string | null
  skippedLastTick: number
  /** The foundry payload is SIGNED; we show that it is, not the key material. */
  signed: { algorithm: string; keyId: string } | null
}

export async function loadFactory(): Promise<Fetched<Factory>> {
  const [status, hardware] = await Promise.all([
    get<any>(`${QUEEN}/queen/status`),
    get<any>(`${QUEEN}/queen/public-hardware`),
  ])
  if (!status.reachable) return { reachable: false, why: status.why }
  const s = status.data
  return {
    reachable: true,
    data: {
      swarmState: clean(s?.swarmState || 'unknown', 40),
      bees: {
        capacity: Number(s?.workers?.capacity ?? 0),
        active: Number(s?.workers?.active ?? 0),
        idle: Number(s?.workers?.idle ?? 0),
      },
      tickEverySeconds: Number(s?.scheduler?.intervalSeconds) || null,
      lastTickAt: s?.lastTick?.decidedAt ? String(s.lastTick.decidedAt) : null,
      skippedLastTick: Number(s?.lastTick?.skippedCount ?? 0),
      // The hardware endpoint returns publicKey, canonical and signature. Only
      // the fact of a signature is shown: key material on a dashboard is noise
      // that looks like a secret, and people screenshot dashboards.
      signed: hardware.reachable
        ? {
            algorithm: clean(hardware.data?.algorithm, 40),
            keyId: clean(hardware.data?.keyId, 40),
          }
        : null,
    },
  }
}

// ── COMB and KANBAN (one source, two readings) ─────────────────────────────

export interface Card {
  issue: number
  title: string
  column: string
}

export interface Board {
  repo: string
  columns: Array<{ key: string; title: string; blurb: string; count: number }>
  cards: Card[]
}

export async function loadBoard(): Promise<Fetched<Board>> {
  const r = await get<any>(`${QUEEN}/queen/public-board`)
  if (!r.reachable) return { reachable: false, why: r.why }
  const cards: Card[] = (Array.isArray(r.data?.cards) ? r.data.cards : []).map(
    (c: any) => ({
      issue: Number(c?.number ?? 0),
      title: clean(c?.title),
      column: clean(c?.column, 30),
    })
  )
  const declared: any[] = Array.isArray(r.data?.columns) ? r.data.columns : []
  return {
    reachable: true,
    data: {
      repo: clean(r.data?.repo, 60),
      // Columns come from HER, in her order. Hard-coding the six names here
      // would mean a seventh column appears on her board and silently vanishes
      // from ours -- with its cards.
      columns: declared.map(c => ({
        key: clean(c?.key, 30),
        title: clean(c?.title, 40),
        blurb: clean(c?.blurb, 80),
        count: cards.filter(x => x.column === c?.key).length,
      })),
      cards,
    },
  }
}

// ── TECHNOLOGY TREE ────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  label: string
  layer: string
  state: string
  maturity: string
}

export interface Tree {
  layers: string[]
  nodes: TreeNode[]
  edges: Array<{ from: string; to: string }>
  summary: {
    total: number
    researched: number
    researching: number
    locked: number
    percentage: number
  }
}

export async function loadTree(): Promise<Fetched<Tree>> {
  const r = await get<any>(`${QUEEN}/queen/public-research`)
  if (!r.reachable) return { reachable: false, why: r.why }
  const d = r.data
  return {
    reachable: true,
    data: {
      layers: (Array.isArray(d?.layers) ? d.layers : []).map((l: any) =>
        clean(l, 30)
      ),
      nodes: (Array.isArray(d?.nodes) ? d.nodes : []).map((n: any) => ({
        id: clean(n?.id, 60),
        label: clean(n?.label, 120),
        layer: clean(n?.layer, 30),
        state: clean(n?.state, 30),
        maturity: clean(n?.maturity, 30),
      })),
      edges: (Array.isArray(d?.edges) ? d.edges : []).map((e: any) => ({
        from: clean(e?.from, 60),
        to: clean(e?.to, 60),
      })),
      summary: {
        total: Number(d?.summary?.total ?? 0),
        researched: Number(d?.summary?.researched ?? 0),
        researching: Number(d?.summary?.researching ?? 0),
        locked: Number(d?.summary?.locked ?? 0),
        percentage: Number(d?.summary?.percentage ?? 0),
      },
    },
  }
}

// ── MISSION MAP ────────────────────────────────────────────────────────────

export interface Mission {
  repo: string
  rule: string
  epics: Array<{ title: string; ring: string }>
  releases: Array<{ name: string; at: string }>
  closedIssues: number
}

export async function loadMission(): Promise<Fetched<Mission>> {
  const r = await get<any>(`${T27}/queen/foundation.json`)
  if (!r.reachable) return { reachable: false, why: r.why }
  const d = r.data
  const epics: any[] = Array.isArray(d?.epics) ? d.epics : []
  const releases: any[] = Array.isArray(d?.releases) ? d.releases : []
  return {
    reachable: true,
    data: {
      repo: clean(d?.repo, 60),
      rule: clean(d?.rule, 200),
      // Capped: this file is 266 KB and a phone does not need all of it at
      // once. The cap is stated in the UI rather than silently applied.
      epics: epics.slice(0, 40).map(e => ({
        title: clean(e?.title ?? e?.name, 120),
        ring: clean(e?.ring ?? e?.layer, 30),
      })),
      releases: releases.slice(0, 12).map(r2 => ({
        name: clean(r2?.name ?? r2?.tag, 40),
        at: clean(r2?.publishedAt ?? r2?.at ?? r2?.date, 30),
      })),
      closedIssues: Array.isArray(d?.closedIssues)
        ? d.closedIssues.length
        : Number(d?.closedIssues ?? 0),
    },
  }
}

// ── SPECS ──────────────────────────────────────────────────────────────────

export interface Specs {
  specCount: number
  totalLines: number
  /** Per repository, because the mission is measured per engine. */
  repos: Array<{ repo: string; specs: number }>
  /** How many specs are healthy. `fail` is the number that needs a person. */
  health: { ok: number; warn: number; fail: number }
  categories: Array<{ name: string; count: number }>
  featured: Array<{ title: string; category: string }>
}

/**
 * The spec corpus. 759 KB.
 *
 * Loaded ONLY when this sub-tab is opened, never on tab mount: three quarters
 * of a megabyte on mobile data, for a panel the person may never look at, is a
 * cost paid by everyone for the benefit of a few.
 */
export async function loadSpecs(): Promise<Fetched<Specs>> {
  const r = await get<any>(`${T27}/t27/manifest.json`)
  if (!r.reachable) return { reachable: false, why: r.why }
  const d = r.data
  const cats = d?.categories
  return {
    reachable: true,
    data: {
      specCount: Number(d?.specCount ?? 0),
      totalLines: Number(d?.totalLines ?? 0),
      /*
       * NO INVENTED COVERAGE SCORE HERE.
       *
       * The mission is "every file generated from t27 rather than written by
       * hand", and her 3-D comb colours each cell T27 COVERED / MANUAL CODE /
       * AWAITING T27. The obvious move is to reproduce that split from
       * modules.json (115 modules) against manifest.json (760 specs).
       *
       * Measured 2026-09-07: it does not join. A spec's `module` is a spec
       * name -- `triformat-tf3`, `CoronaOracle` -- not a repository path;
       * matching by last path segment hits 13 of 115. A percentage built on
       * that would look authoritative and be wrong, and somebody would plan
       * against it. What is shown here is what is actually counted: specs per
       * engine and their health.
       */
      repos: (Array.isArray(d?.repos) ? d.repos : [])
        .slice(0, 20)
        .map((r2: any) => ({
          repo: clean(r2?.repo, 40),
          specs: Number(r2?.specs ?? 0),
        })),
      health: {
        ok: Number(d?.health?.ok ?? 0),
        warn: Number(d?.health?.warn ?? 0),
        fail: Number(d?.health?.fail ?? 0),
      },
      categories: Array.isArray(cats)
        ? cats.slice(0, 30).map((c: any) => ({
            name: clean(c?.name ?? c, 40),
            count: Number(c?.count ?? 0),
          }))
        : Object.entries(cats ?? {})
            .slice(0, 30)
            .map(([name, count]) => ({
              name: clean(name, 40),
              count: Number(count) || 0,
            })),
      featured: (Array.isArray(d?.featured) ? d.featured : [])
        .slice(0, 20)
        .map((f: any) => ({
          title: clean(f?.title ?? f?.name ?? f?.id, 120),
          category: clean(f?.category, 40),
        })),
    },
  }
}

// ── ACTIVITY (shown under COMB: the marks appearing on the board) ──────────

export interface Mark {
  kind: string
  issue: number | null
  title: string
  at: string
  state: string
}

export async function loadMarks(): Promise<Fetched<Mark[]>> {
  const r = await get<any>(`${QUEEN}/queen/public-activity`)
  if (!r.reachable) return { reachable: false, why: r.why }
  return {
    reachable: true,
    data: (Array.isArray(r.data?.events) ? r.data.events : [])
      .slice(0, 40)
      .map((e: any) => ({
        kind: clean(e?.kind, 30),
        issue: Number.isFinite(Number(e?.issue)) ? Number(e.issue) : null,
        title: clean(e?.title),
        at: clean(e?.at, 40),
        state: clean(e?.state, 30),
      })),
  }
}

/** The six views, in the Queen's own menu order. */
export const HIVE_TABS = [
  'comb',
  'specs',
  'kanban',
  'mission',
  'factory',
  'tree',
] as const

export type HiveTab = (typeof HIVE_TABS)[number]

export function isHiveTab(t: string | undefined): t is HiveTab {
  return HIVE_TABS.includes(t as HiveTab)
}
