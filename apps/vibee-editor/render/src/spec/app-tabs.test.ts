import { describe, expect, it } from 'vitest'
import * as SPEC from './app-tabs.gen'
import { TOOLS_BY_NAME } from '../agent/tools'
import navigation from '../navigation.json'

/**
 * THE APP'S TABS ARE MAPPED IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/app-tabs.t27 is the spec of record; that the
 * vendored copy, its generated module and the host agree is held by
 * scripts/check-t27-specs.mjs. Here each `test` of the spec runs against the
 * generated values, and the map runs against the HOST: every tool it names is
 * registered at /mcp, and the app_tabs tool answers the map.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/app-tabs
 */

const tool = () => {
  const t = TOOLS_BY_NAME.get(SPEC.TOOL)
  if (!t) throw new Error(`no ${SPEC.TOOL}`)
  return t
}

describe('app-tabs.t27, its own tests', () => {
  it('twelve tabs, the seven destinations first in navigation order, the CRM last', () => {
    expect(SPEC.TAB_COUNT).toBe(12)
    expect(SPEC.TAB_KEYS[0]).toBe('hive')
    expect(SPEC.TAB_ROUTES[0]).toBe('/game')
    expect(SPEC.TAB_KEYS[1]).toBe('tasks')
    expect(SPEC.TAB_ROUTES[1]).toBe('/game/kanban')
    expect(SPEC.TAB_KEYS[10]).toBe('keys_xp')
    expect(SPEC.TAB_KEYS[11]).toBe('crm')
    expect(SPEC.TAB_ROUTES[11]).toBe('/crm')
  })

  it('the kanban reads the board, the ball and the public board, all three exact', () => {
    expect(SPEC.LINK_TAB[4]).toBe(1)
    expect(SPEC.LINK_TOOL[4]).toBe('hive_board')
    expect(SPEC.LINK_LABEL[4]).toBe(SPEC.L_EXACT)
    expect(SPEC.LINK_TOOL[5]).toBe('ball_board')
    expect(SPEC.LINK_LABEL[5]).toBe(SPEC.L_EXACT)
    expect(SPEC.LINK_TOOL[6]).toBe('t27_game')
    expect(SPEC.LINK_LABEL[6]).toBe(SPEC.L_EXACT)
  })

  it('the CRM tab is served by the tools the app itself calls', () => {
    expect(SPEC.LINK_TAB[42]).toBe(11)
    expect(SPEC.LINK_TOOL[42]).toBe('crm_clients')
    expect(SPEC.LINK_TAB[50]).toBe(11)
    expect(SPEC.LINK_TOOL[50]).toBe('crm_touch')
    expect(SPEC.LINK_LABEL[50]).toBe(SPEC.L_EXACT)
  })

  it('every link and every gap names a tab that exists, with a label that exists', () => {
    expect(SPEC.LINK_TAB.length).toBe(SPEC.LINK_COUNT)
    expect(SPEC.LINK_TOOL.length).toBe(SPEC.LINK_COUNT)
    expect(SPEC.LINK_LABEL.length).toBe(SPEC.LINK_COUNT)
    for (let i = 0; i < SPEC.LINK_COUNT; i += 1) {
      expect(SPEC.LINK_TAB[i]).toBeLessThan(SPEC.TAB_COUNT)
      expect(SPEC.LINK_LABEL[i]).toBeLessThanOrEqual(SPEC.L_UNKNOWN)
    }
    for (let g = 0; g < SPEC.GAP_COUNT; g += 1) {
      expect(SPEC.GAP_TAB[g]).toBeLessThan(SPEC.TAB_COUNT)
      expect(SPEC.GAP_LABEL[g]).toBeLessThanOrEqual(SPEC.L_UNKNOWN)
    }
  })

  it('the research view and Keys and XP have no tool yet, and say so as gaps', () => {
    expect(SPEC.GAP_TAB[5]).toBe(4)
    expect(SPEC.GAP_ROUTE[5]).toBe('/queen/public-research')
    expect(SPEC.GAP_TAB[14]).toBe(10)
    expect(SPEC.GAP_ROUTE[14]).toBe('/api/hive/keys')
    expect(SPEC.GAP_LABEL[4]).toBe(SPEC.L_UNKNOWN)
  })

  it('the unmapped views are the HUD views with no row', () => {
    expect(SPEC.UNMAPPED_COUNT).toBe(16)
    expect(SPEC.UNMAPPED_VIEWS[0]).toBe('comb')
    expect(SPEC.UNMAPPED_VIEWS[15]).toBe('widgets')
  })
})

describe('the map against this service', () => {
  it('every tool the map names is registered at /mcp, the t27 ones included', () => {
    const missing = SPEC.LINK_TOOL.filter(n => !TOOLS_BY_NAME.has(n))
    expect(missing).toEqual([])
  })

  it('the seven destinations are the ones navigation.json serves, in its order', () => {
    const dest = (navigation as any).destinations.map((d: any) => [d.id, d.route])
    const destTabs = [0, 1, 5, 6, 7, 8, 9]
    expect(dest).toEqual(destTabs.map(i => [SPEC.TAB_KEYS[i], SPEC.TAB_ROUTES[i]]))
  })

  it('every tab is served by a tool or declares the route it still reads', () => {
    for (let i = 0; i < SPEC.TAB_COUNT; i += 1) {
      const served = SPEC.LINK_TAB.some(t => t === i) || SPEC.GAP_TAB.some(t => t === i)
      expect([SPEC.TAB_KEYS[i], served]).toEqual([SPEC.TAB_KEYS[i], true])
    }
  })

  it('app_tabs answers the CRM tab with its tools, each one registered', async () => {
    const r: any = await tool().handler({ tab: 'crm' }, {} as any)
    expect(r.tabs).toHaveLength(1)
    expect(r.tabs[0].route).toBe('/crm')
    expect(r.tabs[0].tools.map((t: any) => t.name)).toContain('crm_clients')
    expect(r.tabs[0].tools.every((t: any) => t.registered && t.label === 'exact')).toBe(true)
  })

  it('app_tabs answers the kanban with its gaps, and the whole map without a tab', async () => {
    const one: any = await tool().handler({ tab: 'tasks' }, {} as any)
    expect(one.tabs[0].gaps.map((g: any) => g.route)).toContain('/api/card-move')
    const all: any = await tool().handler({}, {} as any)
    expect(all.tabs.map((t: any) => t.key)).toEqual([...SPEC.TAB_KEYS])
    expect(all.unmapped).toEqual([...SPEC.UNMAPPED_VIEWS])
  })
})
