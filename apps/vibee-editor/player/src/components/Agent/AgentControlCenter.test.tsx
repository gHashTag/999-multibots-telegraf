import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SafeAgentActivityEvent } from '../../lib/agentControls'

const mocks = vi.hoisted(() => ({
  callAgentTool: vi.fn(),
  listAgentTools: vi.fn(),
}))

const registry = [
  {
    name: 'whoami',
    description: 'Подтверждённый профиль владельца',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'feed_stats',
    description: 'Статистика ленты владельца',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'content_plan_prepare',
    description: 'Контент-план только как черновик',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'draft', requiresOwnerApproval: false },
  },
]

vi.mock('jotai', () => ({
  useAtomValue: () => ({ username: 'owner', telegram_id: '101' }),
}))
vi.mock('@/atoms', () => ({ myProfileAtom: {} }))
vi.mock('../../lib/agentMcp', () => ({
  AGENT_MCP_URL: 'https://example.test/mcp',
  callAgentTool: mocks.callAgentTool,
  listAgentTools: mocks.listAgentTools,
}))

import { AgentControlCenter } from './AgentControlCenter'

const activity: SafeAgentActivityEvent[] = [
  {
    id: 'whoami:1',
    toolName: 'whoami',
    status: 'completed',
    durationMs: 18,
    occurredAt: '2026-08-24T08:00:00.000Z',
  },
]

async function flushUi() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('AgentControlCenter SAFE BETA', () => {
  let host: HTMLDivElement
  let root: Root
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard'
    )
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    mocks.listAgentTools.mockResolvedValue(registry)
    mocks.callAgentTool.mockImplementation(async (name: string) => {
      if (name === 'whoami') {
        return {
          telegram_id: '101',
          профиль: { username: 'owner', first_name: 'Owner' },
          опубликовано: 3,
        }
      }
      if (name === 'feed_stats') {
        return { авторов: 2, роликов: 12, просмотров: 345, лайков: 17 }
      }
      if (name === 'content_plan_prepare') {
        return {
          prepared: true,
          id: 'plan-1',
          topic: 'Контент моего профиля',
          plan: { goal: 'регулярный контент', days: 7 },
          status: 'draft',
          owner: '101',
          created_at: '2026-08-24T08:00:00.000Z',
        }
      }
      throw new Error(`unexpected SAFE BETA call: ${name}`)
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    if (clipboardDescriptor)
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.clearAllMocks()
  })

  it('offers only diagnostics, draft planning, read-only Activity and blocked external onboarding', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await act(async () =>
      root.render(<AgentControlCenter activity={activity} />)
    )
    await flushUi()

    expect(host.textContent).toContain('SAFE BETA')
    expect(host.textContent).toContain('3 / 3 live tools')
    expect(host.textContent).toContain('@Telegram owner')
    expect(host.textContent).toContain('Activity владельца · только чтение')
    expect(host.textContent).toContain('whoami')
    expect(host.textContent).toContain('18 мс')
    expect(host.textContent).toContain('Публикация выключена')
    expect(host.textContent).toContain('Платные действия выключены · quota 0')
    expect(host.textContent).not.toMatch(
      /Выпустить ключ|Отозвать ключ|approval_decide|voice_status|Пополнить баланс/
    )
    expect(host.textContent).not.toContain('trinity_mcp_live-secret-sentinel')
    expect(mocks.callAgentTool).not.toHaveBeenCalled()

    const copy = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Скопировать агенту')
    )
    expect(copy).toBeDefined()
    expect(copy!.disabled).toBe(true)
    copy!.click()
    expect(writeText).not.toHaveBeenCalled()
    expect(host.textContent).toContain(
      'Внешнее подключение временно недоступно'
    )
    expect(host.innerHTML).not.toMatch(
      /TRINITY_MCP_KEY|X-Agent-Key|trinity_mcp_|initData|curl|config\.toml/i
    )

    const diagnose = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Проверить профиль и статистику')
    )
    await act(async () => diagnose!.click())
    await flushUi()
    expect(host.textContent).toContain('@owner')
    expect(host.textContent).toContain('12 роликов')
    expect(host.textContent).toContain('345 просмотров')
    expect(
      [...host.querySelectorAll('.agent-control__event code')].map(
        node => node.textContent
      )
    ).toEqual(expect.arrayContaining(['whoami', 'feed_stats']))

    const plan = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Подготовить мой контент-план')
    )
    await act(async () => plan!.click())
    await flushUi()
    expect(mocks.callAgentTool).toHaveBeenCalledWith('content_plan_prepare', {
      topic: 'Контент моего профиля',
      goal: 'регулярный контент из моего профиля, публикаций и ассетов',
      days: 7,
    })
    expect(host.textContent).toContain('Черновик #plan-1')
    expect(host.textContent).toContain('публикация: нет')
    expect(host.textContent).toContain('платные действия: нет')
    expect(
      [...host.querySelectorAll('.agent-control__event code')].map(
        node => node.textContent
      )
    ).toContain('content_plan_prepare')
  })

  it('rejects a response that is not an explicit prepared draft', async () => {
    await act(async () => root.render(<AgentControlCenter />))
    await flushUi()
    mocks.callAgentTool
      .mockResolvedValueOnce({
        telegram_id: '101',
        профиль: { username: 'owner' },
        опубликовано: 3,
      })
      .mockResolvedValueOnce({
        prepared: true,
        id: 'unsafe-plan',
        plan: { days: 7 },
        status: 'draft',
        owner: '202',
        created_at: '2026-08-24T08:00:00.000Z',
      })

    const plan = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Подготовить мой контент-план')
    )
    await act(async () => plan!.click())
    await flushUi()

    expect(host.textContent).not.toContain('Черновик #unsafe-plan')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Действие не выполнено'
    )
    expect(host.querySelector('.agent-control__dot--failed')).not.toBeNull()
    expect(host.querySelector('.agent-control__event')?.textContent).toContain(
      'ошибка'
    )
  })

  it('clears the previous registry while a refresh is still unconfirmed', async () => {
    await act(async () => root.render(<AgentControlCenter />))
    await flushUi()

    let resolveRegistry!: (value: typeof registry) => void
    const pendingRegistry = new Promise<typeof registry>(resolve => {
      resolveRegistry = resolve
    })
    mocks.listAgentTools.mockReturnValueOnce(pendingRegistry)

    const refresh = host.querySelector<HTMLButtonElement>(
      '[aria-label="Обновить live registry"]'
    )
    await act(async () => {
      refresh!.click()
      await Promise.resolve()
    })

    const plan = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Подготовить мой контент-план')
    )
    expect(plan?.disabled).toBe(true)
    expect(host.textContent).toContain('0 / 3 live tools')

    await act(async () => {
      resolveRegistry(registry)
      await pendingRegistry
    })
    await flushUi()
    expect(plan?.disabled).toBe(false)
    expect(host.textContent).toContain('3 / 3 live tools')
  })

  it('does not render a credential-shaped server profile label', async () => {
    await act(async () => root.render(<AgentControlCenter />))
    await flushUi()
    mocks.callAgentTool
      .mockResolvedValueOnce({
        telegram_id: '101',
        профиль: { username: 'trinity_mcp_dom-secret-sentinel' },
        опубликовано: 3,
      })
      .mockResolvedValueOnce({
        авторов: 1,
        роликов: 3,
        просмотров: 10,
        лайков: 2,
      })

    const diagnose = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Проверить профиль и статистику')
    )
    await act(async () => diagnose!.click())
    await flushUi()

    expect(host.textContent).not.toContain('dom-secret-sentinel')
    expect(host.textContent).toContain('[скрыто]')
  })

  it('fails closed when tools/list exposes anything outside the exact registry', async () => {
    mocks.listAgentTools.mockResolvedValueOnce([
      ...registry,
      {
        name: 'feed_publish',
        inputSchema: {},
        annotations: { readOnlyHint: false, destructiveHint: false },
        _meta: {
          scope: 'owner',
          effect: 'publish',
          requiresOwnerApproval: false,
        },
      },
    ])

    await act(async () => root.render(<AgentControlCenter />))
    await flushUi()

    const plan = [...host.querySelectorAll('button')].find(button =>
      button.textContent?.includes('Подготовить мой контент-план')
    )
    expect(plan?.disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'registry'
    )
    expect(host.textContent).toContain('0 / 3 live tools')
    expect(host.textContent).not.toContain('feed_publish')
  })
})
