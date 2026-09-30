import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/config', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADMIN_IDS_ARRAY: [111, 222],
}))

import {
  agentPackageIntent,
  agentPackageOrderReply,
  agentPackageTeamNote,
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
