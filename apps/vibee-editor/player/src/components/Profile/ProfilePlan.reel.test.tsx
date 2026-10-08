import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePlan } from './ProfilePlan'

/**
 * A CARD OF THE PLAN, ONE PRESS FROM ITS REEL (plan-reel.t27).
 *
 * The plan answers which cards offer the press and what the next press makes
 * and costs; the screen names that price BEFORE the press, draws the reel
 * that came out as its picture, and presses my_story_reel with THAT card.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const admin = vi.hoisted(() => ({ yes: false }))
vi.mock('@/config/admin', () => ({ isAdmin: () => admin.yes }))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, v?: Record<string, unknown>) =>
      v ? `${key}:${JSON.stringify(v)}` : key,
  }),
}))

type Call = { name: string; args: Record<string, unknown> }

const PLAN = {
  reel_press: { scenes: 1, price_tokens: 86, busy: false },
  целей: 1, // cyrillic-ok: plan_list's own keys
  ['цели']: [
    // cyrillic-ok: plan_list's own keys
    {
      id: 1,
      цель: 'С нуля до чипа', // cyrillic-ok: plan_list's own keys
      ['карточки']: [
        // cyrillic-ok: plan_list's own keys
        {
          id: 10,
          название: 'FPGA — это сетка', // cyrillic-ok: plan_list's own keys
          статус: 'вышло', // cyrillic-ok: plan_list's own keys
          reel: 'https://bucket.example/reel-10.mp4',
        },
        {
          id: 11,
          название: 'Биты, триты и GF16', // cyrillic-ok: plan_list's own keys
          статус: 'замысел', // cyrillic-ok: plan_list's own keys
          press: true,
        },
        {
          id: 12,
          название: 'Какой это чип?', // cyrillic-ok: plan_list's own keys
          статус: 'в работе', // cyrillic-ok: plan_list's own keys
          making: true,
        },
        {
          id: 13,
          название: 'Тернарный сумматор', // cyrillic-ok: plan_list's own keys
          статус: 'вышло', // cyrillic-ok: plan_list's own keys
          reel: 'https://bucket.example/reel-13.mp4',
          poster: 'https://shelf.example/s3/reel-13.jpg',
        },
      ],
    },
  ],
}

describe('the plan, its cards and their reels', () => {
  let host: HTMLDivElement
  let root: Root
  let calls: Call[]
  const real = globalThis.fetch

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    calls = []
    admin.yes = false
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const { name, arguments: args } = body.params
      calls.push({ name, args })
      const answer =
        name === 'plan_list'
          ? PLAN
          : name === 'my_story_reel'
            ? { started: true, topic: 'Биты, триты и GF16', job: 7 }
            : { ['добавлено']: true, ['карточек']: 27 } // cyrillic-ok: the tool's keys
      return new Response(
        JSON.stringify({ result: { structuredContent: answer } })
      )
    }) as never
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    globalThis.fetch = real
  })

  const show = async () => {
    await act(async () => root.render(<ProfilePlan />))
    await act(async () => undefined)
  }

  it('names the trial and its price before the press', async () => {
    await show()
    const price = host.querySelector('[data-testid=plan-reel-price]')
    expect(price?.textContent).toBe(
      'plan.reel.trial:{"scenes":1,"price":"plan.reel.tokens:{\\"n\\":86}"}'
    )
  })

  it('only the idea card offers the press; the one being made says so', async () => {
    await show()
    const presses = host.querySelectorAll('[data-testid=plan-reel-make]')
    expect(presses).toHaveLength(1)
    expect(presses[0].closest('.profile-plan__item')?.textContent).toContain(
      'Биты, триты и GF16'
    )
    expect(host.textContent).toContain('plan.reel.making')
  })

  it('a reel that came out stands on its card as a picture that opens it', async () => {
    await show()
    const pic = host.querySelector<HTMLAnchorElement>('a.reel-preview')
    expect(pic?.getAttribute('href')).toBe('https://bucket.example/reel-10.mp4')
    expect(pic?.closest('.profile-plan__item')?.textContent).toContain(
      'FPGA — это сетка'
    )
    const video = pic?.querySelector('video')
    expect(video?.getAttribute('src')).toBe(
      'https://bucket.example/reel-10.mp4#t=1'
    )
    expect(video?.muted).toBe(true)
    expect(video?.autoplay).toBe(false)
  })

  it('a reel whose poster the server kept shows the poster, not the video (v3)', async () => {
    await show()
    const pic = [
      ...host.querySelectorAll<HTMLAnchorElement>('a.reel-preview'),
    ].find(a =>
      a.closest('.profile-plan__item')?.textContent?.includes('Тернарный')
    )
    expect(pic?.getAttribute('href')).toBe('https://bucket.example/reel-13.mp4')
    expect(pic?.querySelector('img')?.getAttribute('src')).toBe(
      'https://shelf.example/s3/reel-13.jpg'
    )
    expect(pic?.querySelector('video')).toBeNull()
  })

  it('the press makes THAT card, and says it is being made', async () => {
    await show()
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-testid=plan-reel-make]')!
        .click()
    )
    await act(async () => undefined)
    expect(calls.find(c => c.name === 'my_story_reel')?.args).toEqual({
      start: true,
      item_id: 11,
    })
    expect(host.textContent).toContain('plan.reel.started')
  })

  it("the course button is the admin's only, and takes the course in", async () => {
    await show()
    expect(host.querySelector('[data-testid=plan-course-add]')).toBeNull()
    await act(async () => root.unmount())
    root = createRoot(host)
    admin.yes = true
    await show()
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-testid=plan-course-add]')!
        .click()
    )
    await act(async () => undefined)
    expect(calls.some(c => c.name === 'plan_course_add')).toBe(true)
    expect(host.textContent).toContain('plan.course.added:{"n":27}')
  })
})
