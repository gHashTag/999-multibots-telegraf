import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueenCodingComposer } from './QueenCodingComposer'
import { swarmReason, type SwarmStatus } from './swarmReason'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * CODING AT THE QUEEN (owner, 2026-09-27). Two promises: the composer only lets
 * a DELEGATABLE task be dispatched, and the reason the swarm is idle is ALWAYS
 * visible (a blocker, never hidden). Rendered the way the player's other
 * component tests render -- createRoot + act, no testing-library.
 */

describe('swarmReason — why the bees are (not) working', () => {
  const base: SwarmStatus = {
    running: 0,
    slots: 4,
    candidates: 496,
    delegatable: 0,
  }

  it('idle with a full backlog and nothing delegatable names the real cause', () => {
    const r = swarmReason(base)
    expect(r.level).toBe('idle')
    expect(r.text).toContain('нечего выбрать')
    expect(r.text).toContain('496')
    expect(r.text).toContain('## Boundary')
  })

  it('a running swarm reads as working', () => {
    expect(swarmReason({ ...base, running: 2 }).level).toBe('work')
  })

  it('a stale engine and an unknown status are both SOS', () => {
    expect(swarmReason({ ...base, stale: true }).level).toBe('sos')
    expect(swarmReason(undefined).level).toBe('sos')
  })

  it('delegatable but none taken surfaces the refusal instead of hiding it', () => {
    const r = swarmReason({ ...base, delegatable: 3, refusal: 'boundary held' })
    expect(r.level).toBe('idle')
    expect(r.text).toContain('boundary held')
  })
})

describe('the composer gates dispatch on delegatability', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const mount = (el: React.ReactElement) => act(() => root.render(el))
  const sendBtn = (): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find(
      b => /рою/.test(b.textContent ?? '') // cyrillic-ok: matches the dispatch button
    ) as HTMLButtonElement | undefined
  const templateBtn = (): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find(
      b => /шаблон/.test(b.textContent ?? '') // cyrillic-ok: matches the template button
    ) as HTMLButtonElement | undefined

  it('always shows the swarm reason, even before typing', () => {
    mount(
      <QueenCodingComposer
        swarm={{ running: 0, slots: 4, candidates: 496, delegatable: 0 }}
      />
    )
    expect(host.textContent).toContain('нечего выбрать')
  })

  it('a task with no ## Boundary cannot be dispatched', () => {
    const onDispatch = vi.fn()
    mount(
      <QueenCodingComposer
        onDispatch={onDispatch}
        initialValue="просто почини это"
      />
    )
    const send = sendBtn()
    expect(send?.disabled).toBe(true)
    expect(host.textContent).toContain('рой возьмёт: нет')
    act(() => send?.click())
    expect(onDispatch).not.toHaveBeenCalled()
  })

  it('a task with a ## Boundary can be dispatched and hands over the body', () => {
    const onDispatch = vi.fn()
    mount(
      <QueenCodingComposer
        onDispatch={onDispatch}
        initialValue={'# Fix\n\n## Boundary\n- `src/a.ts`'}
      />
    )
    const send = sendBtn()
    expect(send?.disabled).toBe(false)
    expect(host.textContent).toContain('рой возьмёт: да')
    act(() => send?.click())
    expect(onDispatch).toHaveBeenCalledOnce()
    expect(onDispatch.mock.calls[0][0]).toContain('## Boundary')
  })

  it('the template button fills a body the swarm would take', () => {
    mount(<QueenCodingComposer />)
    act(() => templateBtn()?.click())
    expect(sendBtn()?.disabled).toBe(false)
  })
})
