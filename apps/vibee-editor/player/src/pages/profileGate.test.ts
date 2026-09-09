import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { profileScreen } from '@/components/Profile/profileGate'

/**
 * YOUR PROFILE OPENS ONLY AFTER YOUR TELEGRAM IS CONNECTED.
 *
 * Owner, 2026-09-09: "the profile must not show until the person signed in by
 * phone; you cannot enter the user until you authorised through the phone — a
 * mandatory step, otherwise the agent does not work."
 *
 * The decision is a pure function (table below); the wiring is pinned
 * structurally so that the page really consults it and the connect flow really
 * reports back through the shared atom — a gate nobody flips would lock every
 * owner out forever, a gate nobody reads would be decoration.
 */
const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

describe('profileScreen', () => {
  it.each([
    [{ loading: true, own: true, connected: null }, 'skeleton'],
    [{ loading: true, own: false, connected: true }, 'skeleton'],
    [{ loading: false, own: false, connected: null }, 'profile'],
    [{ loading: false, own: false, connected: false }, 'profile'],
    [{ loading: false, own: true, connected: null }, 'skeleton'],
    [{ loading: false, own: true, connected: false }, 'welcome'],
    [{ loading: false, own: true, connected: true }, 'profile'],
    [
      { loading: false, own: true, connected: false, devBypass: true },
      'profile',
    ],
    // The welcome road (owner, 2026-09-09: value -> club -> Telegram -> SOUL).
    [{ loading: false, own: true, connected: true, club: null }, 'skeleton'],
    [{ loading: false, own: true, connected: true, club: false }, 'welcome'],
    // No "later": a connected person without the club stays on the road
    // whatever this session already saw (owner, 2026-09-09, evening).
    [
      { loading: false, own: true, connected: true, club: false, onRoad: true },
      'welcome',
    ],
    [
      { loading: false, own: true, connected: true, club: true, soul: null },
      'profile',
    ],
    [
      { loading: false, own: true, connected: true, club: true, soul: false },
      'welcome',
    ],
    [
      { loading: false, own: true, connected: true, club: true, soul: true },
      'profile',
    ],
    [
      {
        loading: false,
        own: true,
        connected: true,
        club: true,
        soul: null,
        onRoad: true,
      },
      'welcome',
    ],
    // Only the finished road (onRoad dropped by the page) opens the profile.
    [
      {
        loading: false,
        own: true,
        connected: true,
        club: true,
        soul: true,
        onRoad: true,
      },
      'welcome',
    ],
    // Somebody else's profile never sees the road, whatever the facts.
    [{ loading: false, own: false, connected: false, club: false }, 'profile'],
  ] as const)('%j -> %s', (input, expected) => {
    expect(profileScreen(input)).toBe(expected)
  })
})

describe('the gate is wired, not decorative', () => {
  const page = read('pages/Profile.tsx')
  const connect = read('components/Profile/ConnectTelegram.tsx')
  const gate = read('components/Profile/ProfileConnectGate.tsx')
  const road = read('components/Profile/WelcomeOnboarding.tsx')

  it('the page decides through profileScreen and renders the road for "welcome"', () => {
    expect(page).toContain('const screen = profileScreen({')
    expect(page).toMatch(
      /if \(screen === 'welcome'\) \{[\s\S]*<WelcomeOnboarding[\s\S]*onDone=\{finishWelcome\}/
    )
    expect(page).toContain("if (screen === 'skeleton')")
    expect(page).not.toMatch(/\n\s*if \(loading\) \{/)
  })

  it('the page feeds the road with server facts, not with a stored flag', () => {
    expect(page).toContain('club: clubActive,')
    expect(page).toContain('soul: soulExists,')
    expect(page).toContain('void loadClub()')
    expect(page).toContain('void loadSoul()')
  })

  it('the road itself contains the connect flow as one of its steps', () => {
    expect(road).toContain('<ConnectTelegram />')
    expect(road).toContain("step === 'connect'")
  })

  it('the page asks the server once for its own profile', () => {
    expect(page).toContain(
      'if (isOwn && connected === null) void loadConnected()'
    )
  })

  it('the connect flow reports every outcome into the shared atom', () => {
    expect(connect).toContain(
      "import { agentTelegramConnectedAtom } from '@/atoms/agentTelegram'"
    )
    // status read, status unreachable, disconnect, code accepted, password accepted
    expect(connect.match(/setConnected\(/g)?.length).toBeGreaterThanOrEqual(5)
    expect(connect).toContain("setConnected(!!d['подключено'])")
    expect(connect).toContain("if (!d['нужен_пароль']) setConnected(true)")
  })

  it('the gate screen is the same connect flow with one explaining sentence', () => {
    expect(gate).toContain('<ConnectTelegram />')
    expect(gate).toContain("t('profile.gate.title')")
    expect(gate).toContain("t('profile.gate.body')")
  })
})
