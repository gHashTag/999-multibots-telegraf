import { describe, it, expect } from 'vitest'
import { TOOLS, TOOLS_BY_NAME } from './src/agent/tools'

/**
 * EVERY TOOL APPEARS ONCE.
 *
 * Written after production listed `hive_pulse`, `hive_events` and `hive_queen`
 * TWICE each. Two branches had each added `TOOLS.push(...HIVE_TOOLS)` with its
 * own comment; the merge kept both, because adjacent additions are not a
 * textual conflict and git had no reason to ask.
 *
 * WHY NOTHING CAUGHT IT. `TOOLS_BY_NAME` is a Map, so the duplicates collapsed
 * there and every tool CALL kept working perfectly. The only visible damage was
 * on `tools/list` -- an MCP client handed the same tool twice, left to guess
 * whether the two entries differ. A defect that breaks nothing is the kind that
 * survives longest.
 *
 * The count check below is the load-bearing one: comparing the array against
 * the Map is exactly the comparison the Map was hiding.
 */
describe('the agent tool registry', () => {
  it('lists every tool exactly once', () => {
    const counts = new Map<string, number>()
    for (const t of TOOLS) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
    const doubled = [...counts.entries()].filter(([, n]) => n > 1)
    expect(
      doubled.map(([name, n]) => `${name} x${n}`),
      'a tool is registered more than once -- look for a duplicate TOOLS.push'
    ).toEqual([])
  })

  it('the array and the lookup map hold the same number of tools', () => {
    // The Map silently absorbs duplicates; the array does not. When these two
    // disagree, the array is the one telling the truth.
    expect(TOOLS.length).toBe(TOOLS_BY_NAME.size)
  })

  it('no tool has an empty or whitespace name', () => {
    // A nameless tool cannot be called and cannot be reported as missing.
    for (const t of TOOLS) expect(t.name.trim().length).toBeGreaterThan(0)
  })
})
