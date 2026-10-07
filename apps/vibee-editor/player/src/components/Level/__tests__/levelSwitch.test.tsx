/**
 * THE LEVEL SWITCH SHOWS THE APP AS ANOTHER KIND OF PERSON, TO AN ADMIN ONLY.
 *
 * Owner, 2026-10-02: "a button in the menu to switch the user level, to test
 * the UI: admin, manager, blogger or developer; each level has its own CRM
 * dashboard". And: a person with a paid agent is not sold one again.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'jotai'
import { AGENT_PACKAGES, STORAGE_KEYS } from '@vibee/atoms'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const admin = vi.hoisted(() => ({ yes: true }))
vi.mock('@/config/admin', () => ({ isAdmin: () => admin.yes }))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'ru', setLang: () => {}, t: (k: string) => k }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root | null = null

function status(packages: { id: string; active: boolean; until?: string }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({
        ok: true,
        packages: packages.map(p => ({ until: null, ...p })),
      }),
    }))
  )
}

async function draw(node: React.ReactNode) {
  vi.resetModules()
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <Provider>
        <MemoryRouter>{node}</MemoryRouter>
      </Provider>
    )
  })
}

// Warm the transform of what harness() re-imports after resetModules, so no
// single test pays the cold compile inside its 5 s budget.
beforeAll(async () => {
  await import('../LevelSwitch')
  await import('../LevelDashboard')
}, 60_000)

beforeEach(() => {
  admin.yes = true
  vi.stubEnv('DEV', false)
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  status([])
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function harness() {
  const { LevelSwitch } = await import('../LevelSwitch')
  const { LevelDashboard } = await import('../LevelDashboard')
  const { useUserLevel } = await import('@/hooks/useUserLevel')
  function Screen() {
    const { level, switched } = useUserLevel()
    return (
      <>
        <LevelSwitch variant="chips" />
        <LevelDashboard level={level} switched={switched} lang="ru" />
      </>
    )
  }
  return Screen
}

const chip = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.level-switch__chip')].find(
    b => b.textContent === name
  )!
const dashboard = () => host.querySelector('[data-testid="level-dashboard"]')

describe('the level switch', () => {
  it('offers the four levels, and the admin starts as the admin', async () => {
    const Screen = await harness()
    await draw(<Screen />)
    const names = [...host.querySelectorAll('.level-switch__chip')].map(
      b => b.textContent
    )
    expect(names).toEqual(['Админ', 'Менеджер', 'Блогер', 'Разработчик']) // cyrillic-ok
    expect(dashboard()?.getAttribute('data-level')).toBe('admin')
  })

  it('switches the dashboard, remembers it, and goes back to the real one', async () => {
    const Screen = await harness()
    await draw(<Screen />)
    await act(async () => chip('Блогер').click()) // cyrillic-ok
    expect(dashboard()?.getAttribute('data-level')).toBe('blogger')
    expect(dashboard()?.textContent).toContain('тестовый вид') // cyrillic-ok
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEYS.viewLevel)!)
    ).toBe('blogger')
    await act(async () => chip('Мой').click()) // cyrillic-ok
    expect(dashboard()?.getAttribute('data-level')).toBe('admin')
  })

  it('is not there for a customer, and a stale switch in storage is ignored', async () => {
    admin.yes = false
    window.localStorage.setItem(STORAGE_KEYS.viewLevel, '"developer"')
    status([{ id: 'manager', active: true }])
    const Screen = await harness()
    await draw(<Screen />)
    expect(host.querySelector('[data-testid="level-switch"]')).toBeNull()
    expect(dashboard()?.getAttribute('data-level')).toBe('manager')
  })

  it('a customer with nothing paid sees the screen as it always was', async () => {
    admin.yes = false
    const Screen = await harness()
    await draw(<Screen />)
    expect(dashboard()).toBeNull()
  })
})

describe('a person who has an agent', () => {
  // A cold import of the agents page can outlast the 5 s test budget under a
  // loaded pre-push run; pay it once, outside the test, with its own budget.
  let MyAgentPackage: typeof import('../../Agents/MyAgentPackage').MyAgentPackage
  beforeAll(async () => {
    ;({ MyAgentPackage } = await import('../../Agents/MyAgentPackage'))
  }, 60_000)

  it('is shown their agent and the way back to the chat, the sale folded away', async () => {
    await draw(
      <MyAgentPackage
        level="blogger"
        lang="ru"
        packages={[
          { id: 'blogger', active: true, until: '2026-10-31T00:00:00.000Z' },
        ]}
      />
    )
    const blogger = AGENT_PACKAGES.find(p => p.id === 'blogger')!
    expect(host.querySelector('h2')?.textContent).toBe(blogger.name.ru)
    expect(host.textContent).toContain('Оплачен до 31 октября') // cyrillic-ok
    const links = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(links).toContain('/chat')
    expect(host.querySelector('details')?.hasAttribute('open')).toBe(false)
  })
})
