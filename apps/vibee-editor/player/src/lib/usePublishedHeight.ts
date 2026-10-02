import { useCallback, useRef } from 'react'

/**
 * A ref that publishes its element's height as a CSS variable on the
 * element's parent, and keeps it current while the element resizes.
 *
 * WHY. Something pinned under a pinned bar needs the bar's height as its
 * `top`. The CRM finder (search + chips) is 114px at 390px today; it grows
 * with a clear button, a wrapped chip row or a larger font. A number copied
 * into the stylesheet is true only until one of those moves (FeedPanel's
 * `--feed-chrome-top` was a measured 70px constant for the same reason).
 *
 * On the PARENT, not on documentElement: only siblings and their children
 * read it, and two copies of a page must not overwrite each other's value.
 *
 * A callback ref, not an effect: the CRM finder mounts only once the list
 * has been read, after the page's effects have run.
 */
export function usePublishedHeight(name: string) {
  const stop = useRef<(() => void) | null>(null)
  return useCallback(
    (el: HTMLElement | null) => {
      stop.current?.()
      stop.current = null
      const host = el?.parentElement
      if (!el || !host) return
      const publish = () =>
        host.style.setProperty(
          name,
          `${Math.round(el.getBoundingClientRect().height)}px`
        )
      publish()
      // jsdom has no ResizeObserver: the first value holds there.
      const ro =
        typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(publish)
          : null
      ro?.observe(el)
      stop.current = () => {
        ro?.disconnect()
        host.style.removeProperty(name)
      }
    },
    [name]
  )
}
