// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createSafeActivityEvent,
  isExactSafeBetaRegistry,
  parsePreparedOwnerDraft,
  redactAgentStreamText,
  selectSafeBetaTools,
  verifiedOwnerId,
} from '../agentControls'
import type { McpToolDescription } from '../agentMcp'

const controlsSource = readFileSync(
  new URL('../agentControls.ts', import.meta.url),
  'utf8'
)
const ownerClientSources = [
  '../../atoms/avatarPhotos.ts',
  '../../atoms/soul.ts',
  '../../components/Profile/ProfileSkills.tsx',
  '../../components/Profile/ProfileFilesGrid.tsx',
  '../../components/Profile/ProfileTabs.tsx',
  '../../components/Profile/ProfileHeader.tsx',
]
  .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n')

const registry: McpToolDescription[] = [
  {
    name: 'whoami',
    description: 'verified profile',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'feed_stats',
    description: 'owner feed statistics',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'content_plan_prepare',
    description: 'draft-only content plan',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'draft', requiresOwnerApproval: false },
  },
  {
    name: 'feed_publish',
    description: 'must stay hidden',
    inputSchema: {},
    _meta: { scope: 'feed:publish', effect: 'publish' },
  },
  {
    name: 'voice_status',
    description: 'outside beta',
    inputSchema: {},
    _meta: { scope: 'profile:read', effect: 'read' },
  },
  {
    name: 'agent_access_issue',
    description: 'must stay hidden',
    inputSchema: {},
    _meta: { scope: 'access:manage', effect: 'write' },
  },
]

describe('SAFE BETA agent registry projection', () => {
  it('keeps only live read/draft tools from the exact beta allowlist', () => {
    expect(selectSafeBetaTools(registry).map(tool => tool.name)).toEqual([
      'whoami',
      'feed_stats',
      'content_plan_prepare',
    ])

    const mislabeled = registry.map(tool =>
      tool.name === 'whoami'
        ? { ...tool, _meta: { ...tool._meta, effect: 'paid' } }
        : tool
    )
    expect(
      selectSafeBetaTools(mislabeled).map(tool => tool.name)
    ).not.toContain('whoami')

    const incomplete = registry.map(tool =>
      tool.name === 'feed_stats'
        ? {
            ...tool,
            annotations: { readOnlyHint: true },
            _meta: { scope: 'owner', effect: 'read' },
          }
        : tool
    )
    expect(
      selectSafeBetaTools(incomplete).map(tool => tool.name)
    ).not.toContain('feed_stats')
    expect(isExactSafeBetaRegistry(registry.slice(0, 3))).toBe(true)
    expect(isExactSafeBetaRegistry(registry)).toBe(false)
    expect(isExactSafeBetaRegistry(incomplete.slice(0, 3))).toBe(false)
  })

  it('contains no external-key onboarding while issuance is release-blocked', () => {
    expect(controlsSource).not.toMatch(
      /TRINITY_MCP_KEY|X-Agent-Key|trinity_mcp_|config\.toml|env_http_headers/i
    )
  })

  it('creates Activity rows without accepting args, identity or secrets', () => {
    expect(
      createSafeActivityEvent(
        'content_plan_prepare',
        42,
        '2026-08-24T08:00:00.000Z'
      )
    ).toEqual({
      id: 'content_plan_prepare:2026-08-24T08:00:00.000Z',
      toolName: 'content_plan_prepare',
      status: 'completed',
      durationMs: 42,
      occurredAt: '2026-08-24T08:00:00.000Z',
    })
    expect(
      createSafeActivityEvent(
        'feed_publish',
        undefined,
        '2026-08-24T08:00:00.000Z'
      )
    ).toBeNull()
    expect(JSON.stringify(createSafeActivityEvent('whoami'))).not.toMatch(
      /key|token|initData|telegramId/i
    )
  })

  it('redacts credential-shaped stream fragments before they can reach the DOM', () => {
    const telegramToken = `123456789:${'A'.repeat(35)}`
    const xaiKey = `xai-${'B'.repeat(40)}`
    const zaiKey = `${'a'.repeat(32)}.${'C'.repeat(24)}`
    const jwt = `eyJ${'D'.repeat(12)}.eyJ${'E'.repeat(12)}.${'F'.repeat(16)}`
    const initData =
      'query_id=private-query&user=%7B%22id%22%3Aowner-secret%7D&auth_date=123&hash=signed-hash'
    const safe = redactAgentStreamText(
      [
        'Authorization: Bearer sk-live-secret',
        'X_Agent_Key=trinity_mcp_secret',
        `Telegram=${telegramToken}`,
        `xai=${xaiKey}`,
        `zai=${zaiKey}`,
        `jwt=${jwt}`,
        initData,
      ].join(' ')
    )

    expect(safe).not.toMatch(
      /live-secret|mcp_secret|private-query|owner-secret|signed-hash/
    )
    expect(safe).not.toContain(telegramToken)
    expect(safe).not.toContain(xaiKey)
    expect(safe).not.toContain(zaiKey)
    expect(safe).not.toContain(jwt)
    expect(safe.match(/\[скрыто\]/g)?.length).toBeGreaterThanOrEqual(7)
    expect(redactAgentStreamText('sk-')).toBe('[скрыто]')
  })

  it('keeps owner data clients free of browser-side agent-key fallbacks', () => {
    expect(ownerClientSources).not.toMatch(
      /VITE_AGENT_KEY|X-Agent-Key|\bdevKey\b/
    )
  })

  it('accepts only a complete draft receipt bound to the verified whoami owner', () => {
    const receipt = {
      prepared: true,
      id: 'plan-7',
      topic: 'Owner plan',
      plan: { goal: 'teach', days: 7 },
      status: 'draft',
      owner: '101',
      created_at: '2026-08-24T08:00:00.000Z',
    }

    expect(verifiedOwnerId(101)).toBe('101')
    expect(parsePreparedOwnerDraft(receipt, '101')).toEqual(receipt)
    expect(
      parsePreparedOwnerDraft({ ...receipt, owner: '202' }, '101')
    ).toBeNull()
    expect(
      parsePreparedOwnerDraft({ ...receipt, id: undefined }, '101')
    ).toBeNull()
    expect(
      parsePreparedOwnerDraft({ ...receipt, plan: undefined }, '101')
    ).toBeNull()
    expect(
      parsePreparedOwnerDraft({ ...receipt, created_at: 'not-a-date' }, '101')
    ).toBeNull()
    expect(
      parsePreparedOwnerDraft({ ...receipt, paid: true }, '101')
    ).toBeNull()
  })
})
