import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'en', t: (key: string) => key }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * THE BUTTON FILLS A REAL, CONTROLLED REACT FIELD.
 *
 * A value assigned behind React's back is thrown away on the next render;
 * this pins that the text reaches the component's STATE, that "undo" puts
 * the person's own words back, and that a password field never gets the
 * button at all.
 */
let requested: unknown = null
vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    requested = JSON.parse(String(init?.body ?? '{}'))
    return new Response(JSON.stringify({ text: 'Written by AI' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
)

const seen = { value: '' }
function Form() {
  const [v, setV] = useState('mine')
  seen.value = v
  return (
    <form>
      <textarea
        placeholder="About the project"
        value={v}
        onChange={e => setV(e.target.value)}
      />
      <input type="password" placeholder="Password" />
    </form>
  )
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  requested = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function show() {
  const { AiFillLayer } = await import('./AiFillLayer')
  await act(async () => {
    root.render(
      <>
        <Form />
        <AiFillLayer />
      </>
    )
  })
}
const tick = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })

describe('AiFillLayer', () => {
  it('fills the controlled field, and undo gives the old text back', async () => {
    await show()
    const area = host.querySelector('textarea')!
    await act(async () => area.focus())
    const btn = [...host.querySelectorAll('.ai-fill__btn')].find(b =>
      b.textContent?.includes('aiFill.short')
    ) as HTMLButtonElement
    expect(btn).toBeTruthy()
    await act(async () => btn.click())
    await tick()
    expect(seen.value).toBe('Written by AI')
    expect(requested).toMatchObject({
      field: { current: 'mine', multiline: true },
    })
    const undo = host.querySelector('.ai-fill__btn--undo') as HTMLButtonElement
    await act(async () => undo.click())
    expect(seen.value).toBe('mine')
  })

  it('offers nothing on a password field', async () => {
    await show()
    const pwd = host.querySelector('input[type="password"]') as HTMLInputElement
    await act(async () => pwd.focus())
    expect(host.querySelector('.ai-fill__btn')).toBeNull()
  })
})
