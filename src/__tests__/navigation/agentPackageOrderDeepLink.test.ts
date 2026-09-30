import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/config', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADMIN_IDS_ARRAY: [111, 222],
}))

import {
  AGENT_PACKAGE_IDS,
  REPEAT_ORDER_WINDOW_MS,
  agentPackageIntent,
  agentPackageOrderReply,
  agentPackageTeamNote,
  forgetOrder,
  isRepeatOrder,
  notifyTeamOfPackageOrder,
} from '@/services/agentPackageOrder'
import { reelIntent } from '@/services/storyReel'
import { topupIntent, lookIntent } from '@/navigation/registerCommands'

const REPO = join(__dirname, '..', '..', '..')
const CATALOGUE = join(
  REPO,
  'apps/vibee-editor/packages/vibee-atoms/src/agent-packages.ts'
)

/** Package ids as the mini app's catalogue declares them -- read, not copied. */
function catalogueIds(): string[] {
  const src = readFileSync(CATALOGUE, 'utf8')
  const type = /export type AgentPackageId = ([^\n]+)/.exec(src)
  expect(type, 'AgentPackageId not found in the catalogue').not.toBeNull()
  return [...type![1].matchAll(/'([a-z]+)'/g)].map(m => m[1])
}

describe('the agent package order link', () => {
  it('is recognised for every package the mini app sells', () => {
    const ids = catalogueIds()
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(agentPackageIntent(`agentpkg_${id}`)).toBe(id)
  })

  it('knows exactly the packages the catalogue sells -- no more, no fewer', () => {
    expect([...AGENT_PACKAGE_IDS].sort()).toEqual(catalogueIds().sort())
  })

  it('does not turn a package nobody sells into an order', () => {
    for (const id of ['foo', 'assistant', 'creator', 'custom'])
      expect(agentPackageIntent(`agentpkg_${id}`), id).toBeNull()
  })

  it('uses the prefix the mini app builds its link with', () => {
    const src = readFileSync(CATALOGUE, 'utf8')
    expect(src).toMatch(/AGENT_PACKAGE_START_PREFIX = 'agentpkg_'/)
  })

  it('claims nothing else', () => {
    for (const other of [
      'agentpkg_',
      'agentpkg',
      'agentpkg_blogger_x',
      'agentpkg_../x',
      'reel',
      'topup',
      '900000012',
      '',
      undefined,
    ]) {
      expect(agentPackageIntent(other), `claimed ${String(other)}`).toBeNull()
    }
  })

  it('takes no other parser’s payload, and no other parser takes it', () => {
    expect(agentPackageIntent('reel')).toBeNull()
    expect(reelIntent('agentpkg_blogger')).toBe(false)
    expect(topupIntent('agentpkg_blogger')).toBeNull()
    expect(lookIntent('agentpkg_blogger')).toBeNull()
  })

  it('/start takes the order before the new-user scene, and greets no one on top', () => {
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toMatch(
      /agentPackageIntent\(startParam\)[\s\S]{0,200}orderedPackage = agentPackageIntent/
    )
    const notify = src.indexOf('await notifyTeamOfPackageOrder(')
    const newUser = src.indexOf('if (!userDetails.isExist)')
    expect(notify).toBeGreaterThan(0)
    expect(notify).toBeLessThan(newUser)
    expect(src).toMatch(/else if \(orderedPackage\) \{/)
  })

  it('/start tells the team once per repeat window, and frees an undelivered order', () => {
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    expect(src).toMatch(
      /if \(!isRepeatOrder\(ctx\.from\.id, orderedPackage\)\) \{[\s\S]{0,120}await notifyTeamOfPackageOrder\(/
    )
    expect(src).toMatch(
      /if \(delivered === 0\) forgetOrder\(ctx\.from\.id, orderedPackage\)/
    )
  })
})

describe('the order reaches the team and the person', () => {
  const who = { id: 900000077, username: 'someone', first_name: 'Some' }

  it('tells every admin, even when one cannot be reached', async () => {
    const sent: number[] = []
    const delivered = await notifyTeamOfPackageOrder(
      {
        sendMessage: async (chat: number) => {
          if (chat === 111) throw new Error('bot was blocked by the user')
          sent.push(chat)
        },
      },
      'blogger',
      who,
      'example_bot'
    )
    expect(delivered).toBe(1)
    expect(sent).toEqual([222])
  })

  it('counts zero when nobody on the team got it', async () => {
    const delivered = await notifyTeamOfPackageOrder(
      {
        sendMessage: async () => {
          throw new Error('chat not found')
        },
      },
      'manager',
      who
    )
    expect(delivered).toBe(0)
  })

  it('names the package, the person and the bot', () => {
    const note = agentPackageTeamNote('twin', who, 'example_bot')
    expect(note).toContain('twin')
    expect(note).toContain('@someone')
    expect(note).toContain('900000077')
    expect(note).toContain('@example_bot')
  })

  it('answers in the person’s language and quotes no price', () => {
    expect(agentPackageOrderReply(true)).toMatch(/Заявка/) // cyrillic-ok
    expect(agentPackageOrderReply(false)).toMatch(/request/)
    for (const reply of [
      agentPackageOrderReply(true),
      agentPackageOrderReply(false),
    ])
      expect(reply).not.toMatch(/\$\d/)
  })
})

describe('one order, however many presses', () => {
  it('tells the team once per person and package inside the window', () => {
    const t = 1_000_000
    expect(isRepeatOrder(900000101, 'blogger', t)).toBe(false)
    expect(isRepeatOrder(900000101, 'blogger', t + 1000)).toBe(true)
    expect(isRepeatOrder(900000101, 'twin', t + 1000)).toBe(false)
    expect(isRepeatOrder(900000102, 'blogger', t + 1000)).toBe(false)
    expect(
      isRepeatOrder(900000101, 'blogger', t + REPEAT_ORDER_WINDOW_MS + 1)
    ).toBe(false)
  })

  it('an undelivered order can be pressed again at once', () => {
    const t = 2_000_000
    expect(isRepeatOrder(900000103, 'manager', t)).toBe(false)
    forgetOrder(900000103, 'manager')
    expect(isRepeatOrder(900000103, 'manager', t + 1)).toBe(false)
  })

  it('never says "accepted" when the team did not get it', () => {
    for (const isRu of [true, false]) {
      const sent = agentPackageOrderReply(isRu, 'sent')
      const lost = agentPackageOrderReply(isRu, 'undelivered')
      const again = agentPackageOrderReply(isRu, 'repeat')
      expect(new Set([sent, lost, again]).size).toBe(3)
      expect(lost).not.toMatch(/принята|is in/) // cyrillic-ok
      expect(lost).toMatch(/Заказать|Order/) // cyrillic-ok
    }
  })
})
