import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/s3Upload', () => ({ uploadToS3: vi.fn(async () => null) }))
vi.mock('@/components/BottomSheet/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: unknown }) => children,
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { ScenePhotoSheet } from './ScenePhotoSheet'

/**
 * A SCENE PHOTO THAT DOES NOT LOAD SHOWS THE EMPTY MARK.
 *
 * Her photos are signed links that expire. Before this, a dead one drew the
 * browser's broken-picture icon both in the big preview and in the grid.
 */
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

const render = () =>
  act(() =>
    root.render(
      <ScenePhotoSheet
        scene={0}
        current="https://x/dead.jpg"
        picked
        candidates={['https://x/dead.jpg', 'https://x/alive.jpg']}
        name="c1"
        onPick={() => {}}
        onClose={() => {}}
      />
    )
  )

const imgs = () => [...host.querySelectorAll('img')].map(i => i.src)

describe('ScenePhotoSheet: a photo that fails falls back', () => {
  it('draws every photo while they load', () => {
    render()
    expect(imgs()).toEqual([
      'https://x/dead.jpg',
      'https://x/dead.jpg',
      'https://x/alive.jpg',
    ])
  })

  it('replaces a dead link with the empty mark, everywhere it is shown', () => {
    render()
    act(() => {
      host
        .querySelector('img[src="https://x/dead.jpg"]')!
        .dispatchEvent(new Event('error'))
    })
    expect(imgs()).toEqual(['https://x/alive.jpg'])
    expect(host.querySelector('.scene-photo__big')!.textContent).toContain('◎')
    expect(
      host.querySelector('[data-testid="scene-photo-option-0"]')!.textContent
    ).toBe('◎')
  })
})
